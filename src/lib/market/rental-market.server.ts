import type { SupabaseClient } from "@supabase/supabase-js";
import { crmAccess } from "@/lib/crm-results.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import baseline from "./ideal-house.snapshot.json";
import siteCatalog from "./site-catalog.snapshot.json";
import {
  isMarketCatalogEntry,
  marketAddress,
  marketHomes,
  monthPoints,
  summarizeMarket,
  type MarketBuilding,
  type MarketComplex,
  type MarketGroup,
  type MarketPoint,
  type MarketProperty,
  type MarketSnapshot,
} from "./model";

const baselineKey = "flat:сочи:" + marketAddress("Курортный проспект, 92/5")?.key;
const admin = supabaseAdmin as unknown as SupabaseClient;

async function catalog(db: SupabaseClient) {
  if (process.env["SUPABASE_PROJECT_ID"] === "local-test") {
    return {
      homes: marketHomes(siteCatalog.properties, siteCatalog.complexes),
      properties: siteCatalog.properties as MarketProperty[],
      published: new Set(siteCatalog.properties.map((property) => property.id)),
      ownSourceIds: new Set<string>(),
      siteAsOf: siteCatalog.asOf,
    };
  }
  const recovery =
    process.env["SUPABASE_PROJECT_ID"] === "rmos-recovery" && process.env["PREVIEW_MODE"] === "1";
  const properties: MarketProperty[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db
      .from("properties")
      .select(
        "id,title,address,type,complex_id,complex_name,area,floor,price_month,summer_price_month,published",
      )
      .neq("status", "archived")
      .neq("portfolio", "n11");
    query = recovery
      ? query.eq("crm_published", true).eq("preview_published", true)
      : query.eq("published", true);
    const { data, error } = await query.order("id").range(offset, offset + 499);
    if (error) throw new Error(error.message);
    properties.push(
      ...(data as MarketProperty[]).filter((row) =>
        isMarketCatalogEntry(row.title, row.address, row.complex_name),
      ),
    );
    if (!data || data.length < 500) break;
  }
  const complexes: MarketComplex[] = [];
  const excludedComplexes = new Set<string>();
  const linkedComplexes = new Set(properties.map((property) => property.complex_id));
  for (let offset = 0; ; offset += 500) {
    const result = await db
      .from("complexes")
      .select(
        recovery
          ? "id,name,show_in_site_filter,crm_published,preview_published"
          : "id,name,show_in_site_filter",
      )
      .order("id")
      .range(offset, offset + 499);
    if (result.error) throw new Error(result.error.message);
    for (const row of result.data as (MarketComplex & {
      show_in_site_filter: boolean;
      crm_published?: boolean;
      preview_published?: boolean;
    })[]) {
      if (!isMarketCatalogEntry(row.name)) {
        excludedComplexes.add(row.id);
        continue;
      }
      const listedOnSite =
        row.show_in_site_filter !== false &&
        (!recovery || (row.crm_published && row.preview_published));
      if (listedOnSite || linkedComplexes.has(row.id))
        complexes.push({ id: row.id, name: row.name });
    }
    if (result.data.length < 500) break;
  }
  const catalogProperties = properties.filter(
    (row) => !row.complex_id || !excludedComplexes.has(row.complex_id),
  );
  const published = new Set(catalogProperties.map((row) => row.id));
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    const platform = await db
      .from("property_listings")
      .select("platform,external_id,external_url")
      .order("id")
      .range(offset, offset + 499);
    if (platform.error) throw new Error(platform.error.message);
    for (const row of platform.data) {
      const id = listingId(row["external_url"]) || String(row["external_id"] ?? "");
      if (id) ids.add(String(row["platform"]) + ":" + id);
    }
    if (platform.data.length < 500) break;
  }
  return {
    homes: marketHomes(catalogProperties, complexes),
    properties: catalogProperties,
    published,
    ownSourceIds: ids,
    siteAsOf: null,
  };
}

