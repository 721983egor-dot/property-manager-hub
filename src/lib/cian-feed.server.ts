/**
 * Сборка XML-фида ЦИАН (feed version 2, долгосрочная аренда).
 * Только сервер: читает объекты и публикации через сервисный клиент.
 */

import { cianSchemaGaps, missingCianFields } from "@/lib/cian";
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
  included: { property: Property; externalId: string; gaps: string[] }[];
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
    included.push({ property, externalId, gaps: cianSchemaGaps(property) });
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

/** Комиссия клиента в процентах от месячной цены (в базе хранится как процент). */
function clientFeePercent(property: Property): number | null {
  if (property.commission == null) return null;
  return Math.round(property.commission);
}

/** Условия сделки — порядок элементов по схеме ЦИАН. */
function bargainTermsXml(property: Property): string {
  const utilities = `<UtilitiesTerms><IncludedInPrice>${property.utilities_month == null ? "true" : "false"}</IncludedInPrice>${property.utilities_month != null ? tag("Price", Math.round(property.utilities_month)) : ""}</UtilitiesTerms>`;
  const fee = clientFeePercent(property);
  return [
    "<BargainTerms>",
    tag("Price", property.price_month),
    utilities,
    "<Currency>rur</Currency>",
    "<LeaseTermType>longTerm</LeaseTermType>",
    property.deposit != null ? tag("Deposit", Math.round(property.deposit)) : "",
    fee != null ? tag("ClientFee", fee) : "",
    "</BargainTerms>",
  ].join("");
}

function photosXml(property: Property, origin: string): string {
  const items = (property.photos ?? [])
    .map((p) => p.path)
    .filter(Boolean)
    .map(
      (path, i) =>
        `<PhotoSchema><FullUrl>${esc(feedPhotoUrl(origin, path))}</FullUrl><IsDefault>${i === 0 ? "true" : "false"}</IsDefault></PhotoSchema>`,
    )
    .join("");
  return items ? `<Photos>${items}</Photos>` : "";
}

/** Один объект фида: элементы идут в порядке, заданном схемой категории. */
function offerXml(property: Property, externalId: string, origin: string): string {
  const category = cianCategory(property.type);
  const isLand = category !== "flatRent";

  const coordinates =
    property.latitude != null && property.longitude != null
      ? `<Coordinates>${tag("Lat", property.latitude)}${tag("Lng", property.longitude)}</Coordinates>`
      : "";
  const phones = `<Phones><PhoneSchema>${tag("CountryCode", PHONE_COUNTRY_CODE)}${tag("Number", PHONE_NUMBER)}</PhoneSchema></Phones>`;
  const photos = photosXml(property, origin);
  const repair = tag("RepairType", property.repair_type);
  const beds = property.beds_count != null ? tag("BedsCount", property.beds_count) : "";
  const building =
    property.total_floors != null ? `<Building>${tag("FloorsCount", property.total_floors)}</Building>` : "";

  if (isLand) {
    const land =
      property.land_area != null
        ? `<Land>${tag("Area", property.land_area)}<AreaUnitType>sotka</AreaUnitType>${tag("Status", property.land_status)}</Land>`
        : "";
    return [
      "<object>",
      tag("Category", category),
      tag("ExternalId", externalId),
      tag("Description", property.description),
      beds,
      tag("Address", property.address),
      coordinates,
      phones,
      tag("TotalArea", property.area),
      tag("WcLocationType", property.wc_location_type),
      photos,
      repair,
      building,
      land,
      bargainTermsXml(property),
      "</object>",
    ].join("");
  }

  const jk =
    property.cian_jk_id != null ? `<JKSchema>${tag("Id", property.cian_jk_id)}</JKSchema>` : "";

  return [
    "<object>",
    tag("Category", category),
    tag("ExternalId", externalId),
    tag("Description", property.description),
    beds,
    tag("Address", property.address),
    coordinates,
    tag("FlatRoomsCount", flatRoomsCount(property.rooms)),
    phones,
    // Юридический статус берём из карточки. Если он не заполнен — элемент не выводим,
    // чтобы не выдавать неизвестное значение за «не апартаменты».
    property.is_apartments == null
      ? ""
      : `<IsApartments>${property.is_apartments ? "true" : "false"}</IsApartments>`,
    tag("TotalArea", property.area),
    tag("FloorNumber", property.floor),
    jk,
    photos,
    repair,
    building,
    bargainTermsXml(property),
    "</object>",
  ].join("");
}

/** Полный XML фида. */
export function buildFeedXml(selection: FeedSelection, origin: string): string {
  const objects = selection.included
    .map(({ property, externalId }) => offerXml(property, externalId, origin))
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<feed><feed_version>2</feed_version>${objects}</feed>`;
}

