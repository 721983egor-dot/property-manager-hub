import { performScheduledAction } from "./runner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertScheduleAdmin, requestScheduleActor, scheduledActor } from "./actor.server";
import {
  futureRunAt,
  assertScheduledOperation,
  manageScheduleSchema,
  scheduledTime,
  type ScheduledRow,
} from "./model";
import { unsealForActor } from "./seal.server";
const db = supabaseAdmin as unknown as SupabaseClient;
export async function listScheduledActions() {
  const actor = await requestScheduleActor();
  const columns =
    "id,actor_id,run_at,tool_name,summary,state,version,result,started_at,finished_at,created_at";
  const active: ScheduledRow[] = [];
  for (let start = 0; ; start += 500) {
    const r = await db
      .from("assistant_scheduled_actions")
      .select(columns)
      .eq("actor_id", actor)
      .in("state", ["pending", "running"])
      .order("id")
      .range(start, start + 499);
    if (r.error) throw Error(r.error.message);
    active.push(...(r.data as ScheduledRow[]));
    if (r.data.length < 500) break;
  }
  const history = await db
    .from("assistant_scheduled_actions")
    .select(columns)
    .eq("actor_id", actor)
    .not("state", "in", "(pending,running)")
    .order("finished_at", { ascending: false })
    .limit(100);
  if (history.error) throw Error(history.error.message);
  return {
    now: new Date().toISOString(),
    timeZone: "Europe/Moscow",
    actions: [...active, ...(history.data as ScheduledRow[])],
  };
}
export async function enqueueScheduledAction(input: Record<string, unknown>) {
  const actor = await requestScheduleActor(input),
    action = unsealForActor(input, actor);
  // Repeated confirmation of the same signed proposal cannot create a second execution.
  const old = await db
    .from("assistant_scheduled_actions")
    .select("id,actor_id,state")
    .eq("id", action.id)
    .maybeSingle();
  if (old.error) throw Error(old.error.message);
  if (old.data) {
    if (old.data.actor_id !== actor) throw Error("Поручение принадлежит другому пользователю");
    return `Поручение уже сохранено (${old.data.state})`;
  }
  assertScheduledOperation(action.tool, action.input);
  const runAt = futureRunAt(action.runAt);
  const r = await db.rpc("assistant_enqueue_action", {
    p_id: action.id,
    p_actor: actor,
    p_run_at: runAt,
    p_tool: action.tool,
    p_summary: action.summary,
    p_input: action.input,
  });
  if (r.error) throw Error(r.error.message);
  return `Запланировано: ${scheduledTime(runAt)}\n${action.summary}\nРезультат появится в «Ассистент → Отложенные поручения»${(await hasTelegram(actor)) ? " и в вашем Telegram" : ""}.`;
}
async function hasTelegram(actor: string) {
  const r = await db
    .from("telegram_accounts")
    .select("chat_id,telegram_user_id")
    .eq("user_id", actor)
    .eq("active", true);
  return !r.error && r.data.some((a) => Number(a.chat_id) === Number(a.telegram_user_id));
}
export async function manageScheduledAction(raw: Record<string, unknown>) {
  const input = manageScheduleSchema.parse(raw),
    actor = await requestScheduleActor(raw);
  const runAt = input.action === "reschedule" ? futureRunAt(input.runAt ?? "") : null;
  const r = await db.rpc("assistant_manage_action", {
    p_id: input.id,
    p_actor: actor,
    p_version: input.version,
    p_action: input.action,
    p_run_at: runAt,
  });
  if (r.error) throw Error(r.error.message);
  return input.action === "cancel"
    ? "Отложенное поручение отменено"
    : `Поручение перенесено: ${scheduledTime(runAt!)}`;
}
type Claimed = ScheduledRow & { input: Record<string, unknown>; lease_token: string };
export async function runScheduledBatch() {
  if (process.env["PREVIEW_MODE"] === "1") return { ok: true, processed: 0, preview: true };
  const claimed = await db.rpc("assistant_claim_action");
  if (claimed.error) throw Error(claimed.error.message);
  const row = claimed.data as Claimed | null;
  if (row) {
    await performScheduledAction(row, {
      assertActor: assertScheduleAdmin,
      execute: async (tool, summary, input) => {
        const { executeAssistantAction } = await import("@/lib/ai/executors.server");
        return scheduledActor.run({ id: row.actor_id, jobId: row.id }, () =>
          executeAssistantAction(tool, summary, JSON.stringify(input)),
        );
      },
      finish: async (state, result) => {
        const done = await db.rpc("assistant_finish_action", {
          p_id: row.id,
          p_token: row.lease_token,
          p_state: state,
          p_result: result,
        });
        if (done.error || done.data !== true)
          throw Error(
            "Не удалось зафиксировать результат поручения; автоматического повтора не будет",
          );
      },
    });
  }
  await notifyFinished();
  return { ok: true, processed: row ? 1 : 0 };
}
async function notifyFinished() {
  const rows = await db
    .from("assistant_scheduled_actions")
    .select("id,actor_id,state,summary,result")
    .eq("notification_state", "pending")
    .order("finished_at")
    .limit(10);
  if (rows.error) return;
  for (const r of rows.data) {
    let chat: number | null = null;
    try {
      await assertScheduleAdmin(r.actor_id);
      const a = await db
        .from("telegram_accounts")
        .select("chat_id,telegram_user_id")
        .eq("user_id", r.actor_id)
        .eq("active", true)
        .limit(10);
      const own = a.data?.find((a) => Number(a.chat_id) === Number(a.telegram_user_id));
      if (own) chat = Number(own.chat_id);
    } catch {
      /* Revoked access never receives a message. */
    }
    // Claim before sending. A lost network response may lose a notification, never repeat the business action.
    const claim = await db
      .from("assistant_scheduled_actions")
      .update({ notification_state: chat ? "sent" : "unavailable" })
      .eq("id", r.id)
      .eq("notification_state", "pending")
      .select("id")
      .maybeSingle();
    if (!claim.data || !chat) continue;
    try {
      const { sendMessage } = await import("@/lib/telegram/api.server");
      await sendMessage(
        chat,
        `${r.state === "done" ? "✅ Поручение выполнено" : "⚠️ Поручение требует внимания"}\n\n${r.summary}\n\n${r.result}`.slice(
          0,
          4000,
        ),
      );
    } catch {
      await db
        .from("assistant_scheduled_actions")
        .update({ notification_state: "unavailable" })
        .eq("id", r.id);
    }
  }
}
