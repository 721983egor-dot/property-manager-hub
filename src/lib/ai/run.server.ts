import type { AssistantAction, AssistantChatMessage, AssistantReply } from "@/lib/ai/types";

export const ASSISTANT_SYSTEM_PROMPT = `Ты — Ассистент агентства долгосрочной аренды недвижимости «Residence More» в системе RM OS.
Отвечай всегда по-русски, коротко и по делу.

Данные читаешь НАПРЯМУЮ из базы RM OS через инструменты (Supabase на стороне Бегета). Модель OpenAI только формулирует ответ — факты только из инструментов и снимка ниже. Серверы Lovable не используются.

Как искать:
- Объект по внутреннему названию («Карат 1802», «ЛБ2 35к16, кв 12») — searchProperties.
- Свободные для подборки — searchProperties(status=free) и/или getCalendar (freeProperties). Для домов: type=house (также villa/townhouse). Не говори «нет свободных», пока инструмент не вернул count=0 / пустой freeProperties.
- Клиент забронировал или уже живёт (часто БЕЗ сделки CRM) — getClientHistory(ref) или getBookings(clientQuery) / getCurrentRentals / getCalendar(clientQuery). Смотри calendar.currentRentals и calendarBookings.
- CRM-сделки отдельно — getCrmDeals(clientQuery=…). Пустые сделки при наличии брони — нормально для жильцов до CRM; не говори «клиента нет» и не путай с отсутствием аренды.
- getDeals = синоним getBookings (календарь), НЕ CRM.
- Сколько объектов — сводка в снимке или searchProperties / getCalendar.summary.
- Прежде чем сказать «не нашёл» — вызови инструмент.

Правила:
- Факты только из инструментов/снимка.
- Объекты — внутреннее название + №ref_id; статус словами.
- В ответе по клиенту разделяй: «Календарь / текущая аренда» и «Сделки CRM».
- Изменения только propose*. Подборка — proposeSelection; после подтверждения полная https-ссылка.
- Статусы объектов: free, soon_free, booked, rented, archived. Брони: active, cancelled, completed.
- rememberSkill / forgetSkill / listSkills по просьбе.
- Соцсети компании (Instagram, VK, Telegram, Макс) — getSocialPosts / proposeSocialPost. Тексты и публикации — в разделе «Соцсети»; отсюда тоже можно предложить пост.`;

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

    const [skills, properties, profileRows, roleRows, bookingsRes] = await Promise.all([
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
    ]);

    allProperties = properties;
    calendarBookings = (bookingsRes.data ?? []) as typeof calendarBookings;
    if (bookingsRes.error) loadError = bookingsRes.error.message;

    const roleMap = new Map((roleRows.data ?? []).map((row) => [row.user_id, row.role]));
    staffLines = (profileRows.data ?? []).map((profile) => {
      const role = roleMap.get(profile.id) === "admin" ? "Администратор" : "Менеджер";
      return `- ${profile.full_name || "без ФИО"} | ${profile.email || "—"} | ${role}`;
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

    const liveContext = `\n\nСнимок базы RM OS (компактно; детали — через инструменты):
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
${staffLines.join("\n") || "- (нет)"}`;

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
