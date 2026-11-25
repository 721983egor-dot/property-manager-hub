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
import { approvedMarinaShowingRules } from "./marina-learning.server";

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

const providerNames = {
  openai: "OpenAI",
  yandex: "Yandex AI Studio",
  gateway: "Шлюз OpenAI",
};

function providerError(error: unknown, source: keyof typeof providerNames) {
  const provider = providerNames[source];
  if (APICallError.isInstance(error)) {
    const code = error.statusCode;
    if (code === 401) return `${provider}: ошибка авторизации (401)`;
    if (code === 403) return `${provider}: запрос запрещён (403). Проверьте разрешения проекта.`;
    if (code === 404) return `${provider}: модель или маршрут API не найдены (404)`;
    if (code === 429) return `${provider}: превышена квота или частота запросов (429)`;
    if (code) return `API вернул ошибку HTTP ${code}`;
  }
  return `Ответ от ${provider} не получен. Проверьте доступ сервера к API и тайм-аут.`;
}

export async function checkEmployeeConnection() {
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
    if (!response.text.trim()) return { ok: false, message: "Модель вернула пустой ответ" };
    return {
      ok: true,
      message: `${providerNames[setup.source]} ответил с сервера РМ ОС за ${Date.now() - start} мс`,
    };
  } catch (error) {
    return { ok: false, message: providerError(error, setup.source) };
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
  const rules: string[] = await approvedEmployeeRules(sample.employeeId);
  if (sample.employeeId === "marina") rules.push(...(await approvedMarinaShowingRules()));
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
    throw Error(providerError(error, setup.source));
  }
  const runId = await trackEmployeeScenario(scenario, actor);
  return { draft, expected: sample.expected, rule: sample.rule, runId };
}
