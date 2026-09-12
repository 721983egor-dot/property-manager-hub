import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { Complex } from "@/lib/complexes";
import type { Property, PropertyPhoto } from "@/lib/properties";
import { complexSlug } from "@/lib/seo";

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeProperty(row: Record<string, unknown>): Property {
  return {
    ...(row as unknown as Property),
    photos: Array.isArray(row["photos"]) ? (row["photos"] as PropertyPhoto[]) : [],
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
    photos: Array.isArray(row["photos"]) ? (row["photos"] as PropertyPhoto[]) : [],
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
