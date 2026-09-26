import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { Complex } from "@/lib/complexes";
import { propertyMediaFromRow, splitPropertyMedia, type Property, type PropertyPhoto } from "@/lib/properties";
import { addDays, parseISODate, toISODate } from "@/lib/rentals";
import { complexSlug } from "@/lib/seo";

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeProperty(row: Record<string, unknown>): Property {
  return {
    ...(row as unknown as Property),
    ...propertyMediaFromRow(row),
    published: Boolean(row["published"]),
    outdoor_spaces: Array.isArray(row["outdoor_spaces"]) ? (row["outdoor_spaces"] as string[]) : [],
    appliances: Array.isArray(row["appliances"]) ? (row["appliances"] as string[]) : [],
    bathroom_features: Array.isArray(row["bathroom_features"])
      ? (row["bathroom_features"] as string[])
      : [],
    extra_features: Array.isArray(row["extra_features"]) ? (row["extra_features"] as string[]) : [],
    card_highlights: Array.isArray(row["card_highlights"]) ? (row["card_highlights"] as string[]) : [],
    location_description:
      typeof row["location_description"] === "string" ? (row["location_description"] as string) : "",
    rent_terms: typeof row["rent_terms"] === "string" ? (row["rent_terms"] as string) : "",
    complex_name: typeof row["complex_name"] === "string" ? (row["complex_name"] as string) : "",
    service_type: row["service_type"] === "commission_only" ? "commission_only" : "management",
    latitude: num(row["latitude"]),
    longitude: num(row["longitude"]),
    price_month: num(row["price_month"]),
    summer_price_month: num(row["summer_price_month"]),
    area: num(row["area"]),
    land_area: num(row["land_area"]),
    floor: num(row["floor"]),
    total_floors: num(row["total_floors"]),
    is_apartments: typeof row["is_apartments"] === "boolean" ? (row["is_apartments"] as boolean) : null,
    ref_id: Number(row["ref_id"]) || 0,
  };
}

function normalizeComplex(row: Record<string, unknown>): Complex {
  return {
    ...(row as unknown as Complex),
    photos: Array.isArray(row["photos"]) ? splitPropertyMedia(row["photos"] as PropertyPhoto[]).images : [],
    infrastructure: Array.isArray(row["infrastructure"]) ? (row["infrastructure"] as string[]) : [],
    main_photo: typeof row["main_photo"] === "string" ? (row["main_photo"] as string) : null,
    description: typeof row["description"] === "string" ? (row["description"] as string) : "",
    location_description:
      typeof row["location_description"] === "string" ? (row["location_description"] as string) : "",
    show_in_site_filter: row["show_in_site_filter"] !== false,
  };
}

/** Все опубликованные объекты для каталога, главной и sitemap. */
export async function loadPublishedProperties(): Promise<Property[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("*")
    .eq("published", true)
    .neq("status", "archived")
    .neq("portfolio", "n11" as never)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => normalizeProperty(row as Record<string, unknown>));
}

export const listPublishedProperties = createServerFn({ method: "POST" }).handler(loadPublishedProperties);

/** Жилые комплексы для фильтра и посадочных страниц. */
export async function loadPublicComplexes(): Promise<Complex[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("complexes").select("*").order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => normalizeComplex(row as Record<string, unknown>));
}

export const listPublicComplexes = createServerFn({ method: "POST" }).handler(loadPublicComplexes);

/** Один комплекс для публичной карточки объекта. Без входа в RM OS. */
export const getPublicComplex = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ data }) => {
    const id = String(data.id ?? "").trim();
    if (!id) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("complexes").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return row ? normalizeComplex(row as Record<string, unknown>) : null;
  });

export function publicComplexQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["public-complex", id],
    queryFn: () => getPublicComplex({ data: { id } }),
  });
}

export function publishedPropertiesQueryOptions() {
  return queryOptions({
    queryKey: ["published-properties"],
    queryFn: () => listPublishedProperties(),
  });
}

export function publicComplexesQueryOptions() {
  return queryOptions({
    queryKey: ["public-complexes"],
    queryFn: () => listPublicComplexes(),
  });
}

