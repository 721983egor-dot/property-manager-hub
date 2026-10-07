import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterFinanceObjects,
  objectFinanceSummary,
  objectFinanceSeries,
} from "./finance-object-model.ts";
import type { Payment, FinancePropertyOption } from "./finance.ts";
import type { FinanceObligation } from "./finance-counterparties.ts";
const catalog = { categories: [], articles: [] };
const properties = [
  { id: "a", title: "Вилла Ахун", internal_name: null, ref_id: 23, status: "free" },
  { id: "b", title: "Квартира", internal_name: "ЛБ1", ref_id: 10, status: "archived" },
  { id: "c", title: "Без группы", internal_name: null, ref_id: 11, status: "free" },
] as FinancePropertyOption[];
const assignments = [
  { property_id: "a", classification_id: "daily" },
  { property_id: "b", classification_id: "monthly" },
];
const p = (patch: Partial<Payment> = {}): Payment =>
  ({
    id: "p",
    amount: 100,
    direction: "in",
    status: "paid",
    paid_amount: null,
    kind: "rent_in",
    planned_date: "2026-10-02",
    paid_at: "2026-10-02",
    accrual_date: null,
    property_id: "a",
    article_id: null,
    article: null,
    ...patch,
  }) as Payment;
test("financial classification filters existing and archived objects without duplicates", () => {
  assert.deepEqual(
    filterFinanceObjects(properties, assignments, "daily").map((p) => p.id),
    ["a"],
  );
  assert.deepEqual(
    filterFinanceObjects(properties, assignments, "none").map((p) => p.id),
    ["c"],
  );
  assert.equal(filterFinanceObjects(properties, assignments).length, 3);
  assert.equal(filterFinanceObjects(properties, assignments, "all", "лб1")[0]?.id, "b");
  assert.equal(filterFinanceObjects(properties, assignments, "all", "23")[0]?.id, "a");
});
test("removing a classification retains the object and unclassified financial history", () => {
  const removed = assignments.map((a) => ({ ...a, classification_id: null }));
  assert.equal(filterFinanceObjects(properties, removed, "none").length, 3);
  assert.equal(objectFinanceSummary("a", [p()], [], catalog, "2026-10-01", "2026-10-31").net, 100);
});
test("object summary isolates its payments and correctly separates profit from cash", () => {
  const all = [
    p({ status: "partial", paid_amount: 40 }),
    p({ id: "other", property_id: "b", amount: 200 }),
    p({ kind: "deposit_in", amount: 300 }),
  ];
  assert.equal(objectFinanceSummary("a", all, [], catalog, "2026-10-01", "2026-10-31").income, 100);
  assert.equal(
    objectFinanceSummary("a", all, [], catalog, "2026-10-01", "2026-10-31", "cash").income,
    340,
  );
});
test("current object debt is independent of report period and excludes settled/closed debts", () => {
  const obligations = [
    {
      id: "o",
      property_id: "a",
      amount: 100,
      status: "open",
      direction: "payable",
      planned_date: "2026-08-01",
    },
    { id: "closed", property_id: "a", amount: 500, status: "closed", direction: "payable" },
    { id: "other", property_id: "b", amount: 500, status: "open", direction: "receivable" },
  ] as FinanceObligation[];
  const s = objectFinanceSummary(
    "a",
    [p({ direction: "out", obligation_id: "o", paid_amount: 25 })],
    obligations,
    catalog,
    "2026-11-01",
    "2026-11-30",
  );
  assert.equal(s.net, 0);
  assert.equal(s.payable, 75);
  assert.equal(s.debtBalance, -75);
});
test("cash chart counts only unpaid remaining future amounts, and includes empty days", () => {
  const all = [
    p(),
    p({
      id: "future",
      planned_date: "2026-10-04",
      paid_at: "2026-10-02",
      status: "partial",
      paid_amount: 40,
    }),
    p({ id: "other", property_id: "b", amount: 900 }),
  ];
  const series = objectFinanceSeries(
    "a",
    all,
    catalog,
    "2026-10-01",
    "2026-10-05",
    "cash",
    "2026-10-03",
  );
  assert.equal(series.length, 5);
  assert.equal(series[1]?.actual, 140);
  assert.equal(series[2]?.forecast, 140);
  assert.equal(series[3]?.actual, null);
  assert.equal(series[3]?.forecast, 200);
  assert.equal(series[4]?.forecast, 200);
});
test("profit graph follows alternate accrual date with a continuous today bridge", () => {
  const series = objectFinanceSeries(
    "a",
    [p({ accrual_date: "2026-10-04", status: "expected" })],
    catalog,
    "2026-10-01",
    "2026-10-05",
    "profit",
    "2026-10-03",
  );
  assert.equal(series[2]?.actual, 0);
  assert.equal(series[2]?.forecast, 0);
  assert.equal(series[3]?.forecast, 100);
});
