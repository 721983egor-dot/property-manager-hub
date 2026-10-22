import type { Property } from "./properties";
/** Explicit allowlist: never forward owner, tenant or management fields to a manager. */
export const MANAGER_PROPERTY_FIELDS = [
  "id",
  "ref_id",
  "title",
  "internal_name",
  "type",
  "status",
  "portfolio",
  "complex_name",
  "complex_id",
  "address",
  "floor",
  "total_floors",
  "rooms",
  "bathrooms",
  "area",
  "land_area",
  "price_month",
  "summer_price_month",
  "seasonal_pricing",
  "deposit",
  "commission",
  "utilities_month",
  "rent_terms",
  "description",
  "photos",
  "published",
  "card_highlights",
  "extra_features",
  "appliances",
  "outdoor_spaces",
  "bathroom_features",
  "location_description",
  "created_at",
] as const;
export const MANAGER_PROPERTY_COLUMNS = MANAGER_PROPERTY_FIELDS.join(",");
export function managerPropertyView<T extends Record<string, unknown>>(row: T) {
  return Object.fromEntries(
    MANAGER_PROPERTY_FIELDS.filter((k) => k in row).map((k) => [k, row[k]]),
  ) as Pick<T, Extract<(typeof MANAGER_PROPERTY_FIELDS)[number], keyof T>>;
}

export type ManagerProperty = Pick<
  Property,
  Extract<(typeof MANAGER_PROPERTY_FIELDS)[number], keyof Property>
> & { availableFrom?: string };
