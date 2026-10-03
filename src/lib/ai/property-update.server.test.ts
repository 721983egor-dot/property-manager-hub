import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countWipeNoise,
  formatPropertyUpdateConfirmLabel,
  propertyUpdateFieldsToDbPatch,
  sanitizePropertyUpdateFields,
  summarizePropertyUpdateFields,
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

/** Дамп как у модели при «поставь цену» — полный schema wipe. */
const priceDumpRaw = {
  title: "",
  internalName: "",
  address: "",
  complexName: "",
  type: "house",
  rooms: 0,
  bathrooms: 0,
  area: 0,
  floor: 0,
  totalFloors: 0,
  priceMonth: 430000,
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

describe("sanitizePropertyUpdateFields", () => {
  it("keeps only price from a full schema dump with empties/zeros", () => {
    assert.ok(countWipeNoise(priceDumpRaw) >= 5);
    const fields = sanitizePropertyUpdateFields(priceDumpRaw, current);
    assert.deepEqual(fields, { priceMonth: 430000 });
    assert.deepEqual(propertyUpdateFieldsToDbPatch(fields), { price_month: 430000 });
  });

  it("strips price+noise dump even with only 3 wipe signals", () => {
    const raw = {
      internalName: "",
      complexName: "",
      rooms: 0,
      priceMonth: 430000,
      status: "free",
      type: "house",
      forRent: true,
    };
    assert.equal(countWipeNoise(raw), 3);
    const fields = sanitizePropertyUpdateFields(raw, current);
    assert.deepEqual(fields, { priceMonth: 430000 });
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

  it("keeps intentional multi-field edit without wipe noise", () => {
    const fields = sanitizePropertyUpdateFields(
      { rooms: 4, bathrooms: 3, status: "free" },
      current,
    );
    assert.deepEqual(fields, { rooms: 4, bathrooms: 3, status: "free" });
  });
});

describe("formatPropertyUpdateConfirmLabel", () => {
  it("price-only confirm for Celinnaya-style dump (Егор: поставь цену 430000)", () => {
    const fields = sanitizePropertyUpdateFields(priceDumpRaw, {
      ...current,
      title: "Вилла Целинная",
      internal_name: "Целинная",
      type: "house",
      price_month: 400000,
    });
    assert.deepEqual(fields, { priceMonth: 430000 });
    assert.deepEqual(summarizePropertyUpdateFields(fields), ["цена 430\u00a0000 ₽/мес"]);
    const label = formatPropertyUpdateConfirmLabel("Вилла Целинная (№1051)", fields);
    assert.equal(label, "Изменить «Вилла Целинная (№1051)»: цена 430\u00a0000 ₽/мес");
    assert.ok(label && !label.includes("внутреннее"));
    assert.ok(label && !label.includes("0 комн"));
    assert.ok(label && !label.includes("убрать видео"));
    assert.ok(label && !label.includes("депозит"));
  });

  it("lists only clearFields video clear, not wipe empties", () => {
    const fields = sanitizePropertyUpdateFields({ clearFields: ["videoUrl"] }, current);
    const label = formatPropertyUpdateConfirmLabel("Карат 1802 (№1060)", fields);
    assert.equal(label, "Изменить «Карат 1802 (№1060)»: убрать видео");
  });

  it("returns null when sanitize yields empty patch", () => {
    const fields = sanitizePropertyUpdateFields({ rooms: 0, internalName: "" }, current);
    assert.equal(formatPropertyUpdateConfirmLabel("X", fields), null);
  });
});
