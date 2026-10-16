import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFinanceCalendar,
  findOpeningAnchor,
  openingAnchorKey,
} from "./finance-calendar-model.ts";
import type { Payment } from "./finance.ts";
const p = (patch: Partial<Payment> = {}): Payment =>
  ({
    id: "p",
    planned_date: "2026-10-14",
    amount: 12000,
    direction: "in",
    status: "expected",
    paid_amount: null,
    paid_at: null,
    ...patch,
  }) as Payment;
const today = "2026-10-16";

test("the 14th income becomes actual and survives a month and year boundary", () => {
  const payments = [p({ amount: 150000 })];
  const october = buildFinanceCalendar(payments, 2026, 9, today);
  assert.equal(october.chart[12]?.actual, 0);
  assert.equal(october.chart[13]?.actual, 150000);
  assert.equal(october.ledger.at(-1)?.closing, 150000);
  assert.equal(buildFinanceCalendar(payments, 2026, 10, today).opening, 150000);
  assert.equal(buildFinanceCalendar(payments, 2026, 10, "2026-11-16").chart[0]?.actual, 150000);
  assert.equal(buildFinanceCalendar(payments, 2027, 0, "2027-01-01").opening, 150000);
});
test("previous income and expenses carry across empty months; future money stays a forecast", () => {
  const rows = [
    p({ planned_date: "2026-08-14" }),
    p({ direction: "out", planned_date: "2026-09-30", amount: 2000 }),
    p({ planned_date: "2026-10-22", amount: 5000 }),
  ];
  const october = buildFinanceCalendar(rows, 2026, 9, today);
  assert.equal(october.opening, 10000);
  assert.equal(october.chart[15]?.actual, 10000);
  assert.equal(october.chart[21]?.actual, null);
  assert.equal(october.ledger.at(-1)?.closing, 15000);
});
test("early manual payment from a future month appears on its actual day exactly once", () => {
  const rows = [p({ planned_date: "2026-11-02", status: "paid", paid_at: "2026-10-14" })];
  const october = buildFinanceCalendar(rows, 2026, 9, today);
  assert.equal(october.chart[13]?.actual, 12000);
  assert.equal(october.ledger[13]?.income, 12000);
  const november = buildFinanceCalendar(rows, 2026, 10, today);
  assert.equal(november.opening, 12000);
  assert.equal(november.ledger[1]?.income, 0);
  assert.equal(november.ledger.at(-1)?.closing, 12000);
});
test("partial payment contributes only the received amount to actual cash", () => {
  const result = buildFinanceCalendar(
    [p({ status: "partial", paid_at: "2026-10-15", paid_amount: 3000 })],
    2026,
    9,
    today,
  );
  assert.equal(result.chart[14]?.actual, 3000);
  assert.equal(result.chart[15]?.actual, 3000);
  assert.equal(result.ledger.at(-1)?.closing, 12000);
});
test("manual opening is a baseline, then operations carry forward without double counting", () => {
  const rows = [p({ planned_date: "2026-09-14", amount: 90000 }), p()];
  const anchor = { date: "2026-10-01", amount: 1000 };
  assert.equal(buildFinanceCalendar(rows, 2026, 9, today, anchor).opening, 1000);
  assert.equal(buildFinanceCalendar(rows, 2026, 10, today, anchor).opening, 13000);
  assert.equal(buildFinanceCalendar(rows, 2026, 8, today, anchor).opening, 0);
});
test("storage picks latest earlier explicit baseline, including zero and account scopes", () => {
  const entries = new Map([
    [openingAnchorKey("2026-09"), "100"],
    [openingAnchorKey("2026-10"), "0"],
    [openingAnchorKey("2026-12"), "999"],
    [openingAnchorKey("2026-09", "card-id"), "500"],
  ]);
  const storage = {
    length: entries.size,
    key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (k: string) => entries.get(k) ?? null,
  };
  assert.deepEqual(findOpeningAnchor(storage, "2026-11"), { date: "2026-10-01", amount: 0 });
  assert.deepEqual(findOpeningAnchor(storage, "2026-11", "card-id"), {
    date: "2026-09-01",
    amount: 500,
  });
  assert.equal(findOpeningAnchor(storage, "2026-11", "other-card"), null);
});

test("carried balances retain exact kopecks", () => {
  const rows = [p({ id: "1", amount: 0.1 }), p({ id: "2", amount: 0.2 })];
  assert.equal(buildFinanceCalendar(rows, 2026, 9, today).chart[13]?.actual, 0.3);
  assert.equal(buildFinanceCalendar(rows, 2026, 10, today).opening, 0.3);
});
