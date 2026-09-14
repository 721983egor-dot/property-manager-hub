import type { AssistantAction, AssistantChatMessage, AssistantReply } from "@/lib/ai/types";

export const ASSISTANT_SYSTEM_PROMPT = `Ты — Ассистент RM OS, системы управления компанией.
В RM OS для удобства два отдельных проекта:
- Резиденция Море — долгосрочная аренда и управление недвижимостью (сайт residence-more.ru относится только к нему);
- Н11 Резиденция — апарт-отель на Навагинской в Сочи, отдельный проект (сайт n11-residence.ru, его здесь не ведём).
Календарь общий: номера Н11 сверху, объекты Резиденция Море ниже. Клиенты в одной базе, папки «Клиенты Н11» и «Клиенты РМ».
Отвечай всегда по-русски, коротко и по делу.

Данные читаешь НАПРЯМУЮ из базы RM OS через инструменты (Supabase на стороне Бегета). Модель OpenAI только формулирует ответ — факты только из инструментов и снимка ниже. Серверы Lovable не используются.

Как искать:
- Объект по внутреннему названию («Карат 1802», «ЛБ2 35к16, кв 12») — searchProperties.
- Свободные для подборки — searchProperties(status=free) и/или getCalendar (freeProperties). Для домов: type=house (также villa/townhouse). Не говори «нет свободных», пока инструмент не вернул count=0 / пустой freeProperties.
- Клиент забронировал или уже живёт (часто БЕЗ сделки CRM) — getClientHistory(ref) или getBookings(clientQuery) / getCurrentRentals / getCalendar(clientQuery). Смотри calendar.currentRentals и calendarBookings.
- Гости и загрузка апарт-отеля — getHotelOverview / getHotelOccupancy / getHotelOwners / getClients(portfolio=n11). Синхронизация PMS — getBnovoSync; выгрузку предлагай proposeBnovoSync. Брони Bnovo садятся на категорию (Стандарт Плюс: 546 и 567, Делюкс: 526 и 530), конкретный номер менеджер выбирает при заселении. Если бронь удалили или отменили в Bnovo, выгрузка снимает её и в календаре RM OS.
- CRM-сделки отдельно — getCrmDeals(clientQuery=…). Пустые сделки при наличии брони — нормально для жильцов до CRM; не говори «клиента нет» и не путай с отсутствием аренды.
- Задачи сотрудников — getTasks / getTask / getTaskTypes. Канбан по дате: сегодня, просроченные, эта/следующая неделя, без срока. Календарь показывает только задачи с датой и временем, цвет — по типу. Чеклист — отдельные пункты (proposeTaskItem). Создание и перенос — proposeTask / proposeCompleteTask / proposePostponeTask. Типы — proposeTaskType.
- getDeals = синоним getBookings (календарь), НЕ CRM.
- Сколько объектов — сводка в снимке или searchProperties / getCalendar.summary.
- Прежде чем сказать «не нашёл» — вызови инструмент.

Правила:
- Факты только из инструментов/снимка.
- Объекты — внутреннее название + №ref_id; статус словами.
- В ответе по клиенту разделяй: «Календарь / текущая аренда» и «Сделки CRM». Н11 Резиденция называй отдельно от Резиденция Море.
- Изменения только propose*. Подборка — proposeSelection; после подтверждения полная https-ссылка.
- Статусы объектов: free, soon_free, booked, rented, archived. Брони: active, cancelled, completed.
- rememberSkill / forgetSkill / listSkills по просьбе.
- Соцсети компании (Instagram, VK, Telegram, Макс) — getSocialPosts / proposeSocialPost. Ссылку на карточку в текст не пиши: поле «Ссылка на объект», в посте видно https://residence-more.ru/. Тексты и публикации — в разделе «Соцсети».
- Пульс Сочи (погода, новости, события) — getSochiPulse. Пост по городу пиши только из фактов пульса и привязывай pulseItemId. Если по теме уже есть пост — скажи.`;

const STATUS_LABEL: Record<string, string> = {
  free: "Свободен",
  soon_free: "Скоро освободится",
  booked: "Забронирован",
  rented: "В аренде",
  archived: "Архив",
};

