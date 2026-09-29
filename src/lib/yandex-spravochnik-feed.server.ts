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
 * Категории для VK: названия ближе к недвижимости/аренде.
 * VK часто игнорирует наши category и ставит дефолт (часто «ювелирные украшения»),
 * если id не из их дерева market.getCategories. Наши id начинаются с 100,
 * чтобы не пересекаться с ранними id их таксономии (1 ≈ ювелирка у части импортов).
 * Подборки в сообществе создаются из названий; товарную категорию VK всё равно
 * может переопределить — после импорта проверить вручную.
 */
export const VK_CATEGORIES: {
  id: number;
  name: string;
  parentId?: number;
  types?: PropertyType[];
}[] = [
  { id: 100, name: "Недвижимость" },
  { id: 101, name: "Аренда квартир", parentId: 100, types: ["apartment"] },
  { id: 102, name: "Аренда апартаментов", parentId: 100, types: ["aparts"] },
  { id: 103, name: "Аренда домов", parentId: 100, types: ["house"] },
  { id: 104, name: "Аренда вилл", parentId: 100, types: ["villa"] },
  { id: 105, name: "Аренда таунхаусов", parentId: 100, types: ["townhouse"] },
];

/** До скольких фото на оффер (YML допускает несколько `<picture>`; VK и Справочник обычно тоже). */
export const YML_MAX_PICTURES = 10;

function categoryIdForType(type: PropertyType, variant: YmlFeedVariant): number {
  if (variant === "vk") {
    const found = VK_CATEGORIES.find((c) => c.types?.includes(type));
    return found?.id ?? 101;
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

function picturePaths(property: Property): string[] {
  const paths: string[] = [];
  for (const photo of property.photos ?? []) {
    const path = photo.path;
    if (!path || /\.(mp4|m4v|mov|webm)$/i.test(path)) continue;
    paths.push(path);
    if (paths.length >= YML_MAX_PICTURES) break;
  }
  return paths;
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
  const pictures = picturePaths(property)
    .map((path) => tag("picture", feedPhotoUrl(origin, path)))
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

/** YML для товаров сообщества ВКонтакте (ссылка в description, категории аренды, до 10 фото). */
export function buildVkFeedYml(selection: SpravochnikFeedSelection, origin: string): string {
  return buildYmlCatalog(selection, origin, "vk");
}
