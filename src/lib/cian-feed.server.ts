/**
 * Сборка XML-фида ЦИАН (feed version 2, долгосрочная аренда).
 * Только сервер: читает объекты и публикации через сервисный клиент.
 */

import { missingCianFields } from "@/lib/cian";
import type { Property } from "@/lib/properties";

type Row = Record<string, unknown>;

const PHONE_COUNTRY_CODE = "7";
const PHONE_NUMBER = "9384420809";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${name}>${esc(String(value))}</${name}>`;
}

function cianCategory(type: string): string {
  switch (type) {
    case "house":
    case "villa":
      return "houseRent";
    case "townhouse":
      return "townhouseRent";
    default:
      return "flatRent";
  }
}

export type FeedSelection = {
  included: { property: Property; externalId: string }[];
  skipped: { property: Property; missing: string[] }[];
  autoPublish: boolean;
};

/**
 * Отбирает объекты для фида: помеченные к публикации на ЦИАН,
 * плюс все подходящие при включённой автопубликации.
 */
export async function computeFeedSelection(): Promise<FeedSelection> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: cred } = await supabaseAdmin
    .from("platform_credentials")
    .select("auto_publish")
    .eq("platform", "cian")
    .maybeSingle();
  const autoPublish = Boolean((cred as { auto_publish?: boolean } | null)?.auto_publish);

  const [{ data: properties }, { data: listings }] = await Promise.all([
    supabaseAdmin.from("properties").select("*").neq("status", "archived"),
    supabaseAdmin.from("property_listings").select("*").eq("platform", "cian"),
  ]);

  const listingByProperty = new Map(
    ((listings ?? []) as Row[]).map((l) => [String(l["property_id"]), l]),
  );

  const included: FeedSelection["included"] = [];
  const skipped: FeedSelection["skipped"] = [];

  for (const row of (properties ?? []) as Row[]) {
    const property = row as unknown as Property;
    const listing = listingByProperty.get(property.id);

    // Явно снят с публикации — в фид не берём при любой настройке.
    const explicitlyOff = listing && listing["published"] === false;
    const explicitlyOn = listing && listing["published"] === true;
    const inFeed = !explicitlyOff && (explicitlyOn || autoPublish);
    if (!inFeed) continue;

    // Фид должен отдавать фото в исходном порядке, как в карточке.
    const missing = missingCianFields(property);
    if (missing.length > 0) {
      skipped.push({ property, missing });
      continue;
    }

    // У связанных сверкой объявлений оставляем их ID ЦИАН, остальным — UUID объекта.
    const externalId = String(listing?.["external_id"] || property.id);
    included.push({ property, externalId });
  }

  return { included, skipped, autoPublish };
}

/** URL фото для фида: постоянный адрес на нашем сайте. */
export function feedPhotoUrl(origin: string, path: string): string {
  return `${origin}/api/public/feed-photo/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Комнатность по правилам ЦИАН: 9 — студия, 6 — многокомнатная, 7 — свободная планировка. */
function flatRoomsCount(rooms: number): number {
  if (rooms <= 0) return 9;
  if (rooms > 5) return 6;
  return rooms;
}

/** Один объект фида. */
function offerXml(property: Property, externalId: string, origin: string): string {
  const photos = (property.photos ?? [])
    .map((p) => p.path)
    .filter(Boolean)
    .map(
      (path, i) =>
        `<PhotoSchema><FullUrl>${esc(feedPhotoUrl(origin, path))}</FullUrl><IsDefault>${i === 0 ? "true" : "false"}</IsDefault></PhotoSchema>`,
    )
    .join("");

  const coordinates =
    property.latitude != null && property.longitude != null
      ? `<Coordinates>${tag("Lat", property.latitude)}${tag("Lng", property.longitude)}</Coordinates>`
      : "";

  const utilities = `<UtilitiesTerms><IncludedInPrice>${property.utilities_month == null ? "true" : "false"}</IncludedInPrice>${property.utilities_month != null ? tag("Price", property.utilities_month) : ""}</UtilitiesTerms>`;

  const bargainTerms = `<BargainTerms>${tag("Price", property.price_month)}<Currency>rur</Currency><LeaseTermType>longTerm</LeaseTermType>${tag("Deposit", property.deposit)}${utilities}</BargainTerms>`;

  const category = cianCategory(property.type);
  const isLand = category === "houseRent" || category === "townhouseRent";

  // Дома и таунхаусы: обязателен участок. Квартиры: комнатность, этаж и этажность дома.
  const specific = isLand
    ? `<Land>${tag("Area", property.land_area)}<AreaUnitType>sotka</AreaUnitType></Land>`
    : `${tag("FlatRoomsCount", flatRoomsCount(property.rooms))}${tag("FloorNumber", property.floor)}<Building>${tag("FloorsCount", property.total_floors)}</Building>${property.type === "aparts" ? "<IsApartments>true</IsApartments>" : ""}`;

  const wcs = property.bathrooms > 0 ? tag("SeparateWcsCount", property.bathrooms) : "";

  return `<Object>${tag("Category", category)}${tag("ExternalId", externalId)}${tag("Description", property.description)}${tag("Address", property.address)}${coordinates}<Phones><PhoneSchema>${tag("CountryCode", PHONE_COUNTRY_CODE)}${tag("Number", PHONE_NUMBER)}</PhoneSchema></Phones>${tag("TotalArea", property.area)}${specific}${wcs}<Photos>${photos}</Photos>${bargainTerms}</Object>`;
}

/** Полный XML фида. */
export function buildFeedXml(selection: FeedSelection, origin: string): string {
  const objects = selection.included
    .map(({ property, externalId }) => offerXml(property, externalId, origin))
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Feed><Feed_Version>2</Feed_Version>${objects}</Feed>`;
}
