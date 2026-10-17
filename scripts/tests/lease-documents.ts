import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  blankIdentity,
  defaultTemplate,
  leaseInputSchema,
  renderLease,
  validateLease,
  type LeaseSnapshot,
} from "../../src/lib/lease/model.ts";
import { seal, unseal, sealBytes, openBytes } from "../../src/lib/lease/crypto.server.ts";
import { parsePassportText } from "../../src/lib/lease/passport.server.ts";
import { importLeaseTemplate } from "../../src/lib/lease/import.server.ts";
import { renderLeaseFiles } from "../../src/lib/lease/render.server.ts";
process.env["LEASE_DATA_KEY"] = "ab".repeat(32);
const id = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const person = {
  ...blankIdentity(),
  full_name: "Тестовый Арендатор Примерович",
  series: "0000",
  number: "000001",
  birth_date: "1990-01-01",
  issued_date: "2010-01-01",
  issued_by: "Вымышленный орган для теста",
  department_code: "000-000",
  registration: "Тестовый адрес регистрации",
};
export const sample: LeaseSnapshot = {
  input: leaseInputSchema.parse({
    bookingVersion: "2026-10-17T00:00:00Z",
    templateVersion: 1,
    requestId: id(1),
    bookingId: id(2),
    templateId: id(3),
    tenant: person,
    owner: { ...person, full_name: "Тестовый Собственник" },
    ownerClientId: id(4),
    signerMode: "owner",
    verified: true,
    residents: "Два взрослых",
    pets: true,
    petKind: "Кошка",
    petCount: 1,
    includeAct: true,
    includeInventory: true,
    inventory:
      "Диван — 1 шт., состояние: без видимых повреждений.\nТелевизор — 1 шт.\nКлючи — 2 комплекта.",
  }),
  template: { ...defaultTemplate, id: id(3), revision: 1 },
  booking: {
    id: id(2),
    property_id: id(5),
    client_id: id(6),
    start_date: "2026-11-01",
    end_date: "2027-10-01",
    payment_day: 5,
    price_type: "periodic",
    price_month: 100000,
    deposit: 100000,
    status: "active",
    updated_at: "2026-10-17T00:00:00Z",
    booking_price_periods: [
      { start_date: "2026-11-01", end_date: "2027-05-31", price_month: 100000 },
      { start_date: "2027-06-01", end_date: "2027-08-31", price_month: 150000 },
      { start_date: "2027-09-01", end_date: "2027-09-30", price_month: 100000 },
    ],
  },
  property: {
    id: id(5),
    address: "Тестовый адрес объекта",
    title: "Посейдон 434 · пример",
    service_type: "commission_only",
  },
  number: "РМ-ТЕСТ",
  createdOn: "2026-10-17",
};
test("encrypted passports and files reject wrong AAD, tampering and missing key", () => {
  const cipher = seal(person, "identity:one");
  assert.ok(!cipher.includes(person.number));
  assert.deepEqual(unseal(cipher, "identity:one"), person);
  assert.throws(() => unseal(cipher, "identity:two"));
  const bytes = sealBytes(Buffer.from("private PDF"), "file:one");
  assert.equal(openBytes(bytes, "file:one").toString(), "private PDF");
  bytes[35] ^= 1;
  assert.throws(() => openBytes(bytes, "file:one"));
  const key = process.env["LEASE_DATA_KEY"];
  delete process.env["LEASE_DATA_KEY"];
  assert.throws(() => seal(person, "x"), /LEASE_DATA_KEY/);
  process.env["LEASE_DATA_KEY"] = key;
});
test("all signer modes; mandatory authority; independent owner; explicit verification", () => {
  validateLease(sample);
  assert.throws(() =>
    validateLease({ ...sample, property: { ...sample.property, service_type: "management" } }),
  );
  assert.throws(() => validateLease({ ...sample, input: { ...sample.input, verified: false } }));
  assert.throws(() =>
    validateLease({
      ...sample,
      input: { ...sample.input, ownerClientId: sample.booking.client_id },
    }),
  );
  assert.throws(() =>
    validateLease({
      ...sample,
      input: { ...sample.input, signerMode: "representative", representative: "Представитель" },
    }),
  );
  validateLease({
    ...sample,
    input: {
      ...sample.input,
      signerMode: "representative",
      representative: "Представитель",
      authority: "Доверенность № тест от 17.10.2026",
    },
  });
  validateLease({
    ...sample,
    input: {
      ...sample.input,
      signerMode: "company",
      company: {
        name: "ИП Пример",
        inn: "000000000000",
        ogrnip: "000000000000000",
        address: "Тестовый адрес ИП",
        phone: "",
      },
      authority: "Согласованный документ-основание",
    },
  });
});
test("season prices, pets and appendices come from the exact snapshot", () => {
  const pages = renderLease(sample);
  assert.equal(pages.length, 3);
  assert.match(pages[0]!.text, /150.000,00/);
  assert.match(pages[0]!.text, /Кошка/);
  assert.match(pages[0]!.text, /ЧЕРНОВИК/);
  assert.match(pages[2]!.text, /Телевизор/);
  assert.doesNotMatch(pages.map((s) => s.text).join(""), /\{\{/);
  assert.doesNotMatch(
    renderLease({ ...sample, input: { ...sample.input, pets: false } })[0]!.text,
    /Кошка/,
  );
  assert.throws(() =>
    renderLease({ ...sample, template: { ...sample.template, body: "{{unknown_token}}" } }),
  );
});
test("passport OCR parser uses labelled evidence and never guesses missing fields", () => {
  const p = parsePassportText(
    "Фамилия ТЕСТОВ\nИмя ПРИМЕР\nОтчество ПРИМЕРОВИЧ\n00 00 000001\nДата рождения 01.01.1990\nДата выдачи 01.01.2010\nКем выдан ТЕСТОВЫЙ ОРГАН\nКод 000-000",
  );
  assert.equal(p.series, "0000");
  assert.equal(p.number, "000001");
  assert.equal(p.birth_date, "1990-01-01");
  assert.equal(p.registration, undefined);
  assert.deepEqual(parsePassportText("Квартира с кошкой"), {});
  assert.equal(parsePassportText("Фамилия\nИмя\nПРИМЕР").full_name, undefined);
  assert.equal(
    parsePassportText("Фамилия\nТЕСТОВ\nИмя\nПРИМЕР\nОтчество\nПРИМЕРОВИЧ").full_name,
    "ТЕСТОВ ПРИМЕР ПРИМЕРОВИЧ",
  );
});
test("render actual PDF and DOCX files for visual QA", async () => {
  const files = await renderLeaseFiles(sample);
  assert.equal(files.pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal(files.docx.subarray(0, 2).toString(), "PK");
  assert.match(importLeaseTemplate(files.docx), /Тестовый Арендатор/);
  assert.throws(() => importLeaseTemplate(Buffer.from("invalid")));
  await mkdir("/tmp/rm-lease-test", { recursive: true });
  await writeFile("/tmp/rm-lease-test/lease.pdf", files.pdf);
  await writeFile("/tmp/rm-lease-test/lease.docx", files.docx);
});
