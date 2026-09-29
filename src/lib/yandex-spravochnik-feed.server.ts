/**
 * Сборка YML-фида товаров/услуг для Яндекс Справочник (Яндекс Бизнес).
 * Формат: Yandex Market Language (YML), не путать с YRL Яндекс Недвижимости.
 *
 * Источник правил полей:
 * https://yandex.ru/support/business-priority/ru/manage/price-list#yml-file
 * https://yandex.ru/support/business-priority/ru/manage/price-list#yml-fid
 */

import {
  YANDEX_SPRAVOCHNIK_VENDOR,
  missingSpravochnikFields,
} from "@/lib/yandex-spravochnik";
import type { Property, PropertyType } from "@/lib/properties";
import { feedPhotoUrl } from "@/lib/cian-feed.server";
import {
  buildListingDescription,
  fetchComplexesMapForFeeds,
  type ListingDescriptionComplex,
} from "@/lib/listing-description.server";
import { propertyPath } from "@/lib/seo";
import { SITE_NAME, SITE_ORIGIN } from "@/lib/site";

type Row = Record<string, unknown>;

/** Категории прайс-листа (id → название). */
export const SPRAVOCHNIK_CATEGORIES: { id: number; name: string; types: PropertyType[] }[] = [
  { id: 1, name: "Квартиры в аренду", types: ["apartment"] },
  { id: 2, name: "Апартаменты в аренду", types: ["aparts"] },
  { id: 3, name: "Дома в аренду", types: ["house"] },
  { id: 4, name: "Виллы в аренду", types: ["villa"] },
  { id: 5, name: "Таунхаусы в аренду", types: ["townhouse"] },
];

function categoryIdForType(type: PropertyType): number {
  const found = SPRAVOCHNIK_CATEGORIES.find((c) => c.types.includes(type));
  return found?.id ?? 1;
}

function typePrefix(type: PropertyType): string {
  switch (type) {
    case "house":
      return "Дом";
    case "villa":
      return "Вилла";
    case "townhouse":
      return "Таунхаус";
    case "aparts":
      return "Апартаменты";
    default:
      return "Квартира";
  }
}

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

/** Убираем телефоны и URL из текста — прайс Справочника их запрещает. */
function sanitizeText(raw: string, maxLen: number): string {
  let text = raw
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/(?:\+7|8)[\s\-()]*(?:\d[\s\-()]*){10}/g, " ")
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (text.length > maxLen) text = `${text.slice(0, maxLen - 1).trim()}…`;
  return text;
}

function offerName(property: Property): string {
  const parts = [typePrefix(property.type), property.title.trim()];
  if (property.area != null) parts.push(`${property.area} м²`);
  const name = parts.join(", ");
  return name.length > 250 ? `${name.slice(0, 249).trim()}…` : name;
}

function isAvailableStatus(status: Property["status"]): boolean {
  return status === "free" || status === "soon_free";
}

export type SpravochnikFeedSelection = {
  included: Property[];
  skipped: { property: Property; missing: string[] }[];
  complexes: Map<string, ListingDescriptionComplex>;
};

/**
 * Объекты для карточки организации: опубликованы на сайте, не в архиве,
 * с ценой и фото. Наличие (available) зависит от статуса аренды.
 */
export async function computeSpravochnikFeedSelection(): Promise<SpravochnikFeedSelection> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: properties }, complexes] = await Promise.all([
    supabaseAdmin.from("properties").select("*").eq("published", true).neq("status", "archived"),
    fetchComplexesMapForFeeds(),
  ]);

  const included: Property[] = [];
  const skipped: SpravochnikFeedSelection["skipped"] = [];

  for (const row of (properties ?? []) as Row[]) {
    const property = row as unknown as Property;
    const missing = missingSpravochnikFields(property);
    if (missing.length > 0) {
      skipped.push({ property, missing });
      continue;
    }
    included.push(property);
  }

  included.sort((a, b) => (a.ref_id ?? 0) - (b.ref_id ?? 0));
  return { included, skipped, complexes };
}

function offerXml(
  property: Property,
  origin: string,
  complexes: Map<string, ListingDescriptionComplex>,
): string {
  const id = String(property.ref_id || property.id).slice(0, 80);
  const available = isAvailableStatus(property.status) ? undefined : ' available="unknown"';
  const catId = categoryIdForType(property.type);
  const firstPhoto = (property.photos ?? []).map((p) => p.path).find(Boolean);
  const picture = firstPhoto ? feedPhotoUrl(origin, firstPhoto) : "";

  const complex = property.complex_id ? complexes.get(property.complex_id) : null;
  const assembled = buildListingDescription(property, complex, { platform: "yandex-spravochnik" });
  const description = sanitizeText(assembled, 5500);
  const shortDescription = sanitizeText(property.description?.trim() || property.title, 250);

  return (
    `<offer id="${esc(id)}"${available ?? ""}>` +
    tag("name", offerName(property)) +
    tag("vendor", YANDEX_SPRAVOCHNIK_VENDOR) +
    tag("price", property.price_month) +
    tag("currencyId", "RUB") +
    tag("categoryId", catId) +
    tag("picture", picture) +
    tag("url", `${SITE_ORIGIN}${propertyPath(property)}`) +
    tag("description", description) +
    tag("shortDescription", shortDescription) +
    `</offer>`
  );
}

/** Полный YML-фид для Яндекс Справочник / Бизнес. */
export function buildSpravochnikFeedYml(selection: SpravochnikFeedSelection, origin: string): string {
  const date = new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const categories = SPRAVOCHNIK_CATEGORIES.map(
    (c) => `<category id="${c.id}">${esc(c.name)}</category>`,
  ).join("");
  const offers = selection.included
    .map((p) => offerXml(p, origin, selection.complexes))
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<yml_catalog date="${esc(date)}">` +
    `<shop>` +
    tag("name", SITE_NAME) +
    tag("company", "Residence More") +
    tag("url", SITE_ORIGIN) +
    `<categories>${categories}</categories>` +
    `<offers>${offers}</offers>` +
    `</shop>` +
    `</yml_catalog>`
  );
}
