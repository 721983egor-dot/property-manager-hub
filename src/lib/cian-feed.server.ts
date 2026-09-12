/**
 * Сборка XML-фида ЦИАН (feed version 2, долгосрочная аренда).
 * По схеме: https://www.cian.ru/xml_import/doc/#common_cat
 * Только сервер: читает объекты и публикации через сервисный клиент.
 */

import { cianSchemaGaps, missingCianFields } from "@/lib/cian";
import type { Property } from "@/lib/properties";

type Row = Record<string, unknown>;

const PHONE_COUNTRY_CODE = "+7";
const PHONE_NUMBER = "9384420809";
const PUBLIC_ORIGIN = "https://rm-os.residence-more.ru";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return `<${name}>${value ? "true" : "false"}</${name}>`;
  return `<${name}>${esc(String(value))}</${name}>`;
}

/** Категория ЦИАН по типу объекта RM OS. */
export function cianCategory(type: string): string {
  switch (type) {
    case "villa":
      return "cottageRent";
    case "house":
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
    ((listings ?? []) as Row[]).map((listing) => [String(listing["property_id"]), listing]),
  );

  const included: FeedSelection["included"] = [];
  const skipped: FeedSelection["skipped"] = [];

  for (const row of (properties ?? []) as Row[]) {
    const property = row as unknown as Property;
    const listing = listingByProperty.get(property.id);

    const explicitlyOff = listing && listing["published"] === false;
    const explicitlyOn = listing && listing["published"] === true;
    const inFeed = !explicitlyOff && (explicitlyOn || autoPublish);
    if (!inFeed) continue;

    const missing = missingCianFields(property);
    if (missing.length > 0) {
      skipped.push({ property, missing });
      continue;
    }

    // ExternalId — стабильный ID из CRM, не номер объявления ЦИАН.
    included.push({
      property,
      externalId: property.id,
      gaps: cianSchemaGaps(property),
    });
  }

  return { included, skipped, autoPublish };
}

