import { supabase } from "@/integrations/supabase/client";

export type ListingPlatform = "site" | "avito" | "cian" | "yandex";

export type PropertyListing = {
  id: string;
  property_id: string;
  platform: ListingPlatform;
  published: boolean;
  published_at: string | null;
  unpublished_at: string | null;
  external_id: string;
  external_url: string;
  last_synced_at: string | null;
  sync_status: string;
  sync_error: string;
};

const LISTING_COLUMNS =
  "id, property_id, platform, published, published_at, unpublished_at, external_id, external_url, last_synced_at, sync_status, sync_error";

export const PLATFORMS: {
  value: ListingPlatform;
  label: string;
  available: boolean;
}[] = [
  { value: "site", label: "Сайт РМ", available: true },
  { value: "cian", label: "ЦИАН", available: true },
  { value: "yandex", label: "Яндекс Недвижимость", available: true },
  { value: "avito", label: "Авито", available: false },
];

export function platformLabel(value: ListingPlatform) {
  return PLATFORMS.find((p) => p.value === value)?.label ?? value;
}


/** Все записи о публикациях (по всем объектам). */
export async function fetchListings(): Promise<PropertyListing[]> {
  const { data, error } = await supabase.from("property_listings").select(LISTING_COLUMNS);
  if (error) throw new Error(error.message);
  return (data ?? []) as PropertyListing[];
}

/** Публикации одного объекта. */
export async function fetchPropertyListings(propertyId: string): Promise<PropertyListing[]> {
  const { data, error } = await supabase
    .from("property_listings")
    .select(LISTING_COLUMNS)
    .eq("property_id", propertyId);
  if (error) throw new Error(error.message);
  return (data ?? []) as PropertyListing[];
}


/**
 * Публикация или снятие с публикации на сайте РМ:
 * меняет видимость объекта и сохраняет дату в журнале площадок.
 */
export async function setSitePublished(propertyId: string, published: boolean) {
  const now = new Date().toISOString();

  const { error: propError } = await supabase
    .from("properties")
    .update({ published })
    .eq("id", propertyId);
  if (propError) throw new Error(propError.message);

  const { error } = await supabase.from("property_listings").upsert(
    {
      property_id: propertyId,
      platform: "site" as const,
      published,
      published_at: published ? now : null,
      unpublished_at: published ? null : now,
      last_synced_at: now,
    },
    { onConflict: "property_id,platform" },
  );
  if (error) throw new Error(error.message);
}
