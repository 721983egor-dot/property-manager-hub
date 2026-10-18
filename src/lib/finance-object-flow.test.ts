import assert from "node:assert/strict";
import { test, mock } from "node:test";
import type { Payment } from "./finance.ts";
import {
  objectFlowPayments,
  objectFlowSummary,
  objectFlowSourceId,
} from "./finance-object-flow.ts";
mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-18T09:00:00Z") });
const catalog = { articles: [], categories: [] };
const p = (id: string, amount: number, patch: Partial<Payment> = {}): Payment =>
  ({
    id,
    amount,
    property_id: "home",
    booking_id: "b",
    direction: "in",
    kind: "rent_in",
    rental_component: "rent",
    rental_period: "2026-10-01",
    company_fee: amount / 10,
    status: "paid",
    planned_date: "2026-10-14",
    paid_amount: null,
    paid_at: null,
    article: null,
    article_id: null,
    comment: "",
    ...patch,
  }) as Payment;
const settings = [
  { property_id: "home", classification_id: null, owner_counterparty_id: "owner", payout_day: 26 },
];
const rows = [
  p("previous", 150000, { planned_date: "2026-09-14", rental_period: "2026-09-01" }),
  p("previous-transfer", 135000, {
    planned_date: "2026-09-26",
    rental_period: "2026-09-01",
    direction: "out",
    kind: "owner_payout",
    rental_component: null,
    company_fee: null,
  }),
  p("rent", 100000),
  p("ku", 2500, { kind: "other", rental_component: "utilities", company_fee: 0 }),
  p("advert", 2000, {
    direction: "out",
    kind: "agency_cost",
    rental_component: null,
    company_fee: null,
  }),
  p("transfer", 50000, {
    direction: "out",
    kind: "owner_payout",
    rental_component: null,
    company_fee: null,
  }),
  p("deposit", 500000, { kind: "deposit_in", rental_component: null, company_fee: null }),
  p("future", 200000, { planned_date: "2026-10-25", status: "expected" }),
  p("legacy", 10000, {
    kind: "other",
    rental_component: null,
    company_fee: null,
    management_period: "2026-10-01",
  }),
  p("another-property", 999999, { property_id: "another" }),
];
const summary = (flow: "company" | "owner" | "total") =>
  objectFlowSummary(
    objectFlowPayments("home", rows, catalog, flow, settings),
    catalog,
    "2026-10-01",
    "2026-10-31",
    "2026-10-18",
  );
