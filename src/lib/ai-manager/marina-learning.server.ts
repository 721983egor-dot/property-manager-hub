import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requestScheduleActor } from "@/lib/scheduled-actions/actor.server";
import { decideShowingRuleInput, showingRuleTemplates } from "./marina-learning";

const db = supabaseAdmin as unknown as SupabaseClient;
type RuleKey = keyof typeof showingRuleTemplates;
type Evidence = { rule_key: RuleKey; showing_id: string; deal_id: string; shown_at: string };
type Decision = {
  rule_key: RuleKey;
  rule_text: string;
  showing_id: string | null;
  status: "approved" | "dismissed";
  decided_at: string;
};

export async function approvedMarinaShowingRules() {
  const { data, error } = await db
    .from("marina_showing_rules")
    .select("rule_text")
    .eq("status", "approved")
    .order("decided_at");
  if (error) throw Error("Не удалось загрузить подтверждённые правила Марины");
  return (data as Pick<Decision, "rule_text">[]).map((row) => row.rule_text);
}

export async function listMarinaShowingRules(input?: Record<string, unknown>) {
  const actor = await requestScheduleActor(input);
  const [samples, decisions, approver] = await Promise.all([
    db.rpc("marina_showing_evidence"),
    db.from("marina_showing_rules").select("rule_key,rule_text,showing_id,status,decided_at"),
    db.from("marina_learning_approver").select("user_id").maybeSingle(),
  ]);
  if (samples.error || decisions.error || approver.error) {
    throw Error("Не удалось загрузить правила по показам");
  }
  const evidence = samples.data as Evidence[];
  const saved = new Map((decisions.data as Decision[]).map((row) => [row.rule_key, row]));
  return {
    canDecide: approver.data?.user_id === actor,
    rules: (Object.keys(showingRuleTemplates) as RuleKey[]).flatMap((key) => {
      const decision = saved.get(key);
      const examples = evidence
        .filter((row) => row.rule_key === key)
        .sort((a, b) => Date.parse(b.shown_at) - Date.parse(a.shown_at));
      if (decision?.status === "dismissed" || (!decision && !examples.length)) return [];
      return [
        {
          key,
          title: showingRuleTemplates[key].title,
          text: decision?.rule_text ?? showingRuleTemplates[key].text,
          showingId: decision ? decision.showing_id : examples[0].showing_id,
          status: decision?.status ?? ("pending" as const),
          examples: examples.slice(0, 3),
          dealCount: examples.length,
        },
      ];
    }),
  };
}

export async function decideMarinaShowingRule(raw: unknown) {
  const input = decideShowingRuleInput.parse(raw);
  const actor = await requestScheduleActor(raw as Record<string, unknown>);
  const { data, error } = await db.rpc("decide_marina_showing_rule", {
    p_key: input.key,
    p_showing: input.showingId,
    p_text: input.text,
    p_decision: input.decision,
    p_actor: actor,
  });
  if (error) throw Error("Решение доступно назначенному администратору");
  if (!data) throw Error("Сделка или правило изменились. Обновите список.");
  return input.decision === "approved"
    ? "Правило добавлено в инструкции Марины"
    : "Правило убрано из списка";
}
