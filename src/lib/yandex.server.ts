/**
 * Клиент партнёрского API Яндекс Недвижимости (бета CRM API).
 * Документация: GET https://api.realty.yandex.net/2.0/crm/...
 * Авторизация: OAuth-токен кабинета + фиксированный заголовок Vertis.
 */

import { YANDEX_FEED_URL, YANDEX_OAUTH_URL } from "@/lib/yandex";

const API_BASE = "https://api.realty.yandex.net/2.0";
const VERTIS_DEFAULT = "Vertis crm-dff153a8ef1a90d3bff5ee378dee416606cf8915";

type YandexConfig = { token: string; vertisKey: string };

export type YandexFeedInfo = {
  id: string;
  url: string;
  status: string;
};

export type YandexOffer = {
  id: string;
  url: string;
  internalId: string;
  feedId: string;
  errors: string[];
};

export type YandexDayStat = {
  date: string;
  impressions: number;
  views: number;
  contact_views: number;
  calls: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function readYandexConfig(): Promise<YandexConfig | null> {
  const { getPlatformSecret } = await import("@/lib/platform-secrets.server");
  const token = (await getPlatformSecret("YANDEX_REALTY_TOKEN")).trim();
  if (!token) return null;
  const vertisRaw = (await getPlatformSecret("YANDEX_REALTY_VERTIS_KEY")).trim() || VERTIS_DEFAULT;
  return {
    token,
    vertisKey: vertisRaw.startsWith("Vertis ") ? vertisRaw : `Vertis ${vertisRaw}`,
  };
}

async function yandexGet(cfg: YandexConfig, path: string): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `OAuth ${cfg.token}`,
      "X-Authorization": cfg.vertisKey,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Яндекс Недвижимость ответила ошибкой ${response.status}: ${text.slice(0, 280)}`);
  }
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Яндекс Недвижимость вернула неожиданный ответ");
  }
}

function encodeTime(value: Date): string {
  return encodeURIComponent(value.toISOString());
}

export async function fetchYandexFeeds(cfg: YandexConfig): Promise<YandexFeedInfo[]> {
  const raw = asRecord(await yandexGet(cfg, "/crm/feeds"));
  const feeds = Array.isArray(raw.feeds) ? raw.feeds : [];
  return feeds.map((item) => {
    const row = asRecord(item);
    return {
      id: String(row.id ?? ""),
      url: String(row.url ?? ""),
      status: String(row.status ?? ""),
    };
  }).filter((feed) => feed.id);
}

export async function fetchYandexFeedState(
  cfg: YandexConfig,
  feedId: string,
): Promise<{ total: number; accepted: number; declined: number; errors: { type: string; count: number }[] }> {
  const raw = asRecord(await yandexGet(cfg, `/crm/feed/${encodeURIComponent(feedId)}/state`));
  const state = asRecord(raw.state);
  const errors = Array.isArray(state.errors) ? state.errors : [];
  return {
    total: Number(state.total ?? 0),
    accepted: Number(state.accepted ?? 0),
    declined: Number(state.declined ?? 0),
    errors: errors.map((item) => {
      const row = asRecord(item);
      return { type: String(row.type ?? ""), count: Number(row.count ?? 0) };
    }),
  };
}

export async function fetchYandexOffers(
  cfg: YandexConfig,
  params: { feedId?: string; errors?: string[] } = {},
): Promise<YandexOffer[]> {
  const offers: YandexOffer[] = [];
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (params.feedId) query.set("feedId", params.feedId);
    for (const error of params.errors ?? []) query.append("errors", error);
    const raw = asRecord(await yandexGet(cfg, `/crm/offers?${query.toString()}`));
    const listing = asRecord(raw.listing);
    const snippets = Array.isArray(listing.snippets) ? listing.snippets : [];
    for (const snippet of snippets) {
      const offer = asRecord(asRecord(snippet).offer);
      const state = asRecord(offer.state);
      const errors = Array.isArray(state.errors) ? state.errors : [];
      offers.push({
        id: String(offer.id ?? ""),
        url: String(offer.url ?? ""),
        internalId: String(offer.internalId ?? ""),
        feedId: String(offer.feedId ?? ""),
        errors: errors
          .map((item) => (typeof item === "string" ? item : String(asRecord(item).type ?? "")))
          .filter(Boolean),
      });
    }
    const slicing = asRecord(listing.slicing);
    const total = Number(slicing.total ?? offers.length);
    offset += snippets.length;
    if (snippets.length < limit || offset >= total) break;
  }
  return offers;
}

function parseYandexDay(value: string): string | null {
  const match = String(value).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

export async function fetchYandexOfferStats(
  cfg: YandexConfig,
  offerId: string,
  from: Date,
  to: Date,
): Promise<YandexDayStat[]> {
  const path =
    `/crm/offer/${encodeURIComponent(offerId)}/stats` +
    `?startTime=${encodeTime(from)}&endTime=${encodeTime(to)}`;
  const raw = asRecord(await yandexGet(cfg, path));
  const stats = asRecord(raw.stats);
  const daily = Array.isArray(stats.daily) ? stats.daily : [];
  return daily.flatMap((item) => {
    const row = asRecord(item);
    const date = parseYandexDay(String(row.day ?? ""));
    if (!date) return [];
    return [
      {
        date,
        impressions: Number(row.shows ?? 0),
        views: Number(row.cardShows ?? row.shows ?? 0),
        contact_views: Number(row.phoneShows ?? 0),
        calls: Number(row.calls ?? 0),
      },
    ];
  });
}

function preferredFeed(feeds: YandexFeedInfo[]): YandexFeedInfo | null {
  return (
    feeds.find((feed) => feed.status === "ACCEPTED") ??
    feeds.find((feed) => feed.status !== "DELETED" && feed.status !== "ARCHIVE") ??
    feeds[0] ??
    null
  );
}

export type YandexStatusSnapshot = {
  configured: true;
  checkedAt: string;
  feedId: string;
  feedStatus: string;
  total: number;
  accepted: number;
  rejected: number;
  problems: { externalId: string; message: string }[];
};

/** Сводка по фиду и отклонённым объявлениям. Связывает офферы с объектами RM OS. */
export async function loadYandexFeedStatus(): Promise<
  { configured: false; oauthUrl: string; feedUrl: string } | YandexStatusSnapshot
> {
  const cfg = await readYandexConfig();
  if (!cfg) return { configured: false, oauthUrl: YANDEX_OAUTH_URL, feedUrl: YANDEX_FEED_URL };

  const feeds = await fetchYandexFeeds(cfg);
  const feed = preferredFeed(feeds);
  const offers = await fetchYandexOffers(cfg, feed?.id ? { feedId: feed.id } : {});
  let total = offers.length;
  let accepted = offers.filter((offer) => offer.errors.length === 0).length;
  let declined = offers.length - accepted;
  if (feed) {
    try {
      const state = await fetchYandexFeedState(cfg, feed.id);
      total = state.total || total;
      accepted = state.accepted || accepted;
      declined = state.declined || declined;
    } catch {
      // /state иногда недоступен — хватает списка объявлений.
    }
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  for (const offer of offers) {
    if (!offer.internalId) continue;
    const patch = {
      last_synced_at: now,
      sync_status: offer.errors.length ? "error" : "synced",
      sync_error: offer.errors.join(", "),
      ...(offer.url ? { external_url: offer.url } : {}),
      ...(offer.id ? { external_id: offer.internalId } : {}),
    };
    await supabaseAdmin
      .from("property_listings")
      .update(patch)
      .eq("platform", "yandex")
      .eq("external_id", offer.internalId);
    await supabaseAdmin
      .from("property_listings")
      .update(patch)
      .eq("platform", "yandex")
      .eq("property_id", offer.internalId);
  }

  return {
    configured: true,
    checkedAt: now,
    feedId: feed?.id ?? "",
    feedStatus: feed?.status ?? "UNKNOWN",
    total,
    accepted,
    rejected: declined,
    problems: offers
      .filter((offer) => offer.errors.length > 0)
      .slice(0, 50)
      .map((offer) => ({
        externalId: offer.internalId || offer.id,
        message: offer.errors.join(", ") || "Объявление отклонено",
      })),
  };
}

export type YandexStatsSnapshot = {
  configured: true;
  from: string;
  to: string;
  synced: number;
  offers: { externalId: string; views: number; calls: number }[];
};

/** Подтягивает дневную статистику объявлений в listing_stats. */
export async function syncYandexListingStats(days = 30): Promise<
  { configured: false; oauthUrl: string; feedUrl: string } | YandexStatsSnapshot
> {
  const cfg = await readYandexConfig();
  if (!cfg) return { configured: false, oauthUrl: YANDEX_OAUTH_URL, feedUrl: YANDEX_FEED_URL };

  const safeDays = [7, 30, 90].includes(days) ? days : 30;
  const to = new Date();
  const from = new Date(to.getTime() - (safeDays - 1) * 86_400_000);
  const iso = (value: Date) => value.toISOString().slice(0, 10);

  const offers = await fetchYandexOffers(cfg);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: listings } = await supabaseAdmin
    .from("property_listings")
    .select("property_id, external_id")
    .eq("platform", "yandex");
  const { data: properties } = await supabaseAdmin.from("properties").select("id");
  const byExternal = new Map<string, string>();
  for (const row of (properties ?? []) as { id: string }[]) {
    byExternal.set(row.id, row.id);
  }
  for (const row of (listings ?? []) as { property_id: string; external_id: string }[]) {
    if (row.external_id) byExternal.set(row.external_id, row.property_id);
    byExternal.set(row.property_id, row.property_id);
  }

  const summary: { externalId: string; views: number; calls: number }[] = [];
  let synced = 0;

  for (const offer of offers) {
    const propertyId = byExternal.get(offer.internalId) ?? byExternal.get(offer.id);
    if (!propertyId || !/^[0-9a-f-]{36}$/i.test(propertyId) || !offer.id) continue;
    let daysStats: YandexDayStat[] = [];
    try {
      daysStats = await fetchYandexOfferStats(cfg, offer.id, from, to);
    } catch {
      continue;
    }
    if (daysStats.length > 0) {
      await supabaseAdmin.from("listing_stats").upsert(
        daysStats.map((day) => ({
          property_id: propertyId,
          platform: "yandex" as const,
          date: day.date,
          impressions: day.impressions,
          views: day.views,
          contact_views: day.contact_views,
          calls: day.calls,
          messages: 0,
          favorites: 0,
        })),
        { onConflict: "property_id,platform,date" },
      );
    }
    await supabaseAdmin
      .from("property_listings")
      .update({
        last_synced_at: new Date().toISOString(),
        sync_status: offer.errors.length ? "error" : "synced",
        sync_error: offer.errors.join(", "),
        ...(offer.url ? { external_url: offer.url } : {}),
      })
      .eq("property_id", propertyId)
      .eq("platform", "yandex");
    const views = daysStats.reduce((sum, day) => sum + day.views, 0);
    const calls = daysStats.reduce((sum, day) => sum + day.calls, 0);
    summary.push({ externalId: offer.internalId || offer.id, views, calls });
    synced += 1;
  }

  return { configured: true, from: iso(from), to: iso(to), synced, offers: summary };
}
