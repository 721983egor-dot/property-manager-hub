import { z } from "zod";

export const inboxRulePrefix = "Правило из проверки ответа: ";

export const inboxThreadInput = z.object({ threadId: z.string().uuid() });
export const inboxVersionInput = inboxThreadInput.extend({ version: z.string().uuid() });
export const inboxCorrectionInput = inboxVersionInput.extend({
  correction: z.string().trim().min(3).max(1000),
});
export const inboxSendInput = inboxVersionInput.extend({
  body: z.string().trim().min(1).max(2000),
});
export const inboxRuleInput = inboxVersionInput.extend({
  rule: z.string().trim().min(20).max(400),
});
export type InboxDraft = {
  thread_id: string;
  inbound_id: string;
  version: string;
  status:
    | "queued"
    | "preparing"
    | "ready"
    | "rejected"
    | "sending"
    | "sent"
    | "error"
    | "delivery_unknown";
  revision: string | null;
  draft: string | null;
  corrections: string[];
  completed_rule: string | null;
  updated_at: string;
};

export const inboxStatuses: Record<InboxDraft["status"], string> = {
  queued: "В очереди",
  preparing: "Готовит ответ",
  ready: "На проверке",
  rejected: "Отклонён",
  sending: "Отправляется",
  sent: "Отправлен",
  error: "Не удалось подготовить",
  delivery_unknown: "Проверьте доставку в чате",
};
