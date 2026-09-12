import { createServerFn } from "@tanstack/react-start";

import type { ListingPlatform } from "@/lib/listings";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PLATFORMS: ListingPlatform[] = ["site", "avito", "cian", "yandex"];

export type PlatformTotals = {
  views: number;
  contacts: number;
  favorites: number;
  leads: number;
  hasData: boolean;
};

export type PromoBoard = Record<string, Record<ListingPlatform, PlatformTotals>>;

export type PlatformDay = {
  date: string;
  site_views: number;
  site_contacts: number;
  avito_views: number;
  avito_contacts: number;
  cian_views: number;
  cian_contacts: number;
  yandex_views: number;
  yandex_contacts: number;
};

export type PropertyPlatformStats = {
  days: PlatformDay[];
  totals: Record<ListingPlatform, PlatformTotals>;
};

function emptyTotals(): PlatformTotals {
  return { views: 0, contacts: 0, favorites: 0, leads: 0, hasData: false };
}

function emptyBoardRow(): Record<ListingPlatform, PlatformTotals> {
  return {
    site: emptyTotals(),
    avito: emptyTotals(),
    cian: emptyTotals(),
    yandex: emptyTotals(),
  };
}

function range(input: { from?: string; to?: string }) {
  if (!input || !DATE_RE.test(input.from ?? "") || !DATE_RE.test(input.to ?? "")) {
    throw new Error("Некорректный период");
  }
  return { from: input.from!, to: input.to! };
}

function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

function emptyDay(date: string): PlatformDay {
  return {
    date,
    site_views: 0,
    site_contacts: 0,
    avito_views: 0,
    avito_contacts: 0,
    cian_views: 0,
    cian_contacts: 0,
    yandex_views: 0,
    yandex_contacts: 0,
  };
}

/** Сводка просмотров и обращений по всем объектам — для карточек публикаций. */
export const getPromoBoard = createServerFn({ method: "POST" })
  .inputValidator(range)
  .handler(async ({ data }): Promise<PromoBoard> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const board: PromoBoard = {};

    const ensure = (propertyId: string) => {
      if (!board[propertyId]) board[propertyId] = emptyBoardRow();
      return board[propertyId];
    };

    const { data: stats, error: statsError } = await supabaseAdmin
      .from("listing_stats")
      .select("property_id, platform, views, contact_views, favorites")
      .gte("date", data.from)
      .lte("date", data.to);
    if (statsError) throw new Error(statsError.message);

    for (const row of stats ?? []) {
      const platform = row.platform as ListingPlatform;
      if (!PLATFORMS.includes(platform) || platform === "site") continue;
      const bucket = ensure(row.property_id)[platform];
      bucket.views += row.views ?? 0;
      bucket.contacts += row.contact_views ?? 0;
      bucket.favorites += row.favorites ?? 0;
      bucket.hasData = true;
    }

    const { data: events, error: eventsError } = await supabaseAdmin
      .from("property_events")
      .select("property_id, event_type")
      .gte("occurred_at", `${data.from}T00:00:00.000Z`)
      .lte("occurred_at", `${data.to}T23:59:59.999Z`)
      .limit(50_000);
    if (eventsError) throw new Error(eventsError.message);

    for (const row of events ?? []) {
      const bucket = ensure(row.property_id).site;
      if (row.event_type === "page_view") bucket.views += 1;
      if (row.event_type === "contact_click") bucket.contacts += 1;
      if (row.event_type === "lead_submit") bucket.leads += 1;
      bucket.hasData = true;
    }

    return board;
  });

/** Подтягивает свежую статистику Авито по уже связанным объявлениям. */
export const refreshAvitoStats = createServerFn({ method: "POST" }).handler(async () => {
  const { syncAvitoListingIds, syncAvitoStats } = await import("@/lib/avito-chats.server");
  try {
    await syncAvitoListingIds();
  } catch {
    // Автозагрузка ещё не отдала номера — статистика по уже связанным объектам всё равно обновится.
  }
  const result = await syncAvitoStats();
  return { synced: result.synced };
});

/** Подтягивает статистику Яндекс Недвижимости по объявлениям из фида. */
export const refreshYandexStats = createServerFn({ method: "POST" }).handler(async () => {
  const { syncYandexListingStats } = await import("@/lib/yandex.server");
  const result = await syncYandexListingStats(30);
  if (!result.configured) return { configured: false, synced: 0 };
  return { configured: true, synced: result.synced };
});

/** Дневная статистика объекта по площадкам для графика. */
export const getPropertyPlatformStats = createServerFn({ method: "POST" })
  .inputValidator((input: { propertyId: string; from: string; to: string }) => {
    if (!input || !UUID_RE.test(input.propertyId)) throw new Error("Некорректный объект");
    const dates = range(input);
    return { propertyId: input.propertyId, ...dates };
  })
  .handler(async ({ data }): Promise<PropertyPlatformStats> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const byDay = new Map(eachDate(data.from, data.to).map((date) => [date, emptyDay(date)]));
    const totals = emptyBoardRow();

    const { data: stats, error: statsError } = await supabaseAdmin
      .from("listing_stats")
      .select("platform, date, views, contact_views, favorites")
      .eq("property_id", data.propertyId)
      .gte("date", data.from)
      .lte("date", data.to);
    if (statsError) throw new Error(statsError.message);

    for (const row of stats ?? []) {
      const platform = row.platform as Exclude<ListingPlatform, "site">;
      if (platform !== "avito" && platform !== "cian" && platform !== "yandex") continue;
      const day = byDay.get(String(row.date).slice(0, 10));
      if (!day) continue;
      const views = row.views ?? 0;
      const contacts = row.contact_views ?? 0;
      day[`${platform}_views`] += views;
      day[`${platform}_contacts`] += contacts;
      totals[platform].views += views;
      totals[platform].contacts += contacts;
      totals[platform].favorites += row.favorites ?? 0;
      totals[platform].hasData = true;
    }

    const { data: events, error: eventsError } = await supabaseAdmin
      .from("property_events")
      .select("event_type, occurred_at")
      .eq("property_id", data.propertyId)
      .gte("occurred_at", `${data.from}T00:00:00.000Z`)
      .lte("occurred_at", `${data.to}T23:59:59.999Z`)
      .limit(50_000);
    if (eventsError) throw new Error(eventsError.message);

    for (const row of events ?? []) {
      const day = byDay.get(String(row.occurred_at).slice(0, 10));
      if (!day) continue;
      if (row.event_type === "page_view") {
        day.site_views += 1;
        totals.site.views += 1;
        totals.site.hasData = true;
      }
      if (row.event_type === "contact_click") {
        day.site_contacts += 1;
        totals.site.contacts += 1;
        totals.site.hasData = true;
      }
      if (row.event_type === "lead_submit") {
        totals.site.leads += 1;
        totals.site.hasData = true;
      }
    }

    return {
      days: [...byDay.values()],
      totals,
    };
  });
