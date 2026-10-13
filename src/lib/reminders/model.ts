import { z } from "zod";

export const reminderSchema = z.object({
  title: z.string().trim().min(1).max(500),
  dueAt: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+03:00$/,
      "Дата и время по Москве: YYYY-MM-DDTHH:mm:00+03:00",
    ),
  repeat: z.enum(["once", "daily", "weekly", "monthly"]).default("once"),
});
export type ReminderInput = z.infer<typeof reminderSchema>;
export type ReminderRow = {
  id: string;
  account_id: string;
  title: string;
  due_at: string;
  repeat: ReminderInput["repeat"];
  anchor_day: number;
  anchor_weekday: number;
  anchor_hour: number;
  anchor_minute: number;
  state: "pending" | "notified" | "completed" | "cancelled";
  occurrence: number;
  lease_token: string | null;
};
export const REPEAT_LABEL = {
  once: "один раз",
  daily: "каждый день",
  weekly: "каждую неделю",
  monthly: "каждый месяц",
};
export function moscowTime(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "medium",
    timeStyle: "short",
  });
}
export function validReminder(input: unknown, now = Date.now()): ReminderInput {
  const result = reminderSchema.parse(input);
  const parsed = Date.parse(result.dueAt);
  // Reject JS's normalization of February 30 etc.
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed + 3 * 3600000).toISOString().slice(0, 16) !== result.dueAt.slice(0, 16)
  )
    throw new Error("Некорректная дата");
  if (parsed <= now) throw new Error("Выберите время в будущем");
  return result;
}
export function reminderAnchors(dueAt: string) {
  const d = new Date(Date.parse(dueAt) + 3 * 3600000);
  return {
    anchor_day: d.getUTCDate(),
    anchor_weekday: d.getUTCDay(),
    anchor_hour: d.getUTCHours(),
    anchor_minute: d.getUTCMinutes(),
  };
}
/** After completion skip missed repetitions; monthly day 31 returns after short months. */
export function nextReminder(row: ReminderRow, now = Date.now()): string | null {
  if (row.repeat === "once") return null;
  const current = new Date(Date.parse(row.due_at) + 3 * 3600000);
  const localNow = new Date(now + 3 * 3600000);
  let next: Date;
  if (row.repeat === "monthly") {
    let month = Math.max(
      current.getUTCFullYear() * 12 + current.getUTCMonth(),
      localNow.getUTCFullYear() * 12 + localNow.getUTCMonth(),
    );
    const candidate = (m: number) =>
      new Date(
        Date.UTC(
          Math.floor(m / 12),
          m % 12,
          Math.min(
            row.anchor_day,
            new Date(Date.UTC(Math.floor(m / 12), (m % 12) + 1, 0)).getUTCDate(),
          ),
          row.anchor_hour,
          row.anchor_minute,
        ),
      );
    next = candidate(month);
    if (next.getTime() <= Math.max(current.getTime(), localNow.getTime()))
      next = candidate(++month);
  } else {
    next = new Date(localNow);
    next.setUTCHours(row.anchor_hour, row.anchor_minute, 0, 0);
    if (row.repeat === "weekly")
      next.setUTCDate(next.getUTCDate() + ((row.anchor_weekday - next.getUTCDay() + 7) % 7));
    const interval = (row.repeat === "daily" ? 1 : 7) * 86400000;
    while (next.getTime() <= Math.max(current.getTime(), localNow.getTime()))
      next = new Date(next.getTime() + interval);
  }
  return new Date(next.getTime() - 3 * 3600000).toISOString();
}
export function reminderKeyboard(row: Pick<ReminderRow, "id" | "occurrence">) {
  const suffix = `${row.id}:${row.occurrence}`;
  return [
    [
      { text: "✅ Сделано", callback_data: `rd:${suffix}` },
      { text: "⏰ Через час", callback_data: `rs:${suffix}` },
    ],
    [{ text: "Отменить", callback_data: `rc:${suffix}` }],
  ];
}
