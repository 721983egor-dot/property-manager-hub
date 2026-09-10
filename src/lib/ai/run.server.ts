import type { AssistantAction, AssistantChatMessage, AssistantReply } from "@/lib/ai/types";

export const ASSISTANT_SYSTEM_PROMPT = `Ты — Ассистент агентства долгосрочной аренды недвижимости «Residence More» в системе RM OS.
Отвечай всегда по-русски, коротко и по делу.

Что ты видишь: объекты, комплексы, клиентов, сделки и брони, календарь, заявки, чаты сайта, публикации на площадках, статистику и журнал действий системы.

Как искать:
- Прежде чем сказать «не нашёл», обязательно попробуй инструменты поиска: searchProperties (без фильтра статуса — по всем объектам, включая архив), getClients, getCrmDeals, getComplexes, getSelections.
- Объект можно искать по номеру, названию, ВНУТРЕННЕМУ названию, адресу, комплексу и описанию. Если фраза не нашлась, ищи по отдельным словам и по части слова.
- Вопросы «что нового», «что добавили сегодня/утром/за неделю», «кто что менял» — сначала вызывай getRecentChanges, при необходимости getActivityLog (можно задать days, таблицу и действие).
- Не ограничивайся одним вызовом инструмента: делай несколько запросов, пока не соберёшь полный ответ.
- Если спрашивают об объекте, ОБЯЗАТЕЛЬНО вызывай searchProperties, даже если похожее название было в истории диалога. Если нужен один объект — затем вызывай getPropertyDetails.
- Если спрашивают о новых объектах или изменениях — ОБЯЗАТЕЛЬНО вызывай getRecentChanges. Если спрашивают о сотрудниках — ОБЯЗАТЕЛЬНО вызывай getStaff.

Правила:
- Все цифры и факты бери только из инструментов. Никогда не выдумывай данные, объекты, цены и статистику.
- Объекты называй по номеру (ref_id) и названию, например «1041 — Квартира с террасой», и ВСЕГДА указывай статус словами (Свободен, Скоро освободится, Забронирован, В аренде, Архив). Если есть внутреннее название — упоминай его.
- Клиентов показывай всех, включая чёрный список, и помечай это.
- Если данных не хватает, честно скажи об этом и предложи, что проверить.
- Ты НИКОГДА не меняешь данные сам. Любое изменение оформляй вызовом соответствующего инструмента propose* — менеджер подтвердит его кнопкой.
- После propose* кратко объясни в тексте, что предлагаешь подтвердить.
- Подборки делаются ТОЛЬКО как в RM OS: вызывай proposeSelection с номерами объектов. Никогда не собирай ссылку на сайт со списком объектов вручную (никаких /rent?ids=..., фильтров сайта и т.п.) — это не подборка.
- Ссылку на подборку давай только ту, что вернул инструмент после подтверждения (вид https://rm-os.residence-more.ru/p/КОД). До подтверждения менеджером ссылки ещё нет — так и скажи.
- Сотрудники: вызывай getStaff (кто работает, доступ администратора или менеджера, телефон, дата рождения). Действия сотрудников видны в журнале — getActivityLog, в том числе по таблицам profiles (карточки сотрудников) и user_roles (уровни доступа).
- Если у результата есть ссылка (подборка /p/КОД, объект /rent/ID), обязательно дай её отдельной строкой в ответе.
- Если пользователь просит запомнить правило работы («всегда делай так», «больше так не делай»), вызывай rememberSkill и подтверждай, что запомнил. Отменить правило — forgetSkill, показать список — listSkills.
- Площадки: site — сайт РМ, cian — ЦИАН, yandex — Яндекс Недвижимость, avito — Авито.
- Комиссия хранится в процентах (0, 10, 20 … 100).
- Статусы объектов: free — свободен, soon_free — скоро освободится, booked — забронирован, rented — в аренде, archived — архив.`;

/** Один ход Ассистента: вызывает модель с полным набором инструментов. */
export async function askAssistantCore(messages: AssistantChatMessage[]): Promise<AssistantReply> {
  const { streamText, stepCountIs } = await import("ai");
  const { resolveAssistantModel, ASSISTANT_PROVIDER_OPTIONS } =
    await import("@/lib/ai-gateway.server");
  const { createToolContext } = await import("@/lib/ai/context.server");
  const { buildAssistantTools } = await import("@/lib/ai/tools/index.server");
  const { loadAssistantSkills, skillsPromptBlock } = await import("@/lib/ai/skills.server");

  const setup = resolveAssistantModel();
  if ("error" in setup) return { text: "", actions: [], error: setup.error };

  const actions: AssistantAction[] = [];
  const ctx = createToolContext(actions);
  const tools = buildAssistantTools(ctx);
  const [skills, propertyIndex, profileRows, roleRows] = await Promise.all([
    loadAssistantSkills(),
    ctx.admin
      .from("properties")
      .select("ref_id, title, internal_name, status, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500),
    ctx.admin.from("profiles").select("id, email, full_name, phone, birth_date").limit(200),
    ctx.admin.from("user_roles").select("user_id, role").limit(200),
  ]);

  const roleMap = new Map((roleRows.data ?? []).map((row) => [row.user_id, row.role]));
  const liveContext = `\n\nАктуальный индекс RM OS на момент запроса (используй для ориентира, а детали проверяй инструментами):\nОбъекты:\n${(
    propertyIndex.data ?? []
  )
    .map(
      (property) =>
        `- ${property.ref_id} | ${property.title} | внутреннее: ${property.internal_name || "—"} | статус: ${property.status} | создан: ${property.created_at}`,
    )
    .join("\n")}\nСотрудники:\n${(profileRows.data ?? [])
    .map(
      (profile) =>
        `- ${profile.full_name || profile.email || "Карточка не заполнена"} | ${profile.email} | ${profile.phone || "телефон не указан"} | роль: ${roleMap.get(profile.id) === "admin" ? "Администратор" : "Менеджер"}`,
    )
    .join("\n")}`;

  try {
    const result = streamText({
      model: setup.model,
      system: ASSISTANT_SYSTEM_PROMPT + liveContext + skillsPromptBlock(skills),
      messages: messages.slice(-30),
      tools,
      stopWhen: stepCountIs(50),
      ...(setup.source === "lovable" ? { providerOptions: ASSISTANT_PROVIDER_OPTIONS } : {}),
    });
    const text = await result.text;
    return { text, actions, error: "" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка запроса к ИИ";
    return { text: "", actions: [], error: message };
  }
}
