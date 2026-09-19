import { fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

import type { Property, PropertyType } from "@/lib/properties";

export const rentSearchSchema = z.object({
  type: fallback(z.string(), "").default(""),
  complex: fallback(z.string(), "").default(""),
  rooms: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "price_asc").default("price_asc"),
  priceFrom: fallback(z.string(), "").default(""),
  priceTo: fallback(z.string(), "").default(""),
  view: fallback(z.string(), "").default(""),
});

export type RentSearch = z.infer<typeof rentSearchSchema>;

export const RENT_SEARCH_DEFAULTS: RentSearch = {
  type: "",
  complex: "",
  rooms: "",
  sort: "price_asc",
  priceFrom: "",
  priceTo: "",
  view: "",
};

export function normalizeCatalogType(type: PropertyType) {
  if (type === "villa") return "house";
  if (type === "aparts") return "apartment";
  return type;
}

export function parsePriceParam(value: string): number | null {
  const n = Number(String(value).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function priceDigits(value: string) {
  return value.replace(/[^\d]/g, "");
}

export function formatPriceDigits(digits: string) {
  const raw = priceDigits(digits);
  if (!raw) return "";
  return `${new Intl.NumberFormat("ru-RU").format(Number(raw))} ₽`;
}

/** Планировки, которые есть у активных объектов на сайте. */
export function catalogRoomOptions(properties: Pick<Property, "rooms">[]) {
  const values = [...new Set(properties.map((property) => property.rooms).filter((rooms) => Number.isFinite(rooms)))];
  return values.sort((a, b) => a - b);
}

export function matchesRentFilters(
  property: Property,
  filters: Pick<RentSearch, "type" | "complex" | "rooms" | "priceFrom" | "priceTo">,
) {
  if (filters.type && normalizeCatalogType(property.type) !== filters.type) return false;
  if (filters.complex && property.complex_id !== filters.complex) return false;
  if (filters.rooms && String(property.rooms) !== filters.rooms) return false;
  const from = parsePriceParam(filters.priceFrom);
  const to = parsePriceParam(filters.priceTo);
  if (from != null || to != null) {
    const price = property.price_month;
    if (price == null) return false;
    if (from != null && price < from) return false;
    if (to != null && price > to) return false;
  }
  return true;
}