test("partial allocation preserves the last kopeck without rounding it twice", () => {
  const rows = [p("kopeck", 0.02, { company_fee: 0.01, status: "partial", paid_amount: 0.01 })];
  const read = (flow: "company" | "owner" | "total") =>
    objectFlowSummary(
      objectFlowPayments("home", rows, catalog, flow),
      catalog,
      "2026-10-01",
      "2026-10-31",
      "2026-10-18",
    ).income;
  assert.equal(read("company"), 0.01);
  assert.equal(read("owner"), 0);
  assert.equal(read("total"), 0.01);
});
test("KU remittance belongs to the owner stream and not company costs", () => {
  const row = p("ku-transfer", 2500, {
    direction: "out",
    kind: "other",
    rental_component: null,
    company_fee: null,
    article: {
      id: "ku-out",
      name: "Перечисление КУ",
      code: "utilities_out",
      category_id: null,
      category_name: null,
      affects_profit: false,
    },
  });
  assert.equal(objectFlowPayments("home", [row], catalog, "owner").length, 1);
  assert.equal(objectFlowPayments("home", [row], catalog, "company").length, 0);
});
test("object flows separate fee, owner net rent/KU, remittances and reserved deposit", () => {
  const company = summary("company"),
    owner = summary("owner"),
    total = summary("total");
  assert.equal(company.income, 10000);
  assert.equal(company.expense, 2000);
  assert.equal(company.actualBalance, 23000);
  assert.equal(company.forecastBalance, 43000);
  assert.equal(owner.income, 92500);
  assert.equal(owner.expense, 50000);
  assert.equal(owner.actualBalance, 42500);
  assert.equal(owner.forecastBalance, 0);
  assert.equal(total.income, 602500);
  assert.equal(total.expense, 52000);
  assert.equal(total.actualBalance, 565500);
  assert.equal(total.forecastBalance, 543000);
  assert.equal(company.actualBalance + owner.actualBalance + 500000, total.actualBalance);
});
test("actual cash carries from history and stays solid and flat into future months", () => {
  const flow = objectFlowPayments("home", rows, catalog, "total", settings);
  const current = summary("total");
  assert.equal(current.series[0]?.actual, 15000);
  assert.equal(current.series.at(-1)?.actual, 565500);
  assert.equal(current.series.find((p) => p.date === "2026-10-25")?.forecast, 765500);
  const next = objectFlowSummary(flow, catalog, "2026-11-01", "2026-11-30", "2026-10-18");
  assert.ok(next.series.every((p) => p.actual === 565500));
  assert.equal(next.forecastBalance, 543000);
});
test("partial owner share prorates cash; unknown commission is never guessed", () => {
  const partial = p("partial", 100000, { status: "partial", paid_amount: 30000 });
  const owner = objectFlowPayments(
    "home",
    [partial, p("unknown", 40000, { company_fee: null })],
    catalog,
    "owner",
  );
  const s = objectFlowSummary(owner, catalog, "2026-10-01", "2026-10-31", "2026-10-18");
  assert.equal(s.income, 27000);
  assert.equal(owner[0]?.amount, 90000);
  assert.equal(owner.length, 1);
  assert.equal(objectFlowSourceId(owner[0]!.id), partial.id);
});
test("a due unpaid owner plan stays forecast, and an existing plan is not duplicated", () => {
  const plan = p("plan", 90000, {
    status: "partial",
    paid_amount: 0,
    kind: "owner_payout",
    direction: "out",
    rental_component: "owner_plan",
    obligation_id: "debt",
    planned_date: "2026-10-10",
  });
  const scoped = objectFlowPayments("home", [p("rent", 100000), plan], catalog, "owner", settings, [
    { id: "s", property_id: "home", period: "2026-10-01", obligation_id: "debt", automatic: true },
  ]);
  assert.equal(scoped.filter((p) => p.kind === "owner_payout").length, 1);
  const s = objectFlowSummary(scoped, catalog, "2026-10-01", "2026-10-31", "2026-10-18");
  assert.equal(s.expense, 0);
  assert.equal(s.actualBalance, 90000);
  assert.equal(s.forecastBalance, 0);
});

test("all movements include multiple properties and unassigned company expenses", () => {
  const history = [
    p("a", 100000),
    p("b", 200000, { property_id: "another", booking_id: "b2" }),
    p("office", 5000, {
      property_id: null,
      rental_component: null,
      company_fee: null,
      kind: "agency_cost",
      direction: "out",
    }),
    p("deposit", 500000, { kind: "deposit_in", rental_component: null, company_fee: null }),
  ];
  const read = (flow: "company" | "owner" | "total") =>
    objectFlowSummary(
      objectFlowPayments(null, history, catalog, flow),
      catalog,
      "2026-10-01",
      "2026-10-31",
      "2026-10-18",
    );
  assert.equal(read("company").actualBalance, 25000);
  assert.equal(read("owner").actualBalance, 270000);
  assert.equal(read("total").actualBalance, 795000);
  assert.equal(objectFlowPayments("home", history, catalog, "company").length, 1);
});
test("all movements retain account filters and canonical commission articles after allocation", () => {
  const history = [
    p("cash", 100000, { account: "Наличные" }),
    p("bank", 200000, { property_id: "another", booking_id: "b2", account: "Банк" }),
  ];
  const catalogWithFee = {
    categories: [],
    articles: [
      {
        id: "fee",
        name: "Комиссия",
        code: "company_commission",
        category_id: null,
        direction: "in" as const,
        affects_profit: true,
        archived: false,
        sort_order: 0,
      },
    ],
  };
  const selected = objectFlowPayments(null, history, catalogWithFee, "company").filter(
    (p) => p.account === "Наличные" && p.article_id === "fee",
  );
  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.amount, 10000);
  assert.equal(objectFlowSourceId(selected[0]!.id), "cash");
});
