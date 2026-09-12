/**
 * Правила Авито: каких полей не хватает объекту для XML-автозагрузки.
 * Файл безопасен для браузера: без ключей и серверных вызовов.
 */

import type { Property } from "@/lib/properties";

export function isAvitoHouse(type: Property["type"]): boolean {
  return type === "house" || type === "villa" || type === "townhouse";
}

/** Поля, без которых объявление в автозагрузке Авито не примут. */
export function missingAvitoFields(p: Property): string[] {
  const missing: string[] = [];
  const house = isAvitoHouse(p.type);
  if (!p.address.trim()) missing.push("адрес");
  if (p.area == null) missing.push("площадь");
  if (p.price_month == null) missing.push("цена за месяц");
  if (!house && p.floor == null) missing.push("этаж");
  if (!house && p.total_floors == null) missing.push("этажность дома");
  if (house && p.land_area == null) missing.push("площадь участка");
  if ((p.photos ?? []).length === 0) missing.push("фотографии");
  if (!p.description.trim()) missing.push("описание");
  return missing;
}
