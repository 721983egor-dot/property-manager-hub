import { APICallError, generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveEmployeeModel } from "@/lib/ai-gateway.server";
import { requestScheduleActor } from "@/lib/scheduled-actions/actor.server";
import { playbookSchema } from "./model";
import {
  DEFAULT_SUPPORT_PLAYBOOK,
  employeeScenarioInput,
  employeeScenarioInstructions,
  employeeScenarios,
  supportPlaybookInput,
} from "./employee-tests";
import { getPlaybook } from "./service.server";
import {
  approvedEmployeeRules,
  employeeSkillStates,
  trackEmployeeScenario,
} from "./employee-skills.server";
import { AI_EMPLOYEE_PROFILES } from "./profiles";

const db = supabaseAdmin as unknown as SupabaseClient;

export async function getSupportPlaybook() {
  await requestScheduleActor();
  const result = await db
    .from("ai_support_playbook")
    .select("value,revision")
    .eq("id", true)
    .maybeSingle();
  if (result.error) throw Error("Не удалось загрузить памятку Александра");
  return {
    value: result.data ? playbookSchema.parse(result.data.value) : DEFAULT_SUPPORT_PLAYBOOK,
    revision: (result.data?.revision as string | undefined) ?? "initial",
  };
}

export async function saveSupportPlaybook(raw: unknown) {
  const actor = await requestScheduleActor();
  const { revision, value } = supportPlaybookInput.parse(raw);
  const { error } = await db.rpc("save_ai_support_playbook", {
    p_actor: actor,
    p_revision: revision,
    p_value: value,
  });
  if (error) throw Error(error.message);
  return "Памятка Александра сохранена";
}

export async function getEmployeeHandbooks() {
  await requestScheduleActor();
  const [marina, alexander, skills, latestReview] = await Promise.all([
    getPlaybook(),
    getSupportPlaybook(),
    employeeSkillStates(),
    db
      .from("rental_ai_reviews")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (latestReview.error) throw Error("Не удалось загрузить историю работы Марины");
  return AI_EMPLOYEE_PROFILES.map((profile) => ({
    ...profile,
    playbook: (profile.id === "marina" ? marina : alexander).value,
    lastReviewAt:
      profile.id === "marina"
        ? ((latestReview.data?.created_at as string | undefined) ?? null)
        : null,
    skills: skills
      .filter((skill) => skill.employeeId === profile.id)
      .map(({ input: _, ...skill }) => skill),
  }));
}

function providerError(error: unknown) {
  if (APICallError.isInstance(error)) {
    const code = error.statusCode;
    if (code === 401) return "OpenAI отклонил ключ (401)";
    if (code === 403)
      return "OpenAI или API-шлюз запретил запрос (403). Проверьте регион и разрешения проекта.";
    if (code === 404) return "OpenAI не нашёл модель или маршрут API (404)";
    if (code === 429) return "OpenAI вернул ограничение квоты или частоты (429)";
    if (code) return `API вернул ошибку HTTP ${code}`;
  }
  return "Ответ от OpenAI не получен. Проверьте доступ сервера к API и тайм-аут.";
}

export async function checkEmployeeOpenAI() {
  await requestScheduleActor();
  const setup = resolveEmployeeModel();
  if ("error" in setup) return { ok: false, message: setup.error };
  const start = Date.now();
  try {
    const response = await generateText({
      model: setup.model,
      providerOptions: { openai: { store: false } },
      prompt: "Ответь одним словом OK.",
      maxOutputTokens: 64,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(12_000),
    });
    if (!response.text.trim()) return { ok: false, message: "OpenAI вернул пустой ответ" };
    return { ok: true, message: `OpenAI ответил с сервера РМ ОС за ${Date.now() - start} мс` };
  } catch (error) {
    return { ok: false, message: providerError(error) };
  }
}

export async function runEmployeeScenario(raw: unknown) {
  const actor = await requestScheduleActor();
  const { scenario } = employeeScenarioInput.parse(raw);
  const sample = employeeScenarios[scenario];
  const setup = resolveEmployeeModel();
  if ("error" in setup) throw Error(setup.error);
  const { value } = scenario.startsWith("marina")
    ? await getPlaybook()
    : await getSupportPlaybook();
  const rules = await approvedEmployeeRules(sample.employeeId);
  let draft: string;
  try {
    const result = await generateText({
      model: setup.model,
      providerOptions: { openai: { store: false } },
      system: employeeScenarioInstructions(scenario, value, rules),
      prompt: sample.input,
      maxOutputTokens: 600,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(25_000),
    });
    draft = result.text.trim();
    if (!draft) throw Error();
  } catch (error) {
    throw Error(providerError(error));
  }
  const runId = await trackEmployeeScenario(scenario, actor);
  return { draft, expected: sample.expected, rule: sample.rule, runId };
}
