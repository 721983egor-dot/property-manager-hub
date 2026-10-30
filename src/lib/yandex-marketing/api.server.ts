import { createHash } from "node:crypto";
import { parseTsv, type Campaign } from "./model";

type Credentials = {
  directToken: string;
  metrikaToken: string;
  login: string;
  counterId: number;
  tenantGoalId: number;
  ownerGoalId: number;
};
export class YandexApiError extends Error {
  constructor(
    public code: string,
    public requestId = "",
  ) {
    super(
      code === "pending"
        ? "Яндекс формирует отчёт. Повторите обновление через несколько минут"
        : `API Яндекса: ${code}${requestId ? ` (запрос ${requestId})` : ""}`,
    );
  }
}
export function yandexClient(c: Credentials, transport: typeof fetch = fetch) {
  async function request(url: string, init: RequestInit) {
    try {
      return await transport(url, {
        ...init,
        signal: AbortSignal.timeout(25000),
        redirect: "error",
      });
    } catch {
      throw new YandexApiError("network_or_timeout");
    }
  }
  const headers = {
    Authorization: `Bearer ${c.directToken}`,
    "Client-Login": c.login,
    "Accept-Language": "en",
    "Content-Type": "application/json",
  };
  async function direct(
    service: "campaigns" | "ads",
    method: string,
    params: Record<string, unknown>,
  ) {
    if (!c.directToken) throw new YandexApiError("direct_not_connected");
    const response = await request(`https://api.direct.yandex.com/json/v501/${service}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ method, params }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.error || !body?.result)
      throw new YandexApiError(
        String(body?.error?.error_code ?? response.status),
        response.headers.get("RequestId") ?? "",
      );
    return body.result as Record<string, unknown>;
  }
  async function campaigns(ids?: number[]) {
    const all: Campaign[] = [];
    for (let offset = 0; offset < 10000; offset += 1000) {
      const result = await direct("campaigns", "get", {
        SelectionCriteria: ids ? { Ids: ids } : {},
        FieldNames: [
          "Id",
          "Name",
          "Type",
          "State",
          "Status",
          "StatusClarification",
          "Currency",
          "StartDate",
          "EndDate",
          "NegativeKeywords",
        ],
        UnifiedCampaignFieldNames: [
          "BiddingStrategy",
          "TrackingParams",
          "CounterIds",
          "PriorityGoals",
        ],
        UnifiedCampaignSearchStrategyPlacementTypesFieldNames: [
          "SearchResults",
          "ProductGallery",
          "DynamicPlaces",
          "Maps",
          "SearchOrganizationList",
        ],
        Page: { Limit: 1000, Offset: offset },
      });
      all.push(...(result["Campaigns"] as Campaign[]));
      if (!result["LimitedBy"]) return { campaigns: all, truncated: false };
    }
    return { campaigns: all, truncated: true };
  }
  async function report(kind: "campaigns" | "ads" | "queries", start: string, end: string) {
    if (!c.directToken) throw new YandexApiError("direct_not_connected");
    const type = {
      campaigns: "CAMPAIGN_PERFORMANCE_REPORT",
      ads: "AD_PERFORMANCE_REPORT",
      queries: "SEARCH_QUERY_PERFORMANCE_REPORT",
    }[kind];
    const fields = [
      "CampaignId",
      "CampaignName",
      ...(kind === "campaigns" ? ["Date"] : ["AdGroupId", "AdId"]),
      ...(kind === "queries" ? ["Query"] : []),
      "Impressions",
      "Clicks",
      "Cost",
      "Conversions",
    ];
    const params = {
      SelectionCriteria: { DateFrom: start, DateTo: end },
      FieldNames: fields,
      ReportType: type,
      DateRangeType: "CUSTOM_DATE",
      Format: "TSV",
      IncludeVAT: "NO",
      Goals: [String(c.tenantGoalId), String(c.ownerGoalId)],
      AttributionModels: ["AUTO"],
      Page: { Limit: 10001 },
      OrderBy: [{ Field: "Cost", SortOrder: "DESCENDING" }],
    };
    // Stable for a queued report, renewed hourly so today's figures do not stay frozen.
    const hash = createHash("sha256")
      .update(JSON.stringify(params) + c.login + Math.floor(Date.now() / 3600_000))
      .digest("hex")
      .slice(0, 24);
    const response = await request("https://api.direct.yandex.com/json/v501/reports", {
      method: "POST",
      headers: {
        ...headers,
        processingMode: "auto",
        returnMoneyInMicros: "false",
        skipReportHeader: "true",
        skipReportSummary: "true",
      },
      body: JSON.stringify({ params: { ...params, ReportName: `rm-os-${hash}` } }),
    });
    if ([201, 202].includes(response.status)) throw new YandexApiError("pending");
    if (response.status !== 200)
      throw new YandexApiError(String(response.status), response.headers.get("RequestId") ?? "");
    return {
      ...parseTsv(await response.text()),
      vatIncluded: false,
      attribution: "AUTO",
      goals: [c.tenantGoalId, c.ownerGoalId],
      start,
      end,
    };
  }
  async function metrika(start: string, end: string) {
    if (!c.metrikaToken) throw new YandexApiError("metrika_not_connected");
    const params = new URLSearchParams({
      ids: String(c.counterId),
      date1: start,
      date2: end,
      accuracy: "full",
      limit: "10000",
      timezone: "+03:00",
      include_undefined: "true",
      sort: "-ym:s:visits",
      dimensions: "ym:s:lastsignUTMSource,ym:s:lastsignUTMMedium,ym:s:lastsignUTMCampaign",
      metrics: `ym:s:visits,ym:s:users,ym:s:bounceRate,ym:s:pageDepth,ym:s:avgVisitDurationSeconds,ym:s:goal${c.tenantGoalId}reaches,ym:s:goal${c.ownerGoalId}reaches`,
    });
    const response = await request(`https://api-metrika.yandex.net/stat/v1/data?${params}`, {
      headers: { Authorization: `OAuth ${c.metrikaToken}` },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body?.data))
      throw new YandexApiError(String(response.status));
    return {
      rows: body.data as { dimensions: { name: string | null }[]; metrics: number[] }[],
      totals: body.totals as number[],
      sampled: Boolean(body.sampled),
      sampleShare: body.sample_share as number | undefined,
      truncated: Number(body.total_rows) > body.data.length,
      counterId: c.counterId,
      attribution: "lastSign",
      start,
      end,
    };
  }
  return { direct, campaigns, report, metrika };
}
