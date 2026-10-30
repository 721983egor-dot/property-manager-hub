import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCampaignChange,
  acquisitionCost,
  campaignUtm,
  changeSchema,
  moscowPeriod,
  parseTsv,
  type Campaign,
} from "./model";
import { yandexClient, YandexApiError } from "./api.server";

function campaign(): Campaign {
  return {
    Id: 715631828,
    Name: "Аренда",
    Type: "UNIFIED_CAMPAIGN",
    State: "ON",
    Status: "ACCEPTED",
    Currency: "RUB",
    NegativeKeywords: { Items: ["посуточно"] },
    UnifiedCampaign: {
      TrackingParams: "utm_source=yandex&utm_campaign=rm_rent_search",
      BiddingStrategy: {
        Search: {
          BiddingStrategyType: "AVERAGE_CPC",
          PlacementTypes: { SearchResults: "YES", Maps: "NO" },
          AverageCpc: {
            AverageCpc: 30000000,
            BudgetType: "CUSTOM_PERIOD_BUDGET",
            CustomPeriodBudget: {
              SpendLimit: 16000000000,
              StartDate: "2026-10-30",
              EndDate: "2026-11-29",
              AutoContinue: "NO",
            },
          },
        },
        Network: { BiddingStrategyType: "SERVING_OFF" },
      },
    },
  };
}
test("report day boundaries follow Moscow and include today exactly once", () => {
  const p = moscowPeriod(7, new Date("2026-10-30T22:00:00Z"));
  assert.equal(p.start, "2026-10-25");
  assert.equal(p.end, "2026-10-31");
  assert.equal(p.since, "2026-10-25T00:00:00+03:00");
  assert.equal(p.until, "2026-10-31T21:00:00.000Z");
  assert.throws(() => moscowPeriod(0));
});
test("period budget and average CPC change preserve platform settings, dates and stop at end", () => {
  const before = campaign(),
    snapshot = structuredClone(before);
  const call = buildCampaignChange(
    before,
    changeSchema.parse({
      campaignId: before.Id,
      operation: "setSearchClickLimits",
      periodBudgetRub: 12000,
      averageCpcRub: 25.5,
      reason: "Тест",
    }),
  );
  const item = call.params.Campaigns![0]!;
  assert.ok("UnifiedCampaign" in item);
  const after = item.UnifiedCampaign.BiddingStrategy!;
  assert.equal((after.Search!["AverageCpc"] as Record<string, unknown>)["AverageCpc"], 25500000);
  assert.deepEqual((after.Search!["AverageCpc"] as Record<string, unknown>)["CustomPeriodBudget"], {
    SpendLimit: 12000000000,
    StartDate: "2026-10-30",
    EndDate: "2026-11-29",
    AutoContinue: "NO",
  });
  assert.deepEqual(after.Network, snapshot.UnifiedCampaign!.BiddingStrategy!.Network);
  assert.deepEqual(
    after.Search!["PlacementTypes"],
    snapshot.UnifiedCampaign!.BiddingStrategy!.Search!["PlacementTypes"],
  );
  assert.deepEqual(before, snapshot);
});
test("unsupported strategies/platforms/currency/archive cannot be silently replaced", () => {
  const input = changeSchema.parse({
    campaignId: 715631828,
    operation: "setSearchClickLimits",
    periodBudgetRub: 1000,
    reason: "Проверка",
  });
  for (const mutate of [
    (c: Campaign) => {
      c.State = "ARCHIVED";
    },
    (c: Campaign) => {
      c.Currency = "USD";
    },
    (c: Campaign) => {
      c.UnifiedCampaign!.BiddingStrategy!.Search!["BiddingStrategyType"] = "AVERAGE_CPA";
    },
    (c: Campaign) => {
      c.UnifiedCampaign!.BiddingStrategy!.Network!["BiddingStrategyType"] = "NETWORK_DEFAULT";
    },
  ]) {
    const c = campaign();
    mutate(c);
    assert.throws(() => buildCampaignChange(c, input));
  }
});
test("negative keyword additions never erase existing exclusions and reject invalid phrases", () => {
  const c = campaign();
  const call = buildCampaignChange(
    c,
    changeSchema.parse({
      campaignId: c.Id,
      operation: "addNegativeKeywords",
      negativeKeywords: ["посуточно", "работа"],
      reason: "Нецелевой спрос",
    }),
  );
  const item = call.params.Campaigns![0]!;
  assert.ok("NegativeKeywords" in item);
  assert.deepEqual(item.NegativeKeywords.Items, ["посуточно", "работа"]);
  assert.throws(() =>
    buildCampaignChange(
      c,
      changeSchema.parse({
        campaignId: c.Id,
        operation: "addNegativeKeywords",
        negativeKeywords: ["-работа"],
        reason: "Тест",
      }),
    ),
  );
  assert.equal(
    changeSchema.safeParse({
      campaignId: c.Id,
      operation: "resume",
      periodBudgetRub: 100,
      reason: "Тест",
    }).success,
    false,
  );
});
test("UTM mapping is explicit, never inferred from a similar campaign name", () => {
  assert.equal(campaignUtm(campaign()), "rm_rent_search");
  const c = {
    ...campaign(),
    Id: 999,
    UnifiedCampaign: { TrackingParams: "utm_campaign={campaign_id}" },
  };
  assert.equal(campaignUtm(c), null);
});
test("TSV keeps IDs and per-goal columns as strings; truncation/malformed data visible", () => {
  const report = parseTsv(
    "CampaignId\tAdId\tCost\tConversions_676665001_AUTO\n715631828\t1925597887222745107\t30.25\t1\n715631828\t1925597887222745107\t10.25\t0\n",
    1,
  );
  assert.equal(report.rows[0]!["AdId"], "1925597887222745107");
  assert.equal(report.rows[0]!["Cost"], "30.25");
  assert.equal(report.truncated, true);
  assert.throws(() => parseTsv("CampaignId\tCost\n123\n"));
});
const credentials = {
  login: "residence-more",
  counterId: 97013300,
  directToken: "SECRET_DIRECT",
  metrikaToken: "SECRET_METRIKA",
  tenantGoalId: 676665001,
  ownerGoalId: 676665229,
};
test("CPL is undefined for incomplete/stale statistics, no leads or invalid cost; zero spend remains valid", () => {
  assert.equal(acquisitionCost(1000, 4, true), 250);
  assert.equal(acquisitionCost(1000, 4, false), null);
  assert.equal(acquisitionCost(1000, 0, true), null);
  assert.equal(acquisitionCost(1000, null, true), null);
  assert.equal(acquisitionCost(Number.NaN, 4, true), null);
  assert.equal(acquisitionCost(0, 4, true), 0);
});
test("read calls cannot perform writes; queued reports do not become empty successful reports", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const api = yandexClient(credentials, (async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("", { status: 202 });
  }) as typeof fetch);
  await assert.rejects(
    api.report("ads", "2026-10-01", "2026-10-30"),
    (e: unknown) => e instanceof YandexApiError && e.code === "pending",
  );
  const body = JSON.parse(calls[0]!.init!.body as string);
  assert.equal(body.method, undefined);
  assert.equal(body.params.IncludeVAT, "NO");
  assert.deepEqual(body.params.Goals, ["676665001", "676665229"]);
  assert.equal((calls[0]!.init!.headers as Record<string, string>)["returnMoneyInMicros"], "false");
});
test("API errors cannot leak tokens or provider-supplied sensitive messages", async () => {
  const api = yandexClient(
    credentials,
    (async () =>
      new Response(JSON.stringify({ error: { error_code: 53, error_detail: "SECRET_DIRECT" } }), {
        status: 403,
      })) as typeof fetch,
  );
  await assert.rejects(
    api.campaigns(),
    (e: unknown) => e instanceof Error && e.message.includes("53") && !e.message.includes("SECRET"),
  );
});
test("Metrika preserves sampling and omitted rows metadata and restricts endpoint", async () => {
  let requested = "";
  const api = yandexClient(credentials, (async (url) => {
    requested = String(url);
    return Response.json({
      data: [],
      totals: [0],
      total_rows: 25,
      sampled: true,
      sample_share: 0.25,
    });
  }) as typeof fetch);
  const result = await api.metrika("2026-10-01", "2026-10-30");
  assert.equal(new URL(requested).origin, "https://api-metrika.yandex.net");
  assert.match(new URL(requested).searchParams.get("metrics")!, /goal676665001reaches/);
  assert.equal(result.sampled, true);
  assert.equal(result.truncated, true);
  assert.equal(result.sampleShare, 0.25);
});
