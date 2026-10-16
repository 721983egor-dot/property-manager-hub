import { getRequest } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reminderActor, reminderAccount } from "@/lib/reminders/actor.server";
import { webhookSecret } from "@/lib/telegram/api.server";
import { crmSources, filterCrmResults, type ResultMode } from "@/lib/crm-results-model";
import type { Deal, DealStage } from "@/lib/deals";
export async function crmAccess(input?: Record<string, unknown>) {
  const req = getRequest();
  const auth = req?.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const client = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      {
        global: { headers: { Authorization: auth } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await client.auth.getUser(auth.slice(7));
    if (error || !data.user) throw new Error("Требуется вход");
    const role = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role.data) throw new Error("Только администратор");
    return { db: client, actor: null };
  }
  if (req?.headers.get("X-Telegram-Bot-Api-Secret-Token") !== (await webhookSecret()))
    throw new Error("Требуется вход администратора");
  const scope = reminderActor.getStore();
  const account = input
    ? await reminderAccount(Number(input["_telegramUserId"]), Number(input["_telegramChatId"]))
    : await reminderAccount(scope?.telegramUserId, scope?.chatId);
  return { db: supabaseAdmin as unknown as SupabaseClient, actor: account.user_id };
}
export async function readCrmResults(pipeline: string, mode: ResultMode, from: string, to: string) {
  const { db } = await crmAccess();
  const all: Deal[] = [];
  for (let offset = 0; ; offset += 500) {
    const q = await db
      .from("deals")
      .select("*")
      .eq("pipeline", pipeline)
      .order("id")
      .range(offset, offset + 499);
    if (q.error) throw q.error;
    all.push(...(q.data as Deal[]));
    if (q.data.length < 500) break;
  }
  const stages = await db.from("deal_stages").select("*").eq("pipeline", pipeline);
  if (stages.error) throw stages.error;
  const filtered = filterCrmResults(all, stages.data as DealStage[], mode, from, to);
  return {
    pipeline,
    mode,
    from,
    to,
    total: filtered.length,
    sources: crmSources(filtered, stages.data as DealStage[], mode),
    commission:
      mode === "won"
        ? await (async () => {
            const ids = new Set(all.map((d) => d.id));
            const payments = [];
            for (let offset = 0; ; offset += 500) {
              const q = await db
                .from("payments")
                .select(
                  "id,deal_id,planned_date,amount,status,paid_at,paid_amount,rental_turnover,crm_charge",
                )
                .not("crm_charge", "is", null)
                .order("id")
                .range(offset, offset + 499);
              if (q.error) throw q.error;
              payments.push(...q.data.filter((p) => ids.has(p.deal_id)));
              if (q.data.length < 500) break;
            }
            const { commissionTotals } = await import("./crm-commission-model");
            return {
              ...commissionTotals(payments, from, to),
              basis:
                "Комиссии по датам платежей; оборот отдельно; получено по paid_at; частичные оплаты суммарно по сохранённой дате",
            };
          })()
        : undefined,
    deals: filtered.slice(0, 100),
    truncated: filtered.length > 100,
  };
}
export async function executeCrmResult(tool: string, input: Record<string, unknown>) {
  const { db, actor } = await crmAccess(input);
  if (tool === "saveDealLossReason") {
    const id = input["id"] as string;
    const patch = {
      name: String(input["name"] ?? "").trim(),
      pipeline: String(input["pipeline"]),
      position: Number(input["position"] ?? 0),
      archived: input["archived"] === true,
    };
    if (!patch.name || patch.name.length > 160 || !["rental", "intake"].includes(patch.pipeline))
      throw new Error("Проверьте причину и воронку");
    const result = id
      ? await db
          .from("deal_loss_reasons")
          .update(patch)
          .eq("id", id)
          .eq("pipeline", patch.pipeline)
          .select("id")
          .single()
      : await db
          .from("deal_loss_reasons")
          .insert({ ...patch, id: input["newId"] })
          .select("id")
          .single();
    if (result.error) throw result.error;
    return "Причина провала сохранена";
  }
  let result;
  if (tool === "closeDealLost")
    result = await db.rpc("crm_close_lost", {
      p_deal: input["dealId"],
      p_reason: input["reasonId"],
      p_comment: input["comment"] ?? "",
      p_closed_on: input["closedOn"] ?? null,
      p_actor: actor,
    });
  else if (tool === "acceptIntake")
    result = await db.rpc("crm_accept_intake", {
      p_deal: input["dealId"],
      p_property: input["propertyId"] ?? null,
      p_actor: actor,
    });
  else
    result = await db.rpc("crm_close_won_finance", {
      p_deal: input["dealId"],
      p_terms: {
        property_id: input["propertyId"],
        start_date: input["startDate"],
        end_date: input["endDate"],
        price_month: input["priceMonth"],
        deposit: input["deposit"],
        payment_day: input["paymentDay"],
        closing_source: input["closingSource"],
        income_type: input["incomeType"],
        income_value: input["incomeValue"],
        create_booking: input["createBooking"] !== false,
        account_id: input["accountId"],
        one_time: input["oneTime"] ?? 0,
        one_time_date: input["oneTimeDate"] ?? null,
        seasons: input["seasons"] ?? [],
      },
      p_actor: actor,
    });
  if (result.error) throw result.error;
  return tool === "closeDealLost"
    ? "Сделка закрыта с причиной отказа"
    : tool === "acceptIntake"
      ? "Объект принят в работу. Публикация — отдельное действие"
      : "Сделка закрыта успешно, комиссии запланированы в финансовом календаре";
}
