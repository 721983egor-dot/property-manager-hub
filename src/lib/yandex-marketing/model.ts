import { z } from "zod";
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export const periodSchema = z.object({ days: z.number().int().min(1).max(90).default(30) });
export const connectionSchema = z.object({
  login: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_.-]{1,100}$/),
  counterId: z.number().int().positive().safe(),
  tenantGoalId: z.number().int().positive().safe().default(676665001),
  ownerGoalId: z.number().int().positive().safe().default(676665229),
  directToken: z.string().trim().max(4096).optional(),
  metrikaToken: z.string().trim().max(4096).optional(),
});
export type Connection = {
  login: string;
  counterId: number;
  tenantGoalId: number;
  ownerGoalId: number;
  revision: string;
};
export type Campaign = {
  Id: number;
  Name: string;
  Type: string;
  State: string;
  Status: string;
  Currency?: string;
  StatusClarification?: string;
  StartDate?: string;
  EndDate?: string;
  NegativeKeywords?: { Items: string[] } | null;
  UnifiedCampaign?: {
    TrackingParams?: string | null;
    BiddingStrategy?: {
      Search?: Record<string, Json>;
      Network?: Record<string, Json>;
    };
  };
};
export const changeSchema = z
  .object({
    campaignId: z.number().int().positive().safe(),
    operation: z.enum(["suspend", "resume", "addNegativeKeywords", "setSearchClickLimits"]),
    negativeKeywords: z.array(z.string().trim().min(1).max(255)).min(1).max(100).optional(),
    periodBudgetRub: z.number().positive().max(1_000_000).multipleOf(0.01).optional(),
    averageCpcRub: z.number().positive().max(100_000).multipleOf(0.01).optional(),
    reason: z.string().trim().min(1).max(1000),
  })
  .superRefine((v, ctx) => {
    if (v.operation === "addNegativeKeywords" && !v.negativeKeywords?.length)
      ctx.addIssue({ code: "custom", message: "Укажите минус-фразы" });
    if (v.operation === "setSearchClickLimits" && !v.periodBudgetRub && !v.averageCpcRub)
      ctx.addIssue({ code: "custom", message: "Укажите бюджет или среднюю цену клика" });
    if (v.operation !== "addNegativeKeywords" && v.negativeKeywords)
      ctx.addIssue({ code: "custom", message: "Минус-фразы не относятся к этой операции" });
    if (v.operation !== "setSearchClickLimits" && (v.periodBudgetRub || v.averageCpcRub))
      ctx.addIssue({ code: "custom", message: "Лимиты не относятся к этой операции" });
  });
export type Change = z.infer<typeof changeSchema>;

export function moscowPeriod(days: number, now = new Date()) {
  periodSchema.parse({ days });
  const end = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
  const start = new Date(Date.parse(end + "T00:00:00Z") - (days - 1) * 86400_000)
    .toISOString()
    .slice(0, 10);
  return {
    start,
    end,
    since: start + "T00:00:00+03:00",
    until: new Date(Date.parse(end + "T00:00:00+03:00") + 86400_000).toISOString(),
  };
}

export function parseTsv(text: string, limit = 10000) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  const headers = lines.shift()?.split("\t") ?? [];
  if (!headers.includes("Cost") || !headers.includes("CampaignId"))
    throw Error("Неожиданный формат отчёта Директа");
  const rows = lines.filter(Boolean);
  return {
    rows: rows.slice(0, limit).map((line) => {
      const values = line.split("\t");
      if (values.length !== headers.length) throw Error("Повреждена строка отчёта Директа");
      return Object.fromEntries(headers.map((h, i) => [h, values[i]])) as Record<string, string>;
    }),
    truncated: rows.length > limit,
  };
}

export function campaignUtm(c: Campaign) {
  const params = c.UnifiedCampaign?.TrackingParams;
  if (params) {
    const value = new URLSearchParams(params.replace(/^\?/, "")).get("utm_campaign");
    if (value && !/[{}]/.test(value)) return value;
  }
  // Existing campaigns created before the API connection; never match by display name.
  return (
    ({ 715631828: "rm_rent_search", 715631494: "rm_owners_search" } as Record<number, string>)[
      c.Id
    ] ?? null
  );
}

