import { createServerFn } from "@tanstack/react-start";

import type { AssistantAction, AssistantChatMessage, AssistantReply } from "@/lib/ai/types";

export type { AssistantAction, AssistantChatMessage, AssistantReply } from "@/lib/ai/types";

const SYSTEM_PROMPT = `Ты — Ассистент агентства долгосрочной аренды недвижимости «Residence More» в системе RM OS.
Отвечай всегда по-русски, коротко и по делу, используй markdown (списки, таблицы) там, где это помогает.

Что ты видишь: объекты, комплексы, клиентов, сделки и брони, календарь, заявки, чаты сайта, публикации на площадках, статистику и журнал действий системы.

Правила:
- Все цифры и факты бери только из инструментов. Никогда не выдумывай данные, объекты, цены и статистику.
- Объекты называй по номеру (ref_id) и названию, например «1041 — Квартира с террасой».
- Если данных не хватает, честно скажи об этом и предложи, что проверить.
- Ты НИКОГДА не меняешь данные сам. Любое изменение оформляй вызовом соответствующего инструмента propose* — менеджер подтвердит его кнопкой.
- После propose* кратко объясни в тексте, что предлагаешь подтвердить.
- Площадки: site — сайт РМ, cian — ЦИАН, yandex — Яндекс Недвижимость, avito — Авито.
- Комиссия хранится в процентах (0, 10, 20 … 100).
- Статусы объектов: free — свободен, soon_free — скоро освободится, booked — забронирован, rented — в аренде, archived — архив.`;

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { messages: AssistantChatMessage[] })
  .handler(async ({ data }): Promise<AssistantReply> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { text: "", actions: [], error: "ИИ не настроен: нет ключа доступа." };

    const { streamText, stepCountIs } = await import("ai");
    const { createLovableAiGatewayProvider, ASSISTANT_MODEL, ASSISTANT_PROVIDER_OPTIONS } =
      await import("@/lib/ai-gateway.server");
    const { createToolContext } = await import("@/lib/ai/context.server");
    const { buildAssistantTools } = await import("@/lib/ai/tools/index.server");

    const actions: AssistantAction[] = [];
    const ctx = createToolContext(actions);
    const tools = buildAssistantTools(ctx);

    try {
      const gateway = createLovableAiGatewayProvider(apiKey);
      const result = streamText({
        model: gateway(ASSISTANT_MODEL),
        system: SYSTEM_PROMPT,
        messages: data.messages.slice(-30),
        tools,
        stopWhen: stepCountIs(50),
        providerOptions: ASSISTANT_PROVIDER_OPTIONS,
      });
      const text = await result.text;
      return { text, actions, error: "" };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Ошибка запроса к ИИ";
      return { text: "", actions: [], error: message };
    }
  });

/** Выполняет действие, подтверждённое менеджером. */
export const runAssistantAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { action: AssistantAction })
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const { executeAssistantAction } = await import("@/lib/ai/executors.server");
    const a = data.action;
    try {
      const message = await executeAssistantAction(a.tool, a.summary, a.input ?? "{}");
      return { ok: true, message };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Не удалось выполнить" };
    }
  });