/** Один ход Ассистента: вызывает модель с полным набором инструментов. */
export async function askAssistantCore(messages: AssistantChatMessage[]): Promise<AssistantReply> {
  const { streamText, stepCountIs } = await import("ai");
  const { resolveAssistantModel } = await import("@/lib/ai-gateway.server");
  const { createToolContext, propertyLabel } = await import("@/lib/ai/context.server");
  const { buildAssistantTools } = await import("@/lib/ai/tools/index.server");
  const { loadAssistantSkills, skillsPromptBlock } = await import("@/lib/ai/skills.server");

  const setup = resolveAssistantModel();
  if ("error" in setup) return { text: "", actions: [], error: setup.error };

  const actions: AssistantAction[] = [];
  const ctx = createToolContext(actions);
  const tools = buildAssistantTools(ctx);

  let allProperties: Record<string, unknown>[] = [];
  let calendarBookings: {
    property_id: string;
    client_id: string;
    start_date: string;
    end_date: string;
    price_month: number | null;
    status: string;
    clients?: { full_name?: string; phone?: string } | { full_name?: string; phone?: string }[] | null;
  }[] = [];
  let staffLines: string[] = [];
  let loadError = "";

  try {
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const until = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);

    const [skills, properties, profileRows, roleRows, bookingsRes, openTasksRes] = await Promise.all([
      loadAssistantSkills(),
      ctx.allProperties(),
      ctx.admin
        .from("profiles")
        .select("id, email, full_name, phone")
        .order("created_at", { ascending: true })
        .limit(200),
      ctx.admin.from("user_roles").select("user_id, role").limit(200),
      // Как listStaffBookings в календаре: overlap + clients join, без cancelled.
      ctx.admin
        .from("bookings")
        .select(
          "property_id, client_id, start_date, end_date, price_month, status, clients(full_name, phone)",
        )
        .neq("status", "cancelled" as never)
        .lte("start_date", until)
        .gte("end_date", from)
        .order("start_date", { ascending: true })
        .limit(250),
      ctx.admin
        .from("tasks")
        .select("id, title, due_date, due_start, due_end, status, assignee_id")
        .eq("status", "open")
        .order("due_date", { ascending: true })
        .limit(80),
    ]);

    allProperties = properties;
    calendarBookings = (bookingsRes.data ?? []) as typeof calendarBookings;
    if (bookingsRes.error) loadError = bookingsRes.error.message;

    const roleMap = new Map((roleRows.data ?? []).map((row) => [row.user_id, row.role]));
    staffLines = (profileRows.data ?? []).map((profile) => {
      const role = roleMap.get(profile.id) === "admin" ? "Администратор" : "Менеджер";
      return `- ${profile.full_name || "без ФИО"} | ${profile.email || "—"} | ${role}`;
    });
    const staffNameById = new Map(
      (profileRows.data ?? []).map((profile) => [profile.id, profile.full_name || profile.email || "сотрудник"]),
    );
    const openTaskLines = (openTasksRes.data ?? []).slice(0, 40).map((task) => {
      const when = task.due_date
        ? `${task.due_date}${task.due_start ? ` ${String(task.due_start).slice(0, 5)}${task.due_end ? `–${String(task.due_end).slice(0, 5)}` : ""}` : ""}`
        : "без срока";
      const who = task.assignee_id ? staffNameById.get(task.assignee_id) ?? "" : "";
      return `- ${task.title || "Без названия"} | ${when}${who ? ` | ${who}` : ""}`;
    });

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const freeByType: Record<string, number> = {};
    for (const property of allProperties) {
      const status = String(property["status"] ?? "");
      const type = String(property["type"] ?? "other");
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      byType[type] = (byType[type] ?? 0) + 1;
      if (status === "free") freeByType[type] = (freeByType[type] ?? 0) + 1;
    }

    const propertyNameById = new Map(
      allProperties.map((p) => [
        String(p["id"]),
        propertyLabel(p as { ref_id: number; title: string; internal_name?: string | null }),
      ]),
    );

    const freeHouses = allProperties
      .filter(
        (p) =>
          p["status"] === "free" &&
          (p["type"] === "house" || p["type"] === "villa" || p["type"] === "townhouse"),
      )
      .map((p) =>
        propertyLabel(p as { ref_id: number; title: string; internal_name?: string | null }),
      );

    const freeApartments = allProperties
      .filter(
        (p) =>
          p["status"] === "free" && (p["type"] === "apartment" || p["type"] === "aparts"),
      )
      .slice(0, 40)
      .map((p) =>
        propertyLabel(p as { ref_id: number; title: string; internal_name?: string | null }),
      );

    const today = new Date().toISOString().slice(0, 10);
    const formatBookingLine = (b: (typeof calendarBookings)[number]) => {
      const prop = propertyNameById.get(b.property_id) ?? b.property_id;
      const raw = b.clients;
      const clientObj = Array.isArray(raw) ? raw[0] : raw;
      const client = clientObj?.full_name ?? "клиент";
      return `- ${client} → ${prop}: ${b.start_date} — ${b.end_date} (${b.status})`;
    };
    const currentLiving = calendarBookings.filter(
      (b) => b.start_date <= today && b.end_date >= today,
    );
    const bookingLines = calendarBookings.slice(0, 60).map(formatBookingLine);
    const currentLines = currentLiving.slice(0, 40).map(formatBookingLine);

    const n11Rooms = allProperties.filter((p) => p["portfolio"] === "n11");
    const rmRooms = allProperties.filter((p) => p["portfolio"] !== "n11");

    const liveContext = `\n\nСнимок базы RM OS (компактно; детали — через инструменты):
Два проекта в RM OS: Резиденция Море (${rmRooms.length} объектов, долгосрочная аренда) и Н11 Резиденция (${n11Rooms.length} номеров, апарт-отель). Календарь общий, Н11 сверху.
Всего объектов: ${allProperties.length}
По типу: ${Object.entries(byType)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ") || "—"}
По статусу: ${Object.entries(byStatus)
      .map(([k, v]) => `${STATUS_LABEL[k] ?? k}=${v}`)
      .join(", ") || "—"}
Свободных по типу: ${Object.entries(freeByType)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ") || "0"}
Броней календаря (без отменённых, ${from}…${until}): ${calendarBookings.length}
Сейчас живут / текущая аренда (календарь, на ${today}): ${currentLiving.length}${loadError ? `\nЗамечание по броням: ${loadError}` : ""}
Важно: календарь и текущая аренда ≠ сделки CRM. У клиентов до CRM часто есть только бронь.

Свободные дома/виллы/таунхаусы (${freeHouses.length}):
${freeHouses.map((n) => `- ${n}`).join("\n") || "- (нет)"}

Свободные квартиры (до 40 из ${freeByType["apartment"] ?? 0}):
${freeApartments.map((n) => `- ${n}`).join("\n") || "- (нет)"}

Сейчас живут (до 40):
${currentLines.join("\n") || "- (нет)"}

Брони календаря с клиентами (до 60):
${bookingLines.join("\n") || "- (нет броней в периоде)"}

Сотрудники:
${staffLines.join("\n") || "- (нет)"}

Открытые задачи (до 40 из ${openTasksRes.data?.length ?? 0}):
${openTaskLines.join("\n") || "- (нет)"}`;

    try {
      const result = streamText({
        model: setup.model,
        system: ASSISTANT_SYSTEM_PROMPT + liveContext + skillsPromptBlock(skills),
        messages: messages.slice(-20),
        tools,
        stopWhen: stepCountIs(30),
      });
      const text = await result.text;
      return { text, actions, error: "" };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Ошибка запроса к ИИ";
      console.error("askAssistantCore model failed", e);
      return {
        text: "",
        actions: [],
        error:
          message === "fetch failed"
            ? "Не удалось связаться с моделью ИИ (fetch failed). Данные базы доступны — повторите короткий вопрос."
            : message,
      };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка загрузки данных RM OS";
    console.error("askAssistantCore data failed", e);
    return { text: "", actions: [], error: message };
  }
}