function micros(value: number) {
  return Math.round(value * 1_000_000);
}
export function acquisitionCost(cost: number, leads: number | null, complete: boolean) {
  if (!complete || !leads || leads < 0 || !Number.isFinite(cost) || cost < 0) return null;
  return Math.round((cost / leads) * 100) / 100;
}
/** Only the currently supported search-only average-CPC strategy. Never switch strategy/platforms/dates. */
export function buildCampaignChange(c: Campaign, input: Change) {
  if (c.Id !== input.campaignId) throw Error("Кампания не совпадает");
  if (["ARCHIVED", "CONVERTED", "ENDED"].includes(c.State))
    throw Error("Кампания архивная или завершена");
  if (input.operation === "suspend" || input.operation === "resume") {
    return { method: input.operation, params: { SelectionCriteria: { Ids: [c.Id] } } };
  }
  if (input.operation === "addNegativeKeywords") {
    if (!["TEXT_CAMPAIGN", "UNIFIED_CAMPAIGN"].includes(c.Type))
      throw Error("Тип кампании не поддерживает эту правку");
    const added = input.negativeKeywords ?? [];
    for (const phrase of added) {
      const words = phrase.split(/\s+/);
      if (phrase.startsWith("-") || words.length > 7 || words.some((w) => w.length > 35))
        throw Error("Минус-фраза: до 7 слов по 35 символов, без начального минуса");
    }
    const items = [...new Set([...(c.NegativeKeywords?.Items ?? []), ...added])];
    if (items.join("").length > 20000) throw Error("Слишком большой список минус-фраз");
    return {
      method: "update",
      params: { Campaigns: [{ Id: c.Id, NegativeKeywords: { Items: items } }] },
    };
  }
  if (c.Type !== "UNIFIED_CAMPAIGN" || c.Currency !== "RUB")
    throw Error("Лимиты поддержаны только для ЕПК в рублях");
  const original = c.UnifiedCampaign?.BiddingStrategy;
  const strategy = structuredClone(original);
  const search = strategy?.Search;
  const network = strategy?.Network;
  if (
    !search ||
    search["BiddingStrategyType"] !== "AVERAGE_CPC" ||
    network?.["BiddingStrategyType"] !== "SERVING_OFF"
  )
    throw Error(
      "Для этой стратегии изменение лимитов пока выполняется в Директе. Поддержана поисковая ЕПК со средней ценой клика без РСЯ",
    );
  const cpc = search["AverageCpc"] as Record<string, Json> | undefined;
  const budget = cpc?.["CustomPeriodBudget"] as Record<string, Json> | undefined;
  if (
    !cpc ||
    !budget ||
    cpc["BudgetType"] !== "CUSTOM_PERIOD_BUDGET" ||
    budget["AutoContinue"] !== "NO"
  )
    throw Error("Поддержан бюджет на период с остановкой показов");
  if (input.periodBudgetRub) budget["SpendLimit"] = micros(input.periodBudgetRub);
  if (input.averageCpcRub) cpc["AverageCpc"] = micros(input.averageCpcRub);
  return {
    method: "update",
    params: { Campaigns: [{ Id: c.Id, UnifiedCampaign: { BiddingStrategy: strategy } }] },
  };
}

export function changeSummary(c: Campaign, input: Change) {
  const prefix = `Директ №${c.Id} «${c.Name}»`;
  if (input.operation === "suspend") return `${prefix}: остановить показы. ${input.reason}`;
  if (input.operation === "resume")
    return `${prefix}: возобновить показы с расходом рекламного бюджета. ${input.reason}`;
  if (input.operation === "addNegativeKeywords")
    return `${prefix}: добавить минус-фразы: ${input.negativeKeywords?.join(", ")}. ${input.reason}`;
  const before = c.UnifiedCampaign?.BiddingStrategy?.Search?.["AverageCpc"] as
    Record<string, unknown> | undefined;
  const budget = before?.["CustomPeriodBudget"] as Record<string, unknown> | undefined;
  return `${prefix}: ${input.periodBudgetRub ? `бюджет на прежний период ${Number(budget?.["SpendLimit"]) / 1e6} → ${input.periodBudgetRub} ₽ без НДС; ` : ""}${input.averageCpcRub ? `средняя цена клика ${Number(before?.["AverageCpc"]) / 1e6} → ${input.averageCpcRub} ₽ без НДС; ` : ""}сроки и площадки сохраняются. ${input.reason}`;
}
