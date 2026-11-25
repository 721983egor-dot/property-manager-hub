import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requestScheduleActor } from "@/lib/scheduled-actions/actor.server";
import {
  employeeScenarios,
  employeeScenarioApproval,
  type AiEmployeeId,
  type EmployeeScenario,
} from "./employee-tests";

const db = supabaseAdmin as unknown as SupabaseClient;
type SkillUse = {
  scenario: EmployeeScenario;
  last_run_at: string;
  approved_at: string | null;
};

export async function employeeSkillStates() {
  const { data, error } = await db
    .from("ai_employee_skill_usage")
    .select("scenario,last_run_at,approved_at");
  if (error) throw Error("Не удалось загрузить навыки ИИ-сотрудников");
  const runs = new Map((data as SkillUse[]).map((row) => [row.scenario, row]));
  return (Object.keys(employeeScenarios) as EmployeeScenario[]).map((id) => ({
    id,
    ...employeeScenarios[id],
    lastRunAt: runs.get(id)?.last_run_at ?? null,
    approvedAt: runs.get(id)?.approved_at ?? null,
  }));
}

export async function approvedEmployeeRules(employee: AiEmployeeId) {
  return (await employeeSkillStates())
    .filter((skill) => skill.employeeId === employee && skill.approvedAt)
    .map((skill) => skill.rule);
}

export async function trackEmployeeScenario(scenario: EmployeeScenario, actor: string) {
  const runId = randomUUID();
  const { error } = await db.from("ai_employee_skill_usage").upsert(
    {
      scenario,
      run_id: runId,
      run_by: actor,
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "scenario" },
  );
  if (error) throw Error("Не удалось обновить статус навыка");
  return runId;
}

export async function approveEmployeeScenario(raw: unknown) {
  const actor = await requestScheduleActor();
  const { scenario, runId } = employeeScenarioApproval.parse(raw);
  const { data, error } = await db.rpc("approve_ai_employee_skill", {
    p_scenario: scenario,
    p_run: runId,
    p_actor: actor,
  });
  if (error) throw Error("Не удалось подтвердить правило");
  if (!data)
    throw Error("Правило уже действует или появилась более новая проверка. Обновите карточку.");
  return "Правило добавлено в действующие инструкции";
}
