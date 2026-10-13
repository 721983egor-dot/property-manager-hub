import { AsyncLocalStorage } from "node:async_hooks";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const reminderActor = new AsyncLocalStorage<{ telegramUserId: number; chatId: number }>();
export async function reminderAccount(telegramUserId?: number, chatId?: number) {
  const actor = reminderActor.getStore();
  const user = telegramUserId ?? actor?.telegramUserId;
  const chat = chatId ?? actor?.chatId;
  if (!user || !chat || user !== chat)
    throw new Error("Напоминания доступны в личном чате с Telegram-ботом");
  const { data, error } = await supabaseAdmin
    .from("telegram_accounts")
    .select("id,user_id,chat_id,active")
    .eq("telegram_user_id", user)
    .maybeSingle();
  if (error || !data?.active || !data.user_id || Number(data.chat_id) !== chat)
    throw new Error("Привяжите Telegram к РМ ОС");
  const role = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user_id)
    .eq("role", "admin")
    .maybeSingle();
  if (role.error || !role.data) throw new Error("Напоминания пока доступны только администратору");
  return data;
}
