import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { webhookSecret } from "@/lib/telegram/api.server";
import { reminderAccount } from "./actor.server";
import {
  moscowTime,
  nextReminder,
  reminderAnchors,
  reminderKeyboard,
  validReminder,
  type ReminderRow,
} from "./model";

// Server-only table; access is checked here and in the atomic DB functions.
const db = supabaseAdmin as unknown as SupabaseClient;
export async function listReminders() {
  const account = await reminderAccount();
  const { data, error } = await db
    .from("telegram_reminders")
    .select("id,title,due_at,repeat,state,occurrence")
    .eq("account_id", account.id)
    .in("state", ["pending", "notified"])
    .order("due_at")
    .limit(100);
  if (error) throw new Error(error.message);
  return { timeZone: "Europe/Moscow", now: new Date().toISOString(), reminders: data };
}
export async function trustedReminderInput(input: Record<string, unknown>) {
  const request = getRequest();
  if (
    !request ||
    request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== (await webhookSecret())
  )
    throw new Error("Подтвердите напоминание в личном чате Telegram");
  return reminderAccount(Number(input["_telegramUserId"]), Number(input["_telegramChatId"]));
}
export async function createReminder(input: Record<string, unknown>) {
  const account = await trustedReminderInput(input);
  const id = String(input["reminderId"] ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Некорректный номер напоминания");
  // Retry of the same confirmed proposal must not create another reminder.
  const existing = await db
    .from("telegram_reminders")
    .select("id")
    .eq("id", id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return "Напоминание уже сохранено";
  const value = validReminder(input);
  const { error } = await db.from("telegram_reminders").insert({
    id,
    account_id: account.id,
    title: value.title,
    due_at: value.dueAt,
    repeat: value.repeat,
    ...reminderAnchors(value.dueAt),
  });
  if (error) {
    if (error.code === "23505") return "Напоминание уже сохранено";
    throw new Error(error.message);
  }
  return `Напомню: ${value.title}\n${moscowTime(value.dueAt)} — время московское.`;
}
export async function manageReminder(
  accountId: string,
  id: string,
  occurrence: number,
  action: "done" | "snooze" | "cancel",
) {
  const found = await db
    .from("telegram_reminders")
    .select("*")
    .eq("id", id)
    .eq("account_id", accountId)
    .maybeSingle();
  if (found.error) throw new Error(found.error.message);
  if (!found.data) throw new Error("Напоминание не найдено");
  const row = found.data as ReminderRow;
  const next =
    action === "done"
      ? row.repeat !== "once" && row.state === "notified" && Date.parse(row.due_at) > Date.now()
        ? row.due_at
        : nextReminder(row)
      : null;
  const result = await db.rpc("manage_telegram_reminder", {
    p_id: id,
    p_account: accountId,
    p_occurrence: occurrence,
    p_action: action,
    p_next: next,
  });
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return "Эта кнопка уже обработана или напоминание изменилось";
  if (action === "cancel") return "Напоминание отменено, будущие повторы отключены";
  if (action === "snooze") return "Напомню через час";
  return next
    ? `Сделано. Следующее напоминание: ${moscowTime(next)} (Москва)`
    : "Отмечено: сделано";
}
export async function manageReminderProposal(input: Record<string, unknown>) {
  const account = await trustedReminderInput(input);
  const action = input["action"];
  if (action !== "done" && action !== "snooze" && action !== "cancel")
    throw new Error("Неизвестное действие");
  return manageReminder(
    account.id,
    String(input["reminderId"]),
    Number(input["occurrence"]),
    action,
  );
}
export async function claimReminders() {
  const result = await db.rpc("claim_telegram_reminders");
  if (result.error) throw new Error(result.error.message);
  const rows = (result.data ?? []) as ReminderRow[];
  const deliveries = [];
  for (const row of rows) {
    const account = await supabaseAdmin
      .from("telegram_accounts")
      .select("telegram_user_id,chat_id,active,user_id")
      .eq("id", row.account_id)
      .maybeSingle();
    if (!account.data) continue;
    try {
      await reminderAccount(Number(account.data.telegram_user_id), Number(account.data.chat_id));
    } catch {
      continue;
    }
    deliveries.push({
      id: row.id,
      token: row.lease_token,
      chatId: Number(account.data.chat_id),
      text: `⏰ Напоминание\n\n${row.title}\n\n${moscowTime(row.due_at)} (Москва)`,
      keyboard: reminderKeyboard(row),
    });
  }
  return deliveries;
}
export async function ackReminder(id: string, token: string, success: boolean) {
  const found = await db
    .from("telegram_reminders")
    .select("*")
    .eq("id", id)
    .eq("lease_token", token)
    .maybeSingle();
  if (found.error) throw new Error(found.error.message);
  if (!found.data) return false;
  const next = success ? nextReminder(found.data as ReminderRow) : null;
  const { data, error } = await db.rpc("ack_telegram_reminder", {
    p_id: id,
    p_token: token,
    p_success: success,
    p_next: next,
  });
  if (error) throw new Error(error.message);
  return data;
}
