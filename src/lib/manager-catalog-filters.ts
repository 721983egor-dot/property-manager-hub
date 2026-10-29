import { z } from "zod";
import type { ManagerProperty } from "./manager-property-view";
export const managerCatalogFilterSchema = z.object({
  search: z.string().max(300).default(""),
  type: z.enum(["all", "apartment", "house", "townhouse"]).default("all"),
  status: z.enum(["all", "free", "soon_free", "rented", "booked", "archive"]).default("all"),
  complex: z.string().max(300).default("all"),
  minPrice: z.number().nonnegative().optional(),
  maxPrice: z.number().nonnegative().optional(),
  rooms: z.enum(["all", "0", "1", "2", "3", "4+"]).default("all"),
  minArea: z.number().nonnegative().optional(),
  maxArea: z.number().nonnegative().optional(),
  published: z.enum(["all", "yes", "no"]).default("all"),
  priceBasis: z.enum(["regular", "summer"]).default("regular"),
  sort: z.enum(["name", "price_asc", "price_desc", "area_desc"]).default("name"),
});
export type ManagerCatalogFilters = z.infer<typeof managerCatalogFilterSchema>;
export const emptyManagerCatalogFilters = () => managerCatalogFilterSchema.parse({});
const normalized = (s: string) =>
  s.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
export function catalogComplexKey(p: Pick<ManagerProperty, "complex_id" | "complex_name">) {
  return p.complex_id
    ? `id:${p.complex_id}`
    : p.complex_name?.trim()
      ? `name:${normalized(p.complex_name)}`
      : "none";
}
export function catalogComplexOptions(properties: ManagerProperty[]) {
  const values = new Map<string, string>();
  for (const p of properties) {
    const key = catalogComplexKey(p);
    if (key !== "none" && !values.has(key))
      values.set(key, p.complex_name?.trim() || "Комплекс без названия");
  }
  return [...values]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}
export function catalogFilterPrice(p: ManagerProperty, f: ManagerCatalogFilters) {
  return f.priceBasis === "summer" && p.seasonal_pricing ? p.summer_price_month : p.price_month;
}
export function catalogFilterError(f: ManagerCatalogFilters) {
  if (f.minPrice != null && f.maxPrice != null && f.minPrice > f.maxPrice)
    return "Цена «от» не должна превышать цену «до»";
  if (f.minArea != null && f.maxArea != null && f.minArea > f.maxArea)
    return "Площадь «от» не должна превышать площадь «до»";
  return "";
}
export function filterManagerCatalog(properties: ManagerProperty[], f: ManagerCatalogFilters) {
  if (catalogFilterError(f)) return [];
  const needle = normalized(f.search);
  const result = properties.filter((p) => {
    if (f.status === "archive" ? p.status !== "archived" : p.status === "archived") return false;
    if (f.status !== "all" && f.status !== "archive" && p.status !== f.status) return false;
    if (
      f.type !== "all" &&
      !(
        f.type === "apartment"
          ? ["apartment", "aparts"]
          : f.type === "house"
            ? ["house", "villa", "townhouse"]
            : ["townhouse"]
      ).includes(p.type)
    )
      return false;
    if (f.complex !== "all" && catalogComplexKey(p) !== f.complex) return false;
    if (
      needle &&
      !normalized(
        `${p.internal_name} ${p.title} ${p.address} ${p.complex_name} ${p.ref_id}`,
      ).includes(needle)
    )
      return false;
    const price = catalogFilterPrice(p, f);
    if (f.minPrice != null && (price == null || price < f.minPrice)) return false;
    if (f.maxPrice != null && (price == null || price > f.maxPrice)) return false;
    if (f.rooms !== "all" && (f.rooms === "4+" ? p.rooms < 4 : p.rooms !== Number(f.rooms)))
      return false;
    if (f.minArea != null && (p.area == null || p.area < f.minArea)) return false;
    if (f.maxArea != null && (p.area == null || p.area > f.maxArea)) return false;
    return f.published === "all" || p.published === (f.published === "yes");
  });
  return result.sort((a, b) => {
    const tie = (a.internal_name || a.title).localeCompare(b.internal_name || b.title, "ru");
    if (f.sort === "name") return tie;
    const av = f.sort === "area_desc" ? a.area : catalogFilterPrice(a, f),
      bv = f.sort === "area_desc" ? b.area : catalogFilterPrice(b, f);
    if (av == null || bv == null) return av == null ? (bv == null ? tie : 1) : -1;
    return (f.sort === "price_asc" ? av - bv : bv - av) || tie;
  });
}
