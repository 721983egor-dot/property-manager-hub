/**
 * Сборка XML-фида Яндекс Недвижимости (формат YRL, долгосрочная аренда).
 * Только сервер: читает объекты и публикации через сервисный клиент.
 */

import { missingYandexFields } from "@/lib/yandex";
import type { Property } from "@/lib/properties";
import { feedPhotoUrl } from "@/lib/cian-feed.server";

type Row = Record<string, unknown>;

const PHONE = "+79384420809";
const AGENCY_NAME = "Residence More";
const LOCALITY = "Сочи";

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

/** Категория YRL для типа объекта. */
function yandexCategory(type: string): string {
  switch (type) {
    case "house":
    case "villa":
      return "дом";
    case "townhouse":
      return "таунхаус";
    default:
      return "квартира";
  }
}

export type YandexFeedSelection = {
  included: { property: Property; externalId: string }[];
  skipped: { property: Property; missing: string[] }[];
  autoPublish: boolean;
};

/**
 * Отбирает объекты для фида Яндекса: помеченные к публикации,
 * плюс все подходящие при включённой автопубликации.
 */
export async function computeYandexFeedSelection(): Promise<YandexFeedSelection> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: cred } = await supabaseAdmin
    .from("platform_credentials")
    .select("auto_publish")
    .eq("platform", "yandex")
    .maybeSingle();
  const autoPublish = Boolean((cred as { auto_publish?: boolean } | null)?.auto_publish);

  const [{ data: properties }, { data: listings }] = await Promise.all([
    supabaseAdmin.from("properties").select("*").neq("status", "archived"),
    supabaseAdmin.from("property_listings").select("*").eq("platform", "yandex"),
  ]);

  const listingByProperty = new Map(
    ((listings ?? []) as Row[]).map((l) => [String(l["property_id"]), l]),
  );

  const included: YandexFeedSelection["included"] = [];
  const skipped: YandexFeedSelection["skipped"] = [];

  for (const row of (properties ?? []) as Row[]) {
    const property = row as unknown as Property;
    const listing = listingByProperty.get(property.id);

    // Явно снят с публикации — в фид не берём при любой настройке.
    const explicitlyOff = listing && listing["published"] === false;
    const explicitlyOn = listing && listing["published"] === true;
    const inFeed = !explicitlyOff && (explicitlyOn || autoPublish);
    if (!inFeed) continue;

    const missing = missingYandexFields(property);
    if (missing.length > 0) {
      skipped.push({ property, missing });
      continue;
    }

    const externalId = String(listing?.["external_id"] || property.id);
    included.push({ property, externalId });
  }

  return { included, skipped, autoPublish };
}

/** Один оффер фида. */
function offerXml(property: Property, externalId: string, origin: string): string {
  const images = (property.photos ?? [])
    .map((p) => p.path)
    .filter(Boolean)
    .map((path) => tag("image", feedPhotoUrl(origin, path)))
    .join("");

  const coordinates =
    property.latitude != null && property.longitude != null
      ? tag("latitude", property.latitude) + tag("longitude", property.longitude)
      : "";

  const location = `<location>${tag("country", "Россия")}${tag("locality-name", LOCALITY)}${tag("address", property.address)}${coordinates}</location>`;

  const salesAgent = `<sales-agent>${tag("name", AGENCY_NAME)}${tag("phone", PHONE)}${tag("category", "agency")}</sales-agent>`;

  const price = `<price>${tag("value", property.price_month)}${tag("currency", "RUR")}${tag("period", "месяц")}</price>`;

  const area = `<area>${tag("value", property.area)}${tag("unit", "кв. м")}</area>`;

  const isHouse = property.type === "house" || property.type === "villa";

  const deposit =
    property.deposit != null
      ? tag("rent-pledge", "да") + tag("rent-deposit", property.deposit)
      : tag("rent-pledge", "нет");

  const utilitiesIncluded = tag("utilities-included", property.utilities_month == null ? "да" : "нет");

  const rooms = property.rooms > 0 ? tag("rooms", property.rooms) : "";

  const floors = isHouse
    ? tag("floors-total", property.total_floors)
    : tag("floor", property.floor) +
      (property.total_floors != null ? tag("floors-total", property.total_floors) : "");

  const lotArea =
    isHouse && property.land_area != null
      ? `<lot-area>${tag("value", property.land_area)}${tag("unit", "сотка")}</lot-area>`
      : "";

  const creationDate = new Date(property.created_at || Date.now()).toISOString();

  return `<offer internal-id="${esc(externalId)}">${tag("type", "аренда")}${tag("property-type", "жилая")}${tag("category", yandexCategory(property.type))}${tag("creation-date", creationDate)}${location}${salesAgent}${price}${tag("deal-status", "аренда")}${deposit}${utilitiesIncluded}${area}${rooms}${floors}${lotArea}${images}${tag("description", property.description)}</offer>`;
}

/** Полный XML фида. */
export function buildYandexFeedXml(selection: YandexFeedSelection, origin: string): string {
  const offers = selection.included
    .map(({ property, externalId }) => offerXml(property, externalId, origin))
    .join("");
  const generationDate = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<realty-feed xmlns="http://webmaster.yandex.ru/schemas/feed/realty/2010-06">${tag("generation-date", generationDate)}${offers}</realty-feed>`;
}
