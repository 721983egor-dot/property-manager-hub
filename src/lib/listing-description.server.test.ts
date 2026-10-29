import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildListingDescription,
  buildSeasonalPriceDescription,
  LISTING_DESCRIPTION_LIMITS,
  type ListingDescriptionPlatform,
} from "./listing-description.server.ts";
import {
  sanitizePropertyUpdateFields,
  propertyUpdateFieldsToDbPatch,
  summarizePropertyUpdateFields,
} from "./ai/property-update.server.ts";

const property = {
  description: "Светлая квартира у моря.",
  complex_id: null,
  rent_terms: "Долгосрочная аренда",
  deposit: 100000,
  utilities_month: 5000,
  price_month: 100000,
  seasonal_pricing: true,
  summer_price_month: 150000,
};

for (const platform of Object.keys(LISTING_DESCRIPTION_LIMITS) as ListingDescriptionPlatform[]) {
  test(`${platform}: public description includes both full recurring periods and monthly prices`, () => {
    const description = buildListingDescription(property, null, { platform });
    assert.match(description, /С 1 октября по 31 мая [—-] 100 000 ₽ в месяц\./);
    assert.match(description, /С 1 июня по 30 сентября [—-] 150 000 ₽ в месяц\./);
    assert.ok(description.length <= LISTING_DESCRIPTION_LIMITS[platform]);
    assert.doesNotMatch(description, /Стоимость аренды по периодам/);
    assert.equal((description.match(/^Условия$/gm) || []).length, 1);
    assert.ok(description.indexOf("Условия") < description.indexOf("С 1 октября"));
    if (platform === "cian") assert.doesNotMatch(description, /[\u00a0\u202f/]/);
  });
  test(`${platform}: long prose and terms cannot displace seasonal rates`, () => {
    const description = buildListingDescription(
      {
        ...property,
        description: "Описание. ".repeat(3000),
        rent_terms: "Дополнительные условия.\n".repeat(3000),
      },
      null,
      { platform },
    );
    assert.match(description, /С 1 октября по 31 мая [—-] 100 000 ₽ в месяц\./);
    assert.match(description, /С 1 июня по 30 сентября [—-] 150 000 ₽ в месяц\./);
    assert.ok(description.length <= LISTING_DESCRIPTION_LIMITS[platform]);
    assert.match(description, /сервис управления жилой недвижимостью в Сочи\.$/);
  });
}

test("missing, invalid, equal or disabled seasonal prices do not invent a summer increase", () => {
  for (const patch of [
    { seasonal_pricing: false },
    { summer_price_month: null },
    { summer_price_month: 0 },
    { summer_price_month: NaN },
    { summer_price_month: Infinity },
    { price_month: null },
    { summer_price_month: 100000 },
  ]) {
    assert.equal(buildSeasonalPriceDescription({ ...property, ...patch }), "");
  }
  assert.equal(buildSeasonalPriceDescription({}), "");
});

test("editing the property immediately changes the generated rates without stale amounts", () => {
  const description = buildListingDescription(
    { ...property, price_month: 120000, summer_price_month: 180000 },
    null,
    { platform: "avito" },
  );
  assert.match(description, /120 000 ₽ в месяц/);
  assert.match(description, /180 000 ₽ в месяц/);
  assert.doesNotMatch(description, /150 000/);
});

test("assistant seasonal edit is a partial confirmed patch using the same stored fields", () => {
  const fields = sanitizePropertyUpdateFields(
    { seasonalPricing: true, summerPriceMonth: 150000 },
    { seasonal_pricing: false, summer_price_month: null },
  );
  assert.deepEqual(propertyUpdateFieldsToDbPatch(fields), {
    seasonal_pricing: true,
    summer_price_month: 150000,
  });
  assert.match(summarizePropertyUpdateFields(fields).join("; "), /150/);
  assert.deepEqual(sanitizePropertyUpdateFields({ summerPriceMonth: 0 }), {});
  assert.deepEqual(
    propertyUpdateFieldsToDbPatch(
      sanitizePropertyUpdateFields({ seasonalPricing: false }, { seasonal_pricing: true }),
    ),
    { seasonal_pricing: false },
  );
});
