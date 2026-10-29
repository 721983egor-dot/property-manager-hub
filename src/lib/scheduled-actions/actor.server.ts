import { AsyncLocalStorage } from "node:async_hooks";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
/** Never populated from request fields. Only the authenticated queue worker installs this scope. */
export const scheduledActor = new AsyncLocalStorage<{ id: string; jobId: string }>();
export async function assertScheduleAdmin(id: string) {
  const [role, account] = await Promise.all([
    supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", id)
      .eq("role", "admin")
      .maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(id),
  ]);
  const user = account.data?.user as { banned_until?: string } | null;
  if (
    role.error ||
    !role.data ||
    account.error ||
    !user ||
    (user.banned_until && Date.parse(user.banned_until) > Date.now())
  )
    throw Error("Отложенные поручения доступны действующему администратору");
  return id;
}
export async function requestScheduleActor(input?: Record<string, unknown>) {
  const scoped = scheduledActor.getStore();
  if (scoped) return assertScheduleAdmin(scoped.id);
  const request = getRequest(),
    auth = request?.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const result = await supabaseAdmin.auth.getUser(auth.slice(7));
    if (result.error || !result.data.user) throw Error("Требуется вход");
    return assertScheduleAdmin(result.data.user.id);
  }
  const { webhookSecret } = await import("@/lib/telegram/api.server");
  if (request?.headers.get("X-Telegram-Bot-Api-Secret-Token") !== (await webhookSecret()))
    throw Error("Требуется вход администратора");
  const { reminderAccount } = await import("@/lib/reminders/actor.server");
  const account = input?.["_telegramUserId"]
    ? await reminderAccount(Number(input["_telegramUserId"]), Number(input["_telegramChatId"]))
    : await reminderAccount();
  return assertScheduleAdmin(account.user_id!);
}
