import { randomBytes, createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requestScheduleActor, assertScheduleAdmin } from "@/lib/scheduled-actions/actor.server";
import { CALDAV_BASE } from "./model";
export type CalendarAccount = {
  user_id: string;
  scope: "mine" | "all";
  enabled: boolean;
  version: number;
  updated_at: string;
  password_hash: string;
};
export const calendarHash = (password: string) =>
  createHash("sha256").update(password).digest("hex");
export async function calendarStatus() {
  const actor = await requestScheduleActor();
  const { data, error } = await supabaseAdmin
    .from("task_calendar_accounts" as never)
    .select("scope,enabled,version,updated_at")
    .eq("user_id", actor)
    .maybeSingle();
  if (error) throw Error("Не удалось загрузить подключение календаря");
  return {
    account: data as Omit<CalendarAccount, "password_hash" | "user_id"> | null,
    username: actor,
    path: CALDAV_BASE + actor + "/",
  };
}
export async function configureCalendar(
  action: "enable" | "disable",
  scope: "mine" | "all" = "mine",
) {
  const actor = await requestScheduleActor();
  const password = action === "enable" ? randomBytes(32).toString("base64url") : "";
  const { error } = await supabaseAdmin.rpc(
    "task_calendar_configure" as never,
    {
      p_actor: actor,
      p_action: action,
      p_hash: password ? calendarHash(password) : null,
      p_scope: scope,
    } as never,
  );
  if (error) throw Error("Не удалось сохранить подключение календаря");
  return {
    enabled: action === "enable",
    password,
    username: actor,
    path: CALDAV_BASE + actor + "/",
  };
}
export async function authenticateCalendar(request: Request): Promise<CalendarAccount | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ") || auth.length > 1000) return null;
  let username = "",
    password = "";
  try {
    const value = Buffer.from(auth.slice(6), "base64").toString();
    const index = value.indexOf(":");
    username = value.slice(0, index);
    password = value.slice(index + 1);
  } catch {
    return null;
  }
  if (!/^[a-f0-9-]{36}$/i.test(username) || password.length < 40) return null;
  // Match an unguessable device secret at the database. Never use an RM OS bearer token here.
  const { data, error } = await supabaseAdmin
    .from("task_calendar_accounts" as never)
    .select("*")
    .eq("user_id", username)
    .eq("password_hash", calendarHash(password))
    .eq("enabled", true)
    .maybeSingle();
  if (error || !data) return null;
  try {
    await assertScheduleAdmin(username);
  } catch {
    return null;
  }
  return data as CalendarAccount;
}
