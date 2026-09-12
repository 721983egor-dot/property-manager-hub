/**
 * Правила Яндекс Недвижимости: каких полей не хватает объекту для фида YRL.
 * Файл безопасен для браузера: без ключей и серверных вызовов.
 */

import type { Property } from "@/lib/properties";

export const YANDEX_OAUTH_URL =
  "https://oauth.yandex.ru/authorize?response_type=token&client_id=aa4eae0f50244d9aae9c864b349e1859";
export const YANDEX_FEED_PATH = "/api/public/feeds/yandex.xml";
export const YANDEX_FEED_URL = `https://residence-more.ru${YANDEX_FEED_PATH}`;

/** Поля, обязательные для публикации в фиде Яндекс Недвижимости. */
export function missingYandexFields(p: Property): string[] {
  const missing: string[] = [];
  if (!p.address.trim()) missing.push("адрес");
  if (p.latitude == null || p.longitude == null)
    missing.push("координаты (выберите адрес из подсказок)");
  if (p.area == null) missing.push("площадь");
  if (p.price_month == null) missing.push("цена за месяц");
  if (p.type !== "house" && p.type !== "villa" && p.floor == null) missing.push("этаж");
  if ((p.photos ?? []).length === 0) missing.push("фотографии");
  if (!p.description.trim()) missing.push("описание");
  return missing;
}