export type PublicAvailabilityMaps = {
  /** Первый свободный день = конец текущей аренды + 1. */
  freeFrom: Record<string, string>;
  /** Дата следующего заезда после текущего выезда (если есть). */
  nextStart: Record<string, string>;
};

/**
 * Даты «свободно с» и следующего заезда для опубликованных объектов.
 * Без персональных данных. Нужны, чтобы не показывать объект, если окно
 * между выездом и следующим заездом меньше 30 суток.
 */
export async function loadPublicAvailability(): Promise<PublicAvailabilityMaps> {
  const today = toISODate(new Date());
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("property_id, end_date")
    .neq("status", "cancelled")
    .lte("start_date", today)
    .gte("end_date", today);
  if (error) throw new Error(error.message);

  const freeFrom: Record<string, string> = {};
  for (const row of data ?? []) {
    if (!row.property_id || !row.end_date) continue;
    freeFrom[row.property_id] = toISODate(addDays(parseISODate(row.end_date), 1));
  }

  const nextStart: Record<string, string> = {};
  const propertyIds = Object.keys(freeFrom);
  if (propertyIds.length > 0) {
    const { data: upcoming, error: upcomingError } = await supabaseAdmin
      .from("bookings")
      .select("property_id, start_date")
      .neq("status", "cancelled")
      .in("property_id", propertyIds)
      .gt("start_date", today)
      .order("start_date", { ascending: true });
    if (upcomingError) throw new Error(upcomingError.message);

    for (const row of upcoming ?? []) {
      if (!row.property_id || !row.start_date) continue;
      if (nextStart[row.property_id]) continue;
      const freeFromIso = freeFrom[row.property_id];
      if (!freeFromIso || row.start_date < freeFromIso) continue;
      nextStart[row.property_id] = row.start_date;
    }
  }

  return { freeFrom, nextStart };
}

/** @deprecated Используйте loadPublicAvailability — оставлен для совместимости. */
export async function loadPublicFreeFromDates(): Promise<Record<string, string>> {
  const { freeFrom } = await loadPublicAvailability();
  return freeFrom;
}

export const listPublicAvailability = createServerFn({ method: "POST" }).handler(loadPublicAvailability);

export function publicFreeFromQueryOptions() {
  return queryOptions({
    queryKey: ["public-availability"],
    queryFn: () => listPublicAvailability(),
  });
}

/** Окно учёта просмотров карточек для блока «Популярные объекты» на главной. */
const POPULAR_VIEWS_DAYS = 90;

/**
 * Число page_view по объектам за последние N дней (анонимная аналитика сайта).
 * Нужно для смеси «новые + популярные» на главной.
 */
export async function loadPropertyPageViewCounts(
  days = POPULAR_VIEWS_DAYS,
): Promise<Record<string, number>> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - Math.max(1, days));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("property_events")
    .select("property_id")
    .eq("event_type", "page_view")
    .gte("occurred_at", since.toISOString())
    .limit(50_000);
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = row.property_id;
    if (!id) continue;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export const listPropertyPageViewCounts = createServerFn({ method: "POST" }).handler(
  async () => loadPropertyPageViewCounts(),
);

export function publicPropertyViewCountsQueryOptions() {
  return queryOptions({
    queryKey: ["public-property-view-counts"],
    queryFn: () => listPropertyPageViewCounts(),
    staleTime: 5 * 60_000,
  });
}

export function resolveComplexBySlug(complexes: Complex[], slug: string): Complex | null {
  const wanted = slug.trim().toLowerCase();
  if (!wanted) return null;
  const withSlug = complexes.map((c) => ({ complex: c, slug: complexSlug(c, complexes) }));
  return withSlug.find((item) => item.slug === wanted)?.complex ?? null;
}

export function publicComplexBySlugQueryOptions(slug: string) {
  return queryOptions({
    queryKey: ["public-complex-by-slug", slug],
    queryFn: async () => {
      const complexes = await listPublicComplexes();
      const complex = resolveComplexBySlug(complexes, slug);
      if (!complex) throw new Error("Комплекс не найден");
      return { complex, complexes };
    },
  });
}
