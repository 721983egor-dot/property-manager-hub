/**
 * Сборка YML-фида товаров/услуг для Яндекс Справочник и VK (товары сообщества).
 * Формат: Yandex Market Language (YML), не путать с YRL Яндекс Недвижимости.
 *
 * Источник правил полей:
 * https://yandex.ru/support/business-priority/ru/manage/price-list#yml-file
 * https://vk.ru/faq21697
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

/** Вариант YML: Справочник (без URL в description) или VK (ссылка в description + категории аренды). */
export type YmlFeedVariant = "spravochnik" | "vk";

/** Категории прайс-листа Справочника (id → название). */
export const SPRAVOCHNIK_CATEGORIES: { id: number; name: string; types: PropertyType[] }[] = [
  { id: 1, name: "Квартиры в аренду", types: ["apartment"] },
  { id: 2, name: "Апартаменты в аренду", types: ["aparts"] },
  { id: 3, name: "Дома в аренду", types: ["house"] },
  { id: 4, name: "Виллы в аренду", types: ["villa"] },
  { id: 5, name: "Таунхаусы в аренду", types: ["townhouse"] },
];

/**
 * Категории для VK: **id из дерева market.getCategories**, не свои.
 * Раздел «Недвижимость»: 500 Квартиры, 502 Дома/дачи/коттеджи (стабильные id).
 *
 * История ошибок:
 * - id 1–5 — одежда/украшения → импорт часто давал «ювелирку»;
 * - id 100–105 — «Детские товары» (автокресла, коляски…) — тоже мимо.
 * Если VK снова проставит чужую категорию — править вручную в карточке товара
 * или уточнить актуальный id в URL раздела / через market.getCategories.
 */
export const VK_CATEGORIES: {
  id: number;
  name: string;
  parentId?: number;
  types?: PropertyType[];
}[] = [
  { id: 500, name: "Квартиры", types: ["apartment", "aparts"] },
  { id: 502, name: "Дома, дачи, коттеджи", types: ["house", "villa", "townhouse"] },
];

/** До скольких фото на оффер в YML Справочника. */
export const YML_MAX_PICTURES = 10;

/**
 * VK товары сообщества: в UI обычно до 5 изображений (JPG/PNG/GIF, ≥400×400).
 * Больше тегов `<picture>` парсер может обрезать или хуже подтянуть галерею.
 */
export const VK_MAX_PICTURES = 5;

/**
 * Query на URL фото только для VK: при повторном импорте старые товары
 * часто оставляют одно фото — смена URL заставляет перекачать галерею.
 */
export const VK_PICTURE_CACHE_BUST = "g2";

function maxPictures(variant: YmlFeedVariant): number {
  return variant === "vk" ? VK_MAX_PICTURES : YML_MAX_PICTURES;
}

function categoryIdForType(type: PropertyType, variant: YmlFeedVariant): number {
  if (variant === "vk") {
    const found = VK_CATEGORIES.find((c) => c.types?.includes(type));
    return found?.id ?? 500;
  }
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

/** Убираем телефоны; URL — только для Справочника (у них в description запрещены). */
function sanitizeText(raw: string, maxLen: number, stripUrls: boolean): string {
  let text = raw;
  if (stripUrls) {
    text = text
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/\bwww\.\S+/gi, " ");
  }
  text = text
    .replace(/(?:\+7|8)[\s\-()]*(?:\d[\s\-()]*){10}/g, " ")
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (text.length > maxLen) text = `${text.slice(0, maxLen - 1).trim()}…`;
  return text;
}

function offerName(property: Property, variant: YmlFeedVariant): string {
  const parts =
    variant === "vk"
      ? [`Аренда: ${typePrefix(property.type)}`, property.title.trim()]
      : [typePrefix(property.type), property.title.trim()];
  if (property.area != null) parts.push(`${property.area} м²`);
  const name = parts.join(", ");
  return name.length > 250 ? `${name.slice(0, 249).trim()}…` : name;
}

