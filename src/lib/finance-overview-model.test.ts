import assert from "node:assert/strict";
import { test, mock } from "node:test";
import type { Payment } from "./finance.ts";
import { financeOverview, readOverviewOpenings } from "./finance-overview-model.ts";
import {
  financeOpeningScope,
  openingAnchorKey,
  buildFinanceCalendar,
  findOpeningAnchor,
} from "./finance-calendar-model.ts";
mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-18T09:00:00Z") });
const catalog = { categories: [], articles: [] };
const today = "2026-10-18",
  month = "2026-10";
const p = (id: string, amount: number, patch: Partial<Payment> = {}): Payment =>
  ({
    id,
    amount,
    property_id: "home",
    booking_id: "booking",
    kind: "rent_in",
    direction: "in",
    rental_component: "rent",
    rental_period: "2026-10-01",
    company_fee: amount / 10,
    planned_date: "2026-10-14",
    status: "paid",
    paid_at: null,
    paid_amount: null,
    comment: "",
    article_id: null,
    article: null,
    ...patch,
  }) as Payment;
const rows = [
  p("rent", 100000),
  p("ku", 2500, { kind: "other", rental_component: "utilities", company_fee: 0 }),
  p("payout", 50000, {
    kind: "owner_payout",
    rental_component: null,
    company_fee: null,
    direction: "out",
  }),
  p("ad", 2000, {
    kind: "agency_cost",
    rental_component: null,
    company_fee: null,
    direction: "out",
  }),
  p("deposit", 500000, { kind: "deposit_in", rental_component: null, company_fee: null }),
  p("future", 200000, { status: "expected", planned_date: "2026-10-25" }),
];
const read = (payments = rows, m = month) => financeOverview(payments, catalog, [], [], m, today);
function storage(values: Record<string, string>) {
  return {
    length: Object.keys(values).length,
    key: (i: number) => Object.keys(values)[i] ?? null,
    getItem: (k: string) => values[k] ?? null,
  };
}
test("overview reconciles company money with bank, owners and refundable deposits", () => {
  const o = read();
  assert.equal(o.income, 10000);
  assert.equal(o.expense, 2000);
  assert.equal(o.profit, 8000);
  assert.equal(o.available, 8000);
  assert.equal(o.ownerReserve, 42500);
  assert.equal(o.deposits, 500000);
  assert.equal(o.bank, 550500);
  assert.equal(o.unallocatedBalance, 0);
  assert.equal(o.expectedIncome, 20000);
  assert.equal(o.expectedExpense, 0);
  assert.equal(o.flows.company.forecastBalance, 28000);
});
test("historical month changes result and graph, while today's cash and seven-day list stay current", () => {
  const o = read(rows, "2026-09");
  assert.equal(o.income, 0);
  assert.equal(o.available, 8000);
  assert.equal(o.bank, 550500);
  assert.equal(o.expectedIncome, 0);
  assert.equal(o.flows.company.forecastBalance, 0);
});
test("unknown rent and excluded articles are never treated as company cash", () => {
  const o = read([
    p("unknown", 100000, { company_fee: null }),
    p("excluded", 3000, {
      kind: "other",
      rental_component: null,
      company_fee: null,
      article: {
        id: "transit",
        name: "Transit",
        code: null,
        category_id: null,
        category_name: null,
        affects_profit: false,
      },
    }),
  ]);
  assert.equal(o.income, 0);
  assert.equal(o.available, 0);
  assert.equal(o.unallocatedBalance, 103000);
  assert.equal(o.unallocatedRent, 1);
});
test("opening balances use exactly the calendar scopes; unassigned opening cash is disclosed", () => {
  const totalKey = openingAnchorKey(month, financeOpeningScope());
  const s = storage({ [totalKey]: "100000" });
  const openings = readOverviewOpenings(s, month, today);
  const o = financeOverview(rows, catalog, [], [], month, today, null, openings);
  const calendar = buildFinanceCalendar(
    o.flows.total.rows,
    2026,
    9,
    today,
    findOpeningAnchor(s, month),
  );
  assert.equal(o.bank, calendar.chart.at(-1)?.actual);
  assert.equal(o.bank, 650500);
  assert.equal(o.available, 8000);
  assert.equal(o.unallocatedBalance, 100000);
  const split = storage({
    [totalKey]: "100000",
    [openingAnchorKey(month, financeOpeningScope("all", "all", "all", "company"))]: "30000",
    [openingAnchorKey(month, financeOpeningScope("all", "all", "all", "owner"))]: "70000",
  });
  const allocated = financeOverview(
    rows,
    catalog,
    [],
    [],
    month,
    today,
    null,
    readOverviewOpenings(split, month, today),
  );
  assert.equal(allocated.available, 38000);
  assert.equal(allocated.ownerReserve, 112500);
  assert.equal(allocated.unallocatedBalance, 0);
});
test("property openings never leak into all-object balance or another property", () => {
  const s = storage({
    [openingAnchorKey(month, financeOpeningScope("home", "all", "all", "company"))]: "50000",
  });
  assert.equal(readOverviewOpenings(s, month, today).company.current.actual, null);
  assert.equal(readOverviewOpenings(s, month, today, "another").company.current.actual, null);
  assert.equal(readOverviewOpenings(s, month, today, "home").company.current.actual?.amount, 50000);
});
test("upcoming uses unpaid remainder, includes older partial debt, excludes paid balances, and covers seven calendar days", () => {
  const o = read([
    p("overdue", 100000, { status: "partial", paid_amount: 30000, planned_date: "2026-09-10" }),
    p("within", 100000, { status: "expected", planned_date: "2026-10-24" }),
    p("outside", 100000, { status: "expected", planned_date: "2026-10-25" }),
    p("paid", 100000, { status: "paid", paid_amount: 90000 }),
  ]);
  assert.equal(o.weekEnd, "2026-10-24");
  assert.deepEqual(
    o.upcoming.map((p) => [p.payment.id, p.remaining, p.overdue]),
    [
      ["overdue", 70000, true],
      ["within", 100000, false],
    ],
  );
  assert.equal(o.overdueCount, 1);
  assert.equal(o.expectedIncome, 27000);
});
test("KU remittance reduces owner balance, without creating a company cost or unexplained difference", () => {
  const o = read([
    p("ku-in", 2500, { kind: "other", rental_component: "utilities", company_fee: 0 }),
    p("ku-out", 2500, {
      kind: "other",
      rental_component: null,
      company_fee: null,
      direction: "out",
      article: {
        id: "ku",
        code: "utilities_out",
        name: "KU",
        category_id: null,
        category_name: null,
        affects_profit: false,
      },
    }),
  ]);
  assert.equal(o.bank, 0);
  assert.equal(o.ownerReserve, 0);
  assert.equal(o.expense, 0);
  assert.equal(o.unallocatedBalance, 0);
});
test("owner forecast is actionable as forecast only and does not fabricate overdue debt", () => {
  const o = financeOverview(
    [p("rent", 100000)],
    catalog,
    [
      {
        property_id: "home",
        classification_id: null,
        owner_counterparty_id: "owner",
        payout_day: 10,
      },
    ],
    [],
    month,
    today,
  );
  assert.equal(o.ownerReserve, 90000);
  assert.equal(o.upcoming[0]?.forecastOnly, true);
  assert.equal(o.overdueCount, 0);
  assert.equal(o.flows.owner.forecastBalance, 0);
});
