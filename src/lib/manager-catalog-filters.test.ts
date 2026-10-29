import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogComplexKey,
  catalogComplexOptions,
  catalogFilterError,
  emptyManagerCatalogFilters,
  filterManagerCatalog,
  managerCatalogFilterSchema,
} from "./manager-catalog-filters";
import type { ManagerProperty } from "./manager-property-view";
const property = (id: string, patch: Partial<ManagerProperty> = {}) =>
  ({
    id,
    ref_id: Number(id),
    internal_name: id,
    title: "Квартира " + id,
    type: "apartment",
    status: "free",
    price_month: 100000,
    summer_price_month: 150000,
    seasonal_pricing: true,
    complex_id: null,
    complex_name: "Лазурный берег",
    address: "Сочи",
    rooms: 2,
    area: 50,
    published: true,
    ...patch,
  }) as ManagerProperty;
const rows = [
  property("1"),
  property("2", {
    price_month: 150000,
    summer_price_month: 250000,
    rooms: 4,
    area: 90,
    type: "house",
  }),
  property("3", {
    price_month: null,
    summer_price_month: null,
    area: null,
    rooms: 0,
    complex_name: "",
    published: false,
  }),
  property("4", { price_month: 120000, status: "archived" }),
  property("5", {
    price_month: 120000,
    status: "rented",
    complex_id: "complex-id",
    complex_name: "Метрополь",
    seasonal_pricing: false,
    rooms: 1,
  }),
];
const criteria = (patch: Parameters<typeof managerCatalogFilterSchema.parse>[0]) =>
  managerCatalogFilterSchema.parse(patch);
const ids = (patch: Parameters<typeof managerCatalogFilterSchema.parse>[0]) =>
  filterManagerCatalog(rows, criteria(patch)).map((p) => p.id);
test("price bounds are inclusive; unknown prices do not become zero; archives are separate", () => {
  assert.deepEqual(ids({ minPrice: 100000, maxPrice: 120000 }), ["1", "5"]);
  assert.deepEqual(ids({ maxPrice: 0 }), []);
  assert.deepEqual(ids({ status: "archive" }), ["4"]);
  assert.deepEqual(ids({}), ["1", "2", "3", "5"]);
});
test("summer price is used for seasonal properties, regular price for year-round properties", () => {
  assert.deepEqual(ids({ priceBasis: "summer", maxPrice: 140000 }), ["5"]);
  assert.deepEqual(ids({ priceBasis: "summer", minPrice: 150000, maxPrice: 150000 }), ["1"]);
});
test("complex, type, rooms, area and publication combine using AND", () => {
  assert.deepEqual(
    ids({
      complex: catalogComplexKey(rows[1]!),
      type: "house",
      rooms: "4+",
      minArea: 90,
      maxArea: 90,
      published: "yes",
    }),
    ["2"],
  );
  assert.deepEqual(ids({ complex: "none", rooms: "0", published: "no" }), ["3"]);
  assert.deepEqual(ids({ status: "rented", rooms: "1" }), ["5"]);
});
test("complex choices use stable ids and normalized fallback names", () => {
  const same = property("6", { complex_name: "  ЛАЗУРНЫЙ  БЕРЕГ " });
  assert.equal(catalogComplexKey(rows[0]!), catalogComplexKey(same));
  assert.equal(catalogComplexOptions([rows[0]!, same, rows[4]!]).length, 2);
  assert.equal(catalogComplexKey(rows[4]!), "id:complex-id");
});
test("sort keeps unknown values last and does not mutate source", () => {
  assert.deepEqual(ids({ sort: "price_desc" }), ["2", "5", "1", "3"]);
  assert.deepEqual(ids({ sort: "price_asc" }), ["1", "5", "2", "3"]);
  assert.deepEqual(ids({ sort: "area_desc" }), ["2", "1", "5", "3"]);
  assert.deepEqual(
    rows.map((p) => p.id),
    ["1", "2", "3", "4", "5"],
  );
});
test("invalid ranges give a useful error and no misleading matches; reset restores defaults", () => {
  const invalid = criteria({ minPrice: 200000, maxPrice: 100000 });
  assert.match(catalogFilterError(invalid), /Цена/);
  assert.deepEqual(filterManagerCatalog(rows, invalid), []);
  assert.match(catalogFilterError(criteria({ minArea: 100, maxArea: 40 })), /Площадь/);
  assert.deepEqual(ids(emptyManagerCatalogFilters()), ["1", "2", "3", "5"]);
});
test("search handles names, addresses, reference numbers and ё/е consistently", () => {
  assert.deepEqual(ids({ search: "МЕТРОПОЛЬ" }), ["5"]);
  assert.deepEqual(ids({ search: "  СОЧИ  " }), ["1", "2", "3", "5"]);
  assert.deepEqual(ids({ search: "5" }), ["5"]);
});
