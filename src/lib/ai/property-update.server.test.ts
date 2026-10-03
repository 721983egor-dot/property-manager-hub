import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countWipeNoise,
  propertyUpdateFieldsToDbPatch,
  sanitizePropertyUpdateFields,
} from "./property-update.server.ts";

const current = {
  title: "Апартаменты с 2 спальнями в Гранд Карат",
  internal_name: "Карат 1802",
  address: "Сочи",
  complex_name: "Гранд Карат",
  type: "apartment",
  rooms: 3,
  bathrooms: 2,
  area: 115,
  floor: 18,
  total_floors: 27,
  price_month: 400000,
  status: "rented",
  deposit: 300000,
  commission: 50,
  utilities_month: 50000,
  description: "Длинное описание",
  rent_terms: "Условия",
  availability_note: "",
  for_rent: true,
  video_url: "uploads/video.mp4",
};

describe("sanitizePropertyUpdateFields", () => {
  it("keeps only price from a full schema dump with empties/zeros", () => {
    const raw = {
      title: "",
      internalName: "",
      address: "",
      complexName: "",
      type: "apartment",
      rooms: 0,
      bathrooms: 0,
      area: 0,
      floor: 0,
      totalFloors: 0,
      priceMonth: 350000,
      status: "free",
      deposit: 0,
      commission: 0,
      utilitiesMonth: 0,
      description: "",
      rentTerms: "",
      availabilityNote: "",
      forRent: true,
      videoUrl: "",
    };
    assert.ok(countWipeNoise(raw) >= 5);
    const fields = sanitizePropertyUpdateFields(raw, current);
    assert.deepEqual(fields, { priceMonth: 350000 });
    assert.deepEqual(propertyUpdateFieldsToDbPatch(fields), { price_month: 350000 });
  });

  it("applies a clean single-field price patch", () => {
    const fields = sanitizePropertyUpdateFields({ priceMonth: 350000 }, current);
    assert.deepEqual(fields, { priceMonth: 350000 });
  });

  it("drops unchanged values", () => {
    const fields = sanitizePropertyUpdateFields(
      { priceMonth: 400000, status: "rented", rooms: 3 },
      current,
    );
    assert.deepEqual(fields, {});
  });

  it("never clears text with empty string without clearFields", () => {
    const fields = sanitizePropertyUpdateFields(
      { internalName: "", description: "" },
      current,
    );
    assert.deepEqual(fields, {});
  });

  it("clears video via clearFields", () => {
    const fields = sanitizePropertyUpdateFields(
      { clearFields: ["videoUrl"] },
      current,
    );
    assert.deepEqual(fields, { videoUrl: "" });
  });

  it("allows lone videoUrl empty as clear video", () => {
    const fields = sanitizePropertyUpdateFields({ videoUrl: "" }, current);
    assert.deepEqual(fields, { videoUrl: "" });
  });

  it("drops structural zeros and money zeros without clearFields", () => {
    const fields = sanitizePropertyUpdateFields(
      { rooms: 0, deposit: 0, utilitiesMonth: 0, priceMonth: 0 },
      current,
    );
    assert.deepEqual(fields, {});
  });
});