function isAvailableStatus(status: Property["status"]): boolean {
  return status === "free" || status === "soon_free";
}

function picturePaths(property: Property, limit: number): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const photo of property.photos ?? []) {
    const path = photo.path?.trim();
    if (!path || /\.(mp4|m4v|mov|webm)$/i.test(path)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
    if (paths.length >= limit) break;
  }
  return paths;
}

function offerPictureUrl(origin: string, path: string, variant: YmlFeedVariant): string {
  const url = feedPhotoUrl(origin, path);
  if (variant !== "vk") return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${VK_PICTURE_CACHE_BUST}`;
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
  variant: YmlFeedVariant,
): string {
  const id = String(property.ref_id || property.id).slice(0, 80);
  const available = isAvailableStatus(property.status) ? undefined : ' available="unknown"';
  const catId = categoryIdForType(property.type, variant);
  const pictures = picturePaths(property, maxPictures(variant))
    .map((path) => tag("picture", offerPictureUrl(origin, path, variant)))
    .join("");
  const offerUrl = `${SITE_ORIGIN}${propertyPath(property)}`;

  const complex = property.complex_id ? complexes.get(property.complex_id) : null;
  const assembled = buildListingDescription(property, complex, { platform: "yandex-spravochnik" });

  let description: string;
  if (variant === "vk") {
    // VK: URL в description допустим; Справочник — нет. Телефоны всё равно убираем.
    const withLink = `${assembled}\n\nПодробнее на сайте: ${offerUrl}`;
    description = sanitizeText(withLink, 5500, false);
  } else {
    description = sanitizeText(assembled, 5500, true);
  }
  const shortDescription = sanitizeText(property.description?.trim() || property.title, 250, variant !== "vk");

  return (
    `<offer id="${esc(id)}"${available ?? ""}>` +
    tag("name", offerName(property, variant)) +
    tag("vendor", YANDEX_SPRAVOCHNIK_VENDOR) +
    tag("price", property.price_month) +
    tag("currencyId", "RUB") +
    tag("categoryId", catId) +
    pictures +
    tag("url", offerUrl) +
    tag("description", description) +
    tag("shortDescription", shortDescription) +
    `</offer>`
  );
}

function categoriesXml(variant: YmlFeedVariant): string {
  if (variant === "vk") {
    return VK_CATEGORIES.map((c) => {
      const parent = c.parentId != null ? ` parentId="${c.parentId}"` : "";
      return `<category id="${c.id}"${parent}>${esc(c.name)}</category>`;
    }).join("");
  }
  return SPRAVOCHNIK_CATEGORIES.map((c) => `<category id="${c.id}">${esc(c.name)}</category>`).join("");
}

function buildYmlCatalog(
  selection: SpravochnikFeedSelection,
  origin: string,
  variant: YmlFeedVariant,
): string {
  const date = new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const offers = selection.included
    .map((p) => offerXml(p, origin, selection.complexes, variant))
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<yml_catalog date="${esc(date)}">` +
    `<shop>` +
    tag("name", SITE_NAME) +
    tag("company", "Residence More") +
    tag("url", SITE_ORIGIN) +
    `<categories>${categoriesXml(variant)}</categories>` +
    `<offers>${offers}</offers>` +
    `</shop>` +
    `</yml_catalog>`
  );
}

/** Полный YML-фид для Яндекс Справочник / Бизнес. */
export function buildSpravochnikFeedYml(selection: SpravochnikFeedSelection, origin: string): string {
  return buildYmlCatalog(selection, origin, "spravochnik");
}

/** YML для товаров сообщества ВКонтакте (ссылка в description, categoryId из market.getCategories, до 5 фото). */
export function buildVkFeedYml(selection: SpravochnikFeedSelection, origin: string): string {
  return buildYmlCatalog(selection, origin, "vk");
}
