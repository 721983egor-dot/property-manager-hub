/**
 * Общие типы и правила сопоставления объявлений ЦИАН с объектами RM OS.
 * Файл безопасен для браузера: сюда не попадают ключи и серверные вызовы.
 */

import type { Property } from "@/lib/properties";

/** Объявление, полученное из кабинета ЦИАН. */
export type CianOffer = {
  externalId: string;
  url: string;
  title: string;
  address: string;
  complexName: string;
  rooms: number | null;
  area: number | null;
  floor: number | null;
  price: number | null;
  photo: string | null;
  status: string;
};

export type MatchConfidence = "exact" | "likely" | "none";

export type OfferMatch = {
  offer: CianOffer;
  propertyId: string | null;
  confidence: MatchConfidence;
  /** Кандидаты, отсортированные по убыванию похожести. */
  candidates: { propertyId: string; score: number }[];
  /** Уже связано ранее. */
  alreadyLinked: boolean;
};

const NOISE = /[«»"'`.,()]/g;

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ключевые части адреса: улица и номер дома без города, края и индексов. */
export function addressKey(address: string): string {
  const noise =
    /^(россия|краснодарский край|сочи|г сочи|город сочи|адлерский район|центральный район|хостинский район|лазаревский район)$|^\d{6}$/;
  return normalizeText(address)
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !noise.test(p))
    .join(" ");
}

function tokens(value: string): Set<string> {
  return new Set(value.split(" ").filter((t) => t.length > 1));
}

/** Доля общих слов, 0..1. */
function overlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common += 1;
  return common / Math.max(ta.size, tb.size);
}

function near(a: number | null, b: number | null, tolerance: number): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
}

/**
 * Похожесть объявления и объекта, 0..100.
 * Адрес весит больше всего, затем комплекс, площадь, комнаты и цена.
 */
export function matchScore(offer: CianOffer, property: Property): number {
  let score = 0;

  const addr = overlap(addressKey(offer.address), addressKey(property.address));
  score += addr * 45;

  const complex = overlap(normalizeText(offer.complexName), normalizeText(property.complex_name));
  score += complex * 20;

  if (offer.area != null && property.area != null) {
    if (near(offer.area, property.area, 0.6)) score += 15;
    else if (near(offer.area, property.area, 3)) score += 8;
  }

  if (offer.rooms != null && offer.rooms === property.rooms) score += 10;
  if (offer.floor != null && property.floor != null && offer.floor === property.floor) score += 5;

  if (offer.price != null && property.price_month != null) {
    const diff = Math.abs(offer.price - property.price_month) / Math.max(property.price_month, 1);
    if (diff <= 0.02) score += 5;
  }

  return Math.round(score);
}

export const EXACT_THRESHOLD = 75;
export const LIKELY_THRESHOLD = 40;

/** Подбирает объекты RM OS к каждому объявлению ЦИАН. */
export function matchOffers(
  offers: CianOffer[],
  properties: Property[],
  linkedByExternalId: Map<string, string>,
): OfferMatch[] {
  const takenExact = new Set(linkedByExternalId.values());

  return offers.map((offer) => {
    const linked = linkedByExternalId.get(offer.externalId);
    if (linked) {
      return {
        offer,
        propertyId: linked,
        confidence: "exact" as const,
        candidates: [],
        alreadyLinked: true,
      };
    }

    const scored = properties
      .map((p) => ({ propertyId: p.id, score: matchScore(offer, p) }))
      .filter((c) => c.score >= LIKELY_THRESHOLD && !takenExact.has(c.propertyId))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const best = scored[0];
    const confidence: MatchConfidence = !best
      ? "none"
      : best.score >= EXACT_THRESHOLD
        ? "exact"
        : "likely";

    if (confidence === "exact" && best) takenExact.add(best.propertyId);

    return {
      offer,
      propertyId: best?.propertyId ?? null,
      confidence,
      candidates: scored,
      alreadyLinked: false,
    };
  });
}

/** Категория ЦИАН по типу объекта. */
export function cianCategoryOf(type: Property["type"]): string {
  if (type === "house" || type === "villa") return "houseRent";
  if (type === "townhouse") return "townhouseRent";
  return "flatRent";
}

/** Поля, без которых объявление на ЦИАН не примут. */
export function missingCianFields(p: Property): string[] {
  const missing: string[] = [];
  const isLand = cianCategoryOf(p.type) !== "flatRent";
  if (!p.address.trim()) missing.push("адрес");
  if (p.area == null) missing.push("площадь");
  if (p.price_month == null) missing.push("цена за месяц");
  if (!isLand && p.floor == null) missing.push("этаж");
  if (!isLand && p.total_floors == null) missing.push("этажность дома");
  if (isLand && p.land_area == null) missing.push("площадь участка");
  if ((p.photos ?? []).length === 0) missing.push("фотографии");
  if (!p.description.trim()) missing.push("описание");
  return missing;
}

/**
 * Поля, которые требует официальная схема ЦИАН, но которых пока нет в карточке.
 * Объект всё равно попадает в фид — эти пропуски показываем в отчёте проверки.
 */
export function cianSchemaGaps(p: Property): string[] {
  const gaps: string[] = [];
  const isLand = cianCategoryOf(p.type) !== "flatRent";
  if (p.beds_count == null) gaps.push("спальных мест");
  if (!p.repair_type) gaps.push("состояние ремонта");
  if (p.commission == null) gaps.push("комиссия");
  if (isLand) {
    if (p.total_floors == null) gaps.push("этажность дома");
    if (!p.land_status) gaps.push("назначение участка");
  } else {
    if (p.cian_jk_id == null) gaps.push("ID жилого комплекса на ЦИАН");
    if (p.is_apartments == null) gaps.push("юридический статус (апартаменты или квартира)");
  }
  return gaps;
}

