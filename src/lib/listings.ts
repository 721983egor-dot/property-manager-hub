import { missingAvitoFields } from "@/lib/avito";
import { missingCianFields } from "@/lib/cian";
import { supabase } from "@/integrations/supabase/client";
import type { Property } from "@/lib/properties";
import { missingYandexFields } from "@/lib/yandex";

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
  short: string;
  available: boolean;
}[] = [
  { value: "site", label: "Сайт РМ", short: "Сайт", available: true },
  { value: "cian", label: "ЦИАН", short: "ЦИАН", available: true },
  { value: "yandex", label: "Яндекс Недвижимость", short: "Яндекс", available: true },
  { value: "avito", label: "Авито", short: "Авито", available: true },
];

export function platformLabel(value: ListingPlatform) {
  return PLATFORMS.find((p) => p.value === value)?.label ?? value;
}

/**
 * Объект в фиде площадки: явная публикация, либо автопубликация
 * при заполненных обязательных полях. Явное «снять» всегда сильнее.
 */
export function isFeedPublished(
  listing: Pick<PropertyListing, "published"> | undefined,
  autoPublish: boolean,
  ready: boolean,
): boolean {
  if (listing?.published === false) return false;
  if (listing?.published === true) return true;
  return autoPublish && ready;
}

export function feedPlatformReady(property: Property, platform: ListingPlatform): boolean {
  if (platform === "site") return true;
  if (platform === "yandex") return missingYandexFields(property).length === 0;
  if (platform === "cian") return missingCianFields(property).length === 0;
  if (platform === "avito") return missingAvitoFields(property).length === 0;
  return false;
}

export function isPlatformPublished(
  property: Property,
  platform: ListingPlatform,
  listing: Pick<PropertyListing, "published"> | undefined,
  autoPublish: Partial<Record<Exclude<ListingPlatform, "site">, boolean>> | undefined,
): boolean {
  if (platform === "site") return Boolean(property.published);
  return isFeedPublished(listing, Boolean(autoPublish?.[platform]), feedPlatformReady(property, platform));
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
