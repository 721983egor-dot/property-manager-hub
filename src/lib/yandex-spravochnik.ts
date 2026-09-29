/**
 * Константы и правила фида товаров для Яндекс Справочник / Яндекс Бизнес (YML)
 * и отдельного фида товаров ВКонтакте.
 * Безопасно для браузера: без ключей и серверных вызовов.
 *
 * Документация:
 * https://yandex.ru/support/business-priority/ru/manage/price-list
 * https://vk.ru/faq21697
 */

import type { Property } from "@/lib/properties";

export const YANDEX_SPRAVOCHNIK_FEED_PATH = "/api/public/feeds/yandex-spravochnik.yml";
export const YANDEX_SPRAVOCHNIK_FEED_URL = `https://residence-more.ru${YANDEX_SPRAVOCHNIK_FEED_PATH}`;
export const YANDEX_SPRAVOCHNIK_FEED_PREVIEW_URL = `https://preview.residence-more.ru${YANDEX_SPRAVOCHNIK_FEED_PATH}`;

export const VK_PRODUCTS_FEED_PATH = "/api/public/feeds/vk.yml";
export const VK_PRODUCTS_FEED_URL = `https://residence-more.ru${VK_PRODUCTS_FEED_PATH}`;
export const VK_PRODUCTS_FEED_PREVIEW_URL = `https://preview.residence-more.ru${VK_PRODUCTS_FEED_PATH}`;

export const YANDEX_SPRAVOCHNIK_VENDOR = "Residence More";

/** Поля, без которых оффер не попадёт в YML для Справочника / VK. */
export function missingSpravochnikFields(p: Property): string[] {
  const missing: string[] = [];
  if (!p.title.trim()) missing.push("название");
  if (p.price_month == null || p.price_month <= 0) missing.push("цена за месяц");
  if ((p.photos ?? []).length === 0) missing.push("фотографии");
  return missing;
}
