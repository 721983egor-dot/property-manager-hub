import { createServerFn } from "@tanstack/react-start";

import type { AssistantAction, AssistantChatMessage, AssistantReply } from "@/lib/ai/types";

export type { AssistantAction, AssistantChatMessage, AssistantReply } from "@/lib/ai/types";

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { messages: AssistantChatMessage[] })
  .handler(async ({ data }): Promise<AssistantReply> => {
    const { askAssistantCore } = await import("@/lib/ai/run.server");
    return askAssistantCore(data.messages);
  });

/** Выполняет действие, подтверждённое менеджером. */
export const runAssistantAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { action: AssistantAction })
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const { executeAssistantAction } = await import("@/lib/ai/executors.server");
    const { absolutizeLinks } = await import("@/lib/telegram/links.server");
    const a = data.action;
    try {
      const message = await executeAssistantAction(a.tool, a.summary, a.input ?? "{}");
      return { ok: true, message: absolutizeLinks(message) };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Не удалось выполнить" };
    }
  });
