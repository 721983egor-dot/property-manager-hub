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
  matchKeys: string[];
};

export type YandexDayStat = {
  date: string;
  impressions: number;
  views: number;
  contact_views: number;
  calls: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function asOffer(snippet: unknown): Record<string, unknown> {
  const row = asRecord(snippet);
  const nested = asRecord(row.offer);
  return Object.keys(nested).length > 0 ? nested : row;
}

function collectUuids(value: unknown, into: string[], depth = 0) {
  if (depth > 5 || into.length > 24) return;
  if (typeof value === "string") {
    const text = value.trim();
    if (UUID_RE.test(text)) into.push(text);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUuids(item, into, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectUuids(item, into, depth + 1);
  }
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
    const root = Object.keys(asRecord(raw.response)).length > 0 ? asRecord(raw.response) : raw;
    const listing = asRecord(root.listing);
    const snippets = Array.isArray(listing.snippets)
      ? listing.snippets
      : Array.isArray(listing.offers)
        ? listing.offers
        : Array.isArray(root.offers)
          ? root.offers
          : Array.isArray(root.snippets)
            ? root.snippets
            : [];
    for (const snippet of snippets) {
      const offer = asOffer(snippet);
      const state = asRecord(offer.state);
      const partner = asRecord(offer.partner);
      const errors = Array.isArray(state.errors) ? state.errors : [];
      const uuids: string[] = [];
      collectUuids(snippet, uuids);
      const internalId = pickText(
        offer.internalId,
        offer.internal_id,
        offer["internal-id"],
        partner.internalId,
        partner.internal_id,
        offer.xmlId,
        offer.xml_id,
        ...uuids,
      );
      offers.push({
        id: pickText(offer.id, offer.offerId, offer.offer_id),
        url: pickText(offer.url, offer.cardUrl, offer.card_url, offer.partnerUrl, offer.partner_url),
        internalId,
        feedId: pickText(offer.feedId, offer.feed_id),
        errors: errors
          .map((item) => (typeof item === "string" ? item : String(asRecord(item).type ?? "")))
          .filter(Boolean),
        matchKeys: Array.from(new Set([internalId, ...uuids].filter(Boolean))),
      });
    }
    const slicing = asRecord(listing.slicing);
    const total = Number(slicing.total ?? offers.length);
    offset += snippets.length;
    if (snippets.length < limit || offset >= total) break;
  }
  return offers;
}

function parseYandexDay(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  const dashed = text.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dashed) return `${dashed[3]}-${dashed[2]}-${dashed[1]}`;
  const dotted = text.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
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
  const daily = Array.isArray(stats.daily)
    ? stats.daily
    : Array.isArray(raw.daily)
      ? raw.daily
      : Array.isArray(stats.byDay)
        ? stats.byDay
        : [];
  return daily.flatMap((item) => {
    const row = asRecord(item);
    const date = parseYandexDay(row.day ?? row.date ?? row.time ?? row.timestamp);
    if (!date) return [];
    return [
      {
        date,
        impressions: Number(row.shows ?? row.impressions ?? 0),
        views: Number(row.cardShows ?? row.card_shows ?? row.views ?? row.shows ?? 0),
        contact_views: Number(row.phoneShows ?? row.phone_shows ?? 0),
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

function normalizeMatchKey(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase().replace(/^https?:\/\/www\./, "https://");
}

function addMatchKey(map: Map<string, string>, key: string, propertyId: string) {
  const normalized = normalizeMatchKey(key);
  if (!normalized || map.has(normalized)) return;
  map.set(normalized, propertyId);
}

function pathFromUrl(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return value.replace(/^https?:\/\/[^/]+/i, "").split("?")[0] ?? "";
  }
}

function offerLookupKeys(offer: YandexOffer): string[] {
  const keys = [...offer.matchKeys, offer.internalId, offer.url];
  if (UUID_RE.test(offer.id)) keys.push(offer.id);
  const path = pathFromUrl(offer.url);
  if (path) {
    keys.push(path);
    const ref = path.match(/-(\d+)\/?$/);
    if (ref) keys.push(`ref:${ref[1]}`);
  }
  return keys;
}

type YandexListingRow = {
  property_id: string;
  published: boolean;
  published_at: string | null;
  external_id: string;
  external_url: string;
};

async function loadYandexIndex() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { propertyPath } = await import("@/lib/seo");
  const { SITE_ORIGIN } = await import("@/lib/site");

  const [{ data: properties }, { data: listings }] = await Promise.all([
    supabaseAdmin.from("properties").select("id, title, ref_id"),
    supabaseAdmin
      .from("property_listings")
      .select("property_id, published, published_at, external_id, external_url")
      .eq("platform", "yandex"),
  ]);

  const byKey = new Map<string, string>();
  const byProperty = new Map<string, YandexListingRow>();

  for (const row of (properties ?? []) as { id: string; title: string; ref_id: number }[]) {
    addMatchKey(byKey, row.id, row.id);
    addMatchKey(byKey, `ref:${row.ref_id}`, row.id);
    const path = propertyPath(row);
    addMatchKey(byKey, path, row.id);
    addMatchKey(byKey, `${SITE_ORIGIN}${path}`, row.id);
  }
  for (const row of (listings ?? []) as YandexListingRow[]) {
    byProperty.set(row.property_id, row);
    addMatchKey(byKey, row.property_id, row.property_id);
    if (row.external_id) addMatchKey(byKey, row.external_id, row.property_id);
  }

  return { supabaseAdmin, byKey, byProperty };
}

function resolveYandexPropertyId(offer: YandexOffer, byKey: Map<string, string>): string | null {
  for (const key of offerLookupKeys(offer)) {
    const propertyId = byKey.get(normalizeMatchKey(key));
    if (propertyId && UUID_RE.test(propertyId)) return propertyId;
  }
  return null;
}

type YandexListingPatch = {
  last_synced_at: string;
  sync_status: string;
  sync_error: string;
  external_url?: string;
  external_id?: string;
  published?: boolean;
  published_at?: string;
  unpublished_at?: null;
};

function listingPatch(offer: YandexOffer, now: string, existing?: YandexListingRow): YandexListingPatch {
  const keepId = existing?.external_id?.trim();
  const feedId = UUID_RE.test(offer.internalId) ? offer.internalId : "";
  const yandexCard = /realty\.yandex\./i.test(offer.url);
  return {
    last_synced_at: now,
    sync_status: offer.errors.length ? "error" : "synced",
    sync_error: offer.errors.join(", "),
    ...(offer.url && (yandexCard || !existing?.external_url) ? { external_url: offer.url } : {}),
    ...(!keepId && feedId ? { external_id: feedId } : {}),
  };
}

async function upsertMatchedYandexListing(
  supabaseAdmin: Awaited<ReturnType<typeof loadYandexIndex>>["supabaseAdmin"],
  propertyId: string,
  offer: YandexOffer,
  existing: YandexListingRow | undefined,
  now: string,
) {
  const patch = listingPatch(offer, now, existing);
  if (existing?.published === false) {
    await supabaseAdmin.from("property_listings").update(patch).eq("property_id", propertyId).eq("platform", "yandex");
    return;
  }
  await supabaseAdmin.from("property_listings").upsert(
    {
      property_id: propertyId,
      platform: "yandex" as const,
      published: true,
      published_at: existing?.published_at || now,
      unpublished_at: null,
      external_id: existing?.external_id || (UUID_RE.test(offer.internalId) ? offer.internalId : propertyId),
      external_url: patch.external_url ?? existing?.external_url ?? "",
      last_synced_at: patch.last_synced_at,
      sync_status: patch.sync_status,
      sync_error: patch.sync_error,
    },
    { onConflict: "property_id,platform" },
  );
}

/**
 * Создаёт записи Яндекса для объектов, которые уже в XML-фиде,
 * но ещё не отмечены опубликованными в RM OS.
 */
export async function ensureYandexFeedListings(): Promise<number> {
  const { computeYandexFeedSelection } = await import("@/lib/yandex-feed.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const selection = await computeYandexFeedSelection();
  const now = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from("property_listings")
    .select("property_id, published, published_at, external_id, external_url")
    .eq("platform", "yandex");
  const byProperty = new Map(((existing ?? []) as YandexListingRow[]).map((row) => [row.property_id, row]));

  const rows = selection.included.flatMap(({ property, externalId }) => {
    const current = byProperty.get(property.id);
    if (current?.published === false) return [];
    return [
      {
        property_id: property.id,
        platform: "yandex" as const,
        published: true,
        published_at: current?.published_at || now,
        unpublished_at: null,
        external_id: current?.external_id || externalId,
        external_url: current?.external_url || "",
        last_synced_at: now,
        sync_status: current ? undefined : "in_feed",
        sync_error: current ? undefined : "",
      },
    ];
  });

  const toInsert = rows.filter((row) => !byProperty.has(row.property_id));
  const toPublish = rows.filter((row) => {
    const current = byProperty.get(row.property_id);
    return current && current.published !== true;
  });

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin.from("property_listings").upsert(
      toInsert.map((row) => ({
        ...row,
        sync_status: row.sync_status ?? "in_feed",
        sync_error: row.sync_error ?? "",
      })),
      { onConflict: "property_id,platform" },
    );
    if (error) throw new Error(error.message);
  }
  for (const row of toPublish) {
    await supabaseAdmin
      .from("property_listings")
      .update({
        published: true,
        published_at: row.published_at,
        unpublished_at: null,
        last_synced_at: now,
      })
      .eq("property_id", row.property_id)
      .eq("platform", "yandex");
  }
  return toInsert.length + toPublish.length;
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

  await ensureYandexFeedListings();
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

  const { byKey, byProperty, supabaseAdmin } = await loadYandexIndex();
  const now = new Date().toISOString();
  for (const offer of offers) {
    const propertyId = resolveYandexPropertyId(offer, byKey);
    if (!propertyId) continue;
    await upsertMatchedYandexListing(supabaseAdmin, propertyId, offer, byProperty.get(propertyId), now);
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

  await ensureYandexFeedListings();

  const safeDays = [7, 30, 90].includes(days) ? days : 30;
  const to = new Date();
  const from = new Date(to.getTime() - (safeDays - 1) * 86_400_000);
  const iso = (value: Date) => value.toISOString().slice(0, 10);

  const offers = await fetchYandexOffers(cfg);
  const { supabaseAdmin, byKey, byProperty } = await loadYandexIndex();

  const summary: { externalId: string; views: number; calls: number }[] = [];
  let synced = 0;

  for (const offer of offers) {
    const propertyId = resolveYandexPropertyId(offer, byKey);
    if (!propertyId || !offer.id) continue;
    let daysStats: YandexDayStat[] = [];
    try {
      daysStats = await fetchYandexOfferStats(cfg, offer.id, from, to);
    } catch {
      daysStats = [];
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
    await upsertMatchedYandexListing(supabaseAdmin, propertyId, offer, byProperty.get(propertyId), new Date().toISOString());
    const views = daysStats.reduce((sum, day) => sum + day.views, 0);
    const calls = daysStats.reduce((sum, day) => sum + day.calls, 0);
    summary.push({ externalId: offer.internalId || offer.id, views, calls });
    synced += 1;
  }

  return { configured: true, from: iso(from), to: iso(to), synced, offers: summary };
}
