import assert from "node:assert/strict";
import { test } from "node:test";
import { asSchema } from "ai";
import {
  fallbackRentalDescription,
  groundedLocationCopy,
  locationSearchAddress,
  samplePhotoIndexes,
  locationResearchSchema,
} from "./copy-model.ts";
import { buildListingDescription } from "../listing-description.server.ts";
import {
  sanitizePropertyUpdateFields,
  propertyUpdateFieldsToDbPatch,
} from "../ai/property-update.server.ts";

const input = {
  diskUrl: "https://disk.yandex.ru/d/example",
  address: "Сочи, ул. Примерная, 10, кв. 25",
  rooms: 2,
  area: 54,
  priceMonth: 80000,
};
test("location output schema avoids the URI format rejected by the live strict-output API", async () => {
  const schema = await asSchema(locationResearchSchema).jsonSchema;
  assert.doesNotMatch(JSON.stringify(schema), /"format":"uri"/);
});
test("vision sample spans the folder and never exceeds six photos", () => {
  assert.deepEqual(samplePhotoIndexes(0), []);
  assert.deepEqual(samplePhotoIndexes(1), [0]);
  assert.deepEqual(samplePhotoIndexes(3), [0, 1, 2]);
  assert.deepEqual(samplePhotoIndexes(20), [0, 4, 8, 11, 15, 19]);
});
test("location search excludes the apartment number", () => {
  assert.equal(locationSearchAddress(input.address), "Сочи, ул. Примерная, 10");
  assert.equal(locationSearchAddress("Сочи, Примерная, 10 квартира 25"), "Сочи, Примерная, 10");
});
test("fallback description uses only supplied facts and respects studio/house type", () => {
  const text = fallbackRentalDescription(input);
  assert.match(text, /54 м²/);
  assert.doesNotMatch(text, /мебел|море|парковк|тих|посудомо/);
  assert.match(fallbackRentalDescription({ ...input, rooms: 0 }), /Студия/);
  assert.match(fallbackRentalDescription({ ...input, type: "house" }), /дом/);
});
test("location rejects uncited claims and mismatching addresses", () => {
  const research = {
    addressMatched: true,
    facts: [{ text: "Рядом городской парк.", sourceUrl: "https://example.org/park" }],
    questions: [],
  };
  assert.doesNotMatch(groundedLocationCopy(input, research, []).description, /парк/);
  assert.match(
    groundedLocationCopy(input, research, ["https://example.org/park"]).description,
    /парк/,
  );
  assert.doesNotMatch(
    groundedLocationCopy(input, { ...research, addressMatched: false }, [
      "https://example.org/park",
    ]).description,
    /парк/,
  );
  assert.ok(groundedLocationCopy(input, null, []).questions.length);
});
test("explicit manager location notes survive failed web research", () => {
  const result = groundedLocationCopy(
    { ...input, locationNotes: "Остановка у дома — сообщил собственник." },
    null,
    [],
  );
  assert.match(result.description, /Остановка/);
  assert.equal(result.sources.length, 0);
  assert.equal(result.questions.length, 0);
});
test("own location appears in all feeds without a complex; linked complex retains its location", () => {
  const property = {
    description: "Описание квартиры",
    location_description: "Локация объекта",
    complex_id: null,
    rent_terms: "",
    deposit: null,
    utilities_month: null,
  };
  for (const platform of ["cian", "avito", "yandex", "yandex-spravochnik"] as const) {
    const text = buildListingDescription(property, null, { platform });
    assert.match(text, /Локация объекта/);
    assert.doesNotMatch(text, /Инфо по ЖК/);
  }
  const text = buildListingDescription(
    { ...property, complex_id: "complex" },
    {
      name: "ЖК",
      description: "Описание ЖК",
      location_description: "Локация ЖК",
      infrastructure: [],
    },
    { platform: "avito" },
  );
  assert.match(text, /Локация ЖК/);
  assert.doesNotMatch(text, /Локация объекта/);
});
test("location edits preserve unrelated fields and require deliberate clearing", () => {
  const fields = sanitizePropertyUpdateFields(
    { locationDescription: "Новый район" },
    { price_month: 80000 },
  );
  assert.deepEqual(propertyUpdateFieldsToDbPatch(fields), { location_description: "Новый район" });
  assert.deepEqual(
    propertyUpdateFieldsToDbPatch(sanitizePropertyUpdateFields({ locationDescription: "" }, null)),
    {},
  );
  assert.deepEqual(
    propertyUpdateFieldsToDbPatch(
      sanitizePropertyUpdateFields(
        { clearFields: ["locationDescription"] },
        { location_description: "Старый текст" },
      ),
    ),
    { location_description: "" },
  );
});