/** URL фото для фида: всегда HTTPS, постоянный адрес на нашем сайте. */
export function feedPhotoUrl(origin: string, path: string): string {
  const base = (origin || PUBLIC_ORIGIN).replace(/^http:\/\//i, "https://").replace(/\/$/, "");
  return `${base}/api/public/feed-photo/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Комнатность по правилам ЦИАН: 9 — студия, 6 — многокомнатная, 7 — свободная планировка. */
function flatRoomsCount(rooms: number): number {
  if (rooms <= 0) return 9;
  if (rooms > 5) return 6;
  return rooms;
}

function bedsCount(property: Property): number {
  if (property.beds_count != null && property.beds_count > 0) return Math.round(property.beds_count);
  if (property.rooms <= 0) return 1;
  return Math.max(1, property.rooms);
}

function repairType(property: Property): string {
  const value = property.repair_type;
  if (value === "cosmetic" || value === "euro" || value === "design" || value === "no") return value;
  return "euro";
}

function isApartments(property: Property): boolean {
  if (property.is_apartments != null) return property.is_apartments;
  return property.type === "aparts";
}

function clientFeePercent(property: Property): number {
  if (property.commission == null || !Number.isFinite(property.commission)) return 0;
  return Math.max(0, Math.min(100, Math.round(property.commission)));
}

/** Описание по правилам ЦИАН: 15–3000 символов, без «&», «№», «/», «\». */
function cleanDescription(raw: string): string {
  let text = raw
    .replace(/&/g, " и ")
    .replace(/[№/\\]/g, " ")
    .replace(/[«»]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (text.length > 3000) text = text.slice(0, 3000).trim();
  return text;
}

function bargainTermsXml(property: Property): string {
  const utilitiesIncluded = property.utilities_month == null;
  const utilities = [
    "<UtilitiesTerms>",
    tag("IncludedInPrice", utilitiesIncluded),
    !utilitiesIncluded ? tag("Price", Math.round(property.utilities_month ?? 0)) : "",
    tag("FlowMetersNotIncludedInPrice", true),
    "</UtilitiesTerms>",
  ].join("");

  return [
    "<BargainTerms>",
    tag("Price", property.price_month),
    utilities,
    "<Currency>rur</Currency>",
    "<LeaseTermType>longTerm</LeaseTermType>",
    tag("Deposit", Math.round(property.deposit ?? 0)),
    tag("ClientFee", clientFeePercent(property)),
    "</BargainTerms>",
  ].join("");
}

function photosXml(property: Property, origin: string): string {
  const items = (property.photos ?? [])
    .map((photo) => photo.path)
    .filter(Boolean)
    .slice(0, 50)
    .map(
      (path, index) =>
        `<PhotoSchema>${tag("FullUrl", feedPhotoUrl(origin, path))}${tag("IsDefault", index === 0)}</PhotoSchema>`,
    )
    .join("");
  return items ? `<Photos>${items}</Photos>` : "";
}

function applianceFlags(property: Property): string {
  const appliances = property.appliances ?? [];
  const bath = property.bathroom_features ?? [];
  const extras = property.extra_features ?? [];
  return [
    tag("HasFurniture", true),
    tag("HasKitchenFurniture", true),
    appliances.includes("washer") ? tag("HasWasher", true) : "",
    appliances.includes("air_conditioner") || extras.includes("air_conditioner")
      ? tag("HasConditioner", true)
      : "",
    appliances.includes("dishwasher") || extras.includes("dishwasher") ? tag("HasDishwasher", true) : "",
    bath.includes("bath") ? tag("HasBathtub", true) : "",
    bath.includes("shower") ? tag("HasShower", true) : "",
    extras.includes("concierge") ? "" : "",
  ].join("");
}

function balconyTags(property: Property): string {
  const outdoor = property.outdoor_spaces ?? [];
  const balconies = outdoor.filter((item) => item === "balcony" || item === "terrace").length;
  const loggias = outdoor.filter((item) => item === "loggia").length;
  return [
    balconies > 0 ? tag("BalconiesCount", Math.min(4, balconies)) : "",
    loggias > 0 ? tag("LoggiasCount", Math.min(4, loggias)) : "",
  ].join("");
}

function buildingXml(property: Property, isLand: boolean): string {
  const floors = property.total_floors ?? (isLand ? property.floor : null) ?? 1;
  return `<Building>${tag("FloorsCount", Math.max(1, Math.round(floors)))}</Building>`;
}

function yardFeatures(property: Property): string {
  const extras = property.extra_features ?? [];
  if (!extras.includes("concierge")) return "";
  return `<YardAndEntranceFeatures>${tag("HasConcierge", true)}</YardAndEntranceFeatures>`;
}

/** Один объект фида: порядок элементов ближе к официальному примеру ЦИАН. */
function offerXml(property: Property, externalId: string, origin: string): string {
  const category = cianCategory(property.type);
  const isLand = category !== "flatRent";
  const description = cleanDescription(property.description);

  const coordinates =
    property.latitude != null && property.longitude != null
      ? `<Coordinates>${tag("Lat", property.latitude)}${tag("Lng", property.longitude)}</Coordinates>`
      : "";
  const phones = `<Phones><PhoneSchema>${tag("CountryCode", PHONE_COUNTRY_CODE)}${tag("Number", PHONE_NUMBER)}</PhoneSchema></Phones>`;
  const photos = photosXml(property, origin);
  const jk =
    !isLand && property.cian_jk_id != null
      ? `<JKSchema>${tag("Id", property.cian_jk_id)}${property.complex_name ? tag("Name", property.complex_name) : ""}</JKSchema>`
      : "";

  if (isLand) {
    const land =
      property.land_area != null
        ? `<Land>${tag("Area", property.land_area)}<AreaUnitType>sotka</AreaUnitType>${
            property.land_status ? tag("Status", property.land_status) : ""
          }</Land>`
        : "";
    return [
      "<object>",
      tag("Category", category),
      tag("ExternalId", externalId),
      tag("Description", description),
      tag("BedsCount", bedsCount(property)),
      tag("Address", property.address),
      coordinates,
      phones,
      tag("TotalArea", property.area),
      property.wc_location_type ? tag("WcLocationType", property.wc_location_type) : tag("WcLocationType", "indoors"),
      photos,
      tag("RepairType", repairType(property)),
      applianceFlags(property),
      buildingXml(property, true),
      land,
      yardFeatures(property),
      bargainTermsXml(property),
      "</object>",
    ].join("");
  }

  return [
    "<object>",
    tag("Category", category),
    tag("ExternalId", externalId),
    property.rooms > 1 ? tag("RoomType", "separate") : "",
    tag("Description", description),
    tag("BedsCount", bedsCount(property)),
    tag("Address", property.address),
    coordinates,
    tag("FlatRoomsCount", flatRoomsCount(property.rooms)),
    phones,
    tag("IsApartments", isApartments(property)),
    tag("TotalArea", property.area),
    tag("FloorNumber", property.floor),
    jk,
    balconyTags(property),
    photos,
    tag("RepairType", repairType(property)),
    applianceFlags(property),
    buildingXml(property, false),
    yardFeatures(property),
    bargainTermsXml(property),
    "</object>",
  ].join("");
}

/** Полный XML фида. */
export function buildFeedXml(selection: FeedSelection, origin: string): string {
  const safeOrigin = (origin || PUBLIC_ORIGIN).replace(/^http:\/\//i, "https://");
  const objects = selection.included
    .map(({ property, externalId }) => offerXml(property, externalId, safeOrigin))
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<feed><feed_version>2</feed_version>${objects}</feed>`;
}