function listingId(url: unknown) {
  return typeof url === "string" ? url.split(/[?#]/u)[0]?.match(/(\d{6,})\/?$/u)?.[1] : undefined;
}

type SnapshotRow = {
  house_key: string;
  snapshot_day: string;
  checked_at: string;
  active_count: number;
  median_price: number | null;
  median_days: number | null;
  group_ids: string[];
  samples: MarketPoint["samples"];
  listings?: MarketGroup[];
};

function point(row: SnapshotRow): MarketPoint {
  return {
    day: row.snapshot_day,
    checkedAt: row.checked_at,
    active: row.active_count,
    median: row.median_price,
    medianDays: row.median_days,
    groupIds: row.group_ids,
    samples: row.samples,
  };
}

const seed: MarketSnapshot = {
  houseKey: baselineKey,
  day: baseline.checkedAt.slice(0, 10),
  checkedAt: baseline.checkedAt,
  listings: baseline.listings,
};

export async function readRentalMarket(houseId?: string, propertyId?: string) {
  await crmAccess();
  const db = admin;
  const data = await catalog(db);
  const allPoints = new Map<string, MarketPoint[]>();
  for (let offset = 0; ; offset += 500) {
    const result = await db
      .rpc("rental_market_monthly", {
        p_since: new Date(Date.now() - 370 * 86_400_000).toISOString().slice(0, 10),
      })
      .order("snapshot_day", { ascending: false })
      .order("house_key")
      .range(offset, offset + 499);
    if (result.error) throw new Error(result.error.message);
    for (const row of result.data as SnapshotRow[]) {
      const prior = allPoints.get(row.house_key) ?? [];
      prior.push(point(row));
      allPoints.set(row.house_key, prior);
    }
    if (result.data.length < 500) break;
  }
  const pilotPoints = allPoints.get(baselineKey) ?? [];
  if (!pilotPoints.some((item) => item.day === seed.day)) pilotPoints.push(summarizeMarket(seed));
  allPoints.set(baselineKey, pilotPoints);
  const titles = new Map(data.properties.map((property) => [property.id, property.title]));
  const houses: MarketBuilding[] = data.homes.map((house) => {
    const monthly = monthPoints(allPoints.get(house.id) ?? []);
    const latest = monthly.at(-1) ?? null;
    const previousMonth = monthly.at(-2) ?? null;
    return {
      ...house,
      propertyNames: house.propertyIds.flatMap((id) => titles.get(id) ?? []),
      published: house.propertyIds.filter((id) => data.published.has(id)).length,
      monthly,
      latest,
      previousMonth,
    };
  });
  const selected = houses.find((house) =>
    houseId ? house.id === houseId : propertyId && house.propertyIds.includes(propertyId),
  );
  let detail = null;
  if (selected) {
    const result = await db
      .from("rental_market_snapshots")
      .select("house_key,snapshot_day,checked_at,listings")
      .eq("house_key", selected.id)
      .order("snapshot_day", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    const found = result.data as Pick<
      SnapshotRow,
      "house_key" | "snapshot_day" | "checked_at" | "listings"
    > | null;
    const snapshot = found?.listings
      ? {
          houseKey: found.house_key,
          day: found.snapshot_day,
          checkedAt: found.checked_at,
          listings: found.listings,
        }
      : selected.id === baselineKey
        ? seed
        : null;
    const ids = new Set(selected.propertyIds);
    detail = {
      house: selected,
      snapshot,
      own: data.properties.filter((property) => ids.has(property.id)),
    };
  }
  return {
    houses,
    detail,
    siteAsOf: data.siteAsOf,
    updatesConfigured: Boolean(process.env["METRAPI_API_KEY"]),
  };
}

export async function rentalMarketSyncCatalog() {
  const data = await catalog(admin);
  const result = await admin
    .from("rental_market_snapshots")
    .select("house_key,snapshot_day")
    .order("snapshot_day", { ascending: false })
    .limit(1000);
  if (result.error) throw new Error(result.error.message);
  const seen = new Map<string, string>();
  for (const row of result.data) {
    const id = String(row["house_key"]);
    if (!seen.has(id)) seen.set(id, String(row["snapshot_day"]));
  }
  return { ...data, seen };
}

export async function saveMarketSnapshot(snapshot: MarketSnapshot) {
  const summary = summarizeMarket(snapshot);
  const result = await admin.from("rental_market_snapshots").upsert(
    {
      house_key: snapshot.houseKey,
      snapshot_day: snapshot.day,
      checked_at: snapshot.checkedAt,
      active_count: summary.active,
      median_price: summary.median,
      median_days: summary.medianDays,
      group_ids: summary.groupIds,
      samples: summary.samples,
      listings: snapshot.listings,
    },
    { onConflict: "house_key,snapshot_day" },
  );
  if (result.error) throw new Error(result.error.message);
}
