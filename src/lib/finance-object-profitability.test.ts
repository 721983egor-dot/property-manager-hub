import assert from "node:assert/strict";
import { test } from "node:test";
import { objectProfitability, matchesObjectType } from "./finance-object-profitability.ts";
import type { Payment, FinancePropertyOption } from "./finance.ts";
const properties = [
  { id: "house", title: "Дом", type: "villa", status: "archived" },
  { id: "flat", title: "Квартира", type: "aparts" },
] as FinancePropertyOption[];
const p = (id: string, patch: Partial<Payment> = {}) =>
  ({
    id,
    property_id: "house",
    amount: 1000,
    direction: "in",
    kind: "other",
    planned_date: "2026-10-15",
    accrual_date: null,
    status: "expected",
    article: null,
    article_id: null,
    ...patch,
  }) as Payment;
const report = (rows: Payment[], type: "all" | "house" | "apartment" = "all", id = "all") =>
  objectProfitability(
    rows,
    { categories: [], articles: [] },
    properties,
    "2026-10-01",
    "2026-10-31",
    type,
    id,
  );
test("company profit excludes owner, utilities, deposits and unassigned company overhead", () => {
  const r = report([
    p("rent", { kind: "rent_in", rental_component: "rent", company_fee: 200 }),
    p("service", { amount: 50 }),
    p("cost", { direction: "out", amount: 30, expense_bearer: "company" }),
    p("owner-cost", { direction: "out", expense_bearer: "owner" }),
    p("deposit", { kind: "deposit_in" }),
    p("utilities", { rental_component: "utilities" }),
    p("owner", { kind: "owner_payout", direction: "out" }),
    p("overhead", { property_id: null, direction: "out" }),
  ]);
  assert.equal(r.guest, 1000);
  assert.equal(r.owner, 800);
  assert.equal(r.income, 250);
  assert.equal(r.expense, 30);
  assert.equal(r.net, 220);
  assert.equal(r.rows[0]?.entries.find((e) => e.payment.id === "rent")?.amount, 200);
  assert.equal(r.rows[0]?.entries.find((e) => e.payment.id === "rent")?.payment.amount, 1000);
});
test("filter by real property type, individual object and archived property", () => {
  const rows = [p("h"), p("f", { property_id: "flat", amount: 300 })];
  assert.equal(report(rows, "house").income, 1000);
  assert.equal(report(rows, "apartment").income, 300);
  assert.equal(report(rows, "all", "flat").rows.length, 1);
  assert.equal(report(rows, "house", "flat").rows.length, 0);
  assert.equal(matchesObjectType("townhouse", "house"), true);
  assert.equal(matchesObjectType(undefined, "apartment"), false);
});
test("accrual overrides planned and paid date, unpaid full amount included, boundaries inclusive", () => {
  const r = report([
    p("first", { planned_date: "2026-11-02", accrual_date: "2026-10-01", paid_at: "2026-11-05" }),
    p("last", { planned_date: "2026-10-31", amount: 20 }),
    p("outside", { accrual_date: "2026-09-30" }),
  ]);
  assert.equal(r.income, 1020);
});
test("unknown rental commission is exposed without guessing owner share or earnings", () => {
  const r = report([
    p("unknown", { kind: "rent_in", rental_component: "rent", company_fee: null }),
  ]);
  assert.equal(r.unallocated, 1000);
  assert.equal(r.owner, 0);
  assert.equal(r.income, 0);
  assert.equal(r.rows.length, 1);
  assert.equal(r.margin, null);
});
test("zero commission is an explicit owner-only allocation; legacy commission is not counted twice", () => {
  const r = report([
    p("zero", { kind: "rent_in", rental_component: "rent", company_fee: 0 }),
    p("gross", {
      kind: "rent_in",
      rental_component: "rent",
      company_fee: 200,
      booking_id: "booking",
      rental_period: "2026-10-01",
    }),
    p("legacy", { management_period: "2026-10-01", booking_id: "booking", amount: 200 }),
  ]);
  assert.equal(r.guest, 2000);
  assert.equal(r.owner, 1800);
  assert.equal(r.income, 200);
  assert.equal(r.unallocated, 0);
});
test("loss, no revenue and empty selection keep meaningful margins and totals", () => {
  const r = report([p("expense", { direction: "out", amount: 50 })]);
  assert.equal(r.net, -50);
  assert.equal(r.margin, null);
  assert.equal(report([]).rows.length, 0);
  assert.equal(report([p("unknown-object", { property_id: "deleted" })]).rows.length, 0);
});
