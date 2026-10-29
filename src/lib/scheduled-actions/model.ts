import { z } from "zod";
/** Explicit capability list; receipt confirmations, credentials, passports and destructive deletion stay interactive. */
export const SCHEDULABLE_TOOLS = [
  "runAssistantReport",
  "updateProperty",
  "setPublished",
  "createProperty",
  "createSelection",
  "publishPropertyVideo",
  "upsertClient",
  "setLeadStatus",
  "addDealComment",
  "addDealShowing",
  "upsertDeal",
  "createBooking",
  "updateRentalContract",
  "cancelRentalContract",
  "cancelBooking",
  "closeDealWon",
  "closeDealLost",
  "acceptIntake",
  "saveDealLossReason",
  "upsertTask",
  "postponeTask",
  "upsertTaskItem",
  "upsertTaskType",
  "upsertMaintenanceServiceItem",
  "setPropertyMaintenanceServices",
  "createSocialPost",
  "updateSocialPost",
  "publishSocialPost",
  "cancelSocialPost",
  "createSocialStory",
  "updateSocialStory",
  "publishSocialStory",
  "cancelSocialStory",
  "createSiteArticle",
  "updateSiteArticle",
  "publishSiteArticle",
  "unpublishSiteArticle",
  "updateSocialPostHitMeta",
  "sendChatMessage",
  "sendCianMessage",
  "runBnovoSync",
  "assignHotelBookingRoom",
  "createPayment",
  "createCounterparty",
  "createObligation",
  "setBookingCashTerms",
  "setBookingCollectionPlan",
] as const;
export const isSchedulable = (tool: string) =>
  (SCHEDULABLE_TOOLS as readonly string[]).includes(tool);
export const runAtSchema = z.string().datetime({ offset: true });
export function futureRunAt(value: string, now = Date.now()) {
  const parsed = runAtSchema.parse(value),
    ms = Date.parse(parsed);
  if (ms <= now + 5000) throw Error("Укажите будущее время выполнения по Москве");
  if (ms > now + 5 * 366 * 86400000) throw Error("Укажите дату в пределах пяти лет");
  return new Date(ms).toISOString();
}
export const scheduledTime = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "long",
    timeStyle: "short",
  }) + " · Москва";
export const sealedActionSchema = z.object({
  id: z.string().uuid(),
  actorId: z.string().uuid(),
  runAt: runAtSchema,
  tool: z.enum(SCHEDULABLE_TOOLS),
  summary: z.string().min(1).max(12000),
  input: z.record(z.unknown()),
  issuedAt: z.number().int(),
});
export type SealedAction = z.infer<typeof sealedActionSchema>;
export type ScheduledRow = {
  id: string;
  actor_id: string;
  run_at: string;
  tool_name: string;
  summary: string;
  state: "pending" | "running" | "done" | "cancelled" | "failed" | "needs_review";
  version: number;
  result: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};
export const manageScheduleSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  action: z.enum(["cancel", "reschedule"]),
  runAt: runAtSchema.optional(),
});

export function assertScheduledOperation(tool: string, input: Record<string, unknown>) {
  if (!isSchedulable(tool)) throw Error("Это действие не поддерживает отложенный запуск");
  if (Object.keys(input).some((k) => k.startsWith("_telegram")))
    throw Error("Недопустимый контекст поручения");
  if (
    tool === "createPayment" &&
    ((input["status"] !== undefined &&
      !["expected", "overdue"].includes(String(input["status"]))) ||
      input["paidAt"] ||
      Number(input["paidAmount"] ?? 0) > 0)
  )
    throw Error("Фактическое получение денег подтверждается по факту, а не заранее");
  if (tool === "upsertTask" && input["status"] === "done")
    throw Error("Фактическое выполнение работы нельзя отмечать автоматически заранее");
}
