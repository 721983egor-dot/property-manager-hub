import test from "node:test";
import assert from "node:assert/strict";
import { buildFinanceTasks, type FinanceTaskSources } from "./finance-tasks-model.ts";
import type { Payment } from "./finance.ts";
const p = (id: string, extra: Partial<Payment> = {}) =>
  ({
    id,
    booking_id: "b",
    property_id: "o",
    direction: "in",
    kind: "rent_in",
    rental_component: "rent",
    rental_period: "2026-12-01",
    planned_date: "2026-12-01",
    amount: 1350000,
    company_fee: 150000,
    owner_payout_day: 5,
    status: "expected",
    paid_amount: null,
    paid_at: null,
    account: "Наличные",
    counterparty_id: null,
    created_at: "2026-10-20T12:00:00Z",
    updated_at: "2026-10-20T12:00:00Z",
    ...extra,
  }) as Payment;
const source = (payments: Payment[] = [p("rent")]): FinanceTaskSources => ({
  payments,
  bookings: [
    {
      id: "b",
      property_id: "o",
      status: "active",
      clientName: "Поздняков",
      propertyName: "ЛБ1 ТХ бассейн",
    },
  ],
  settings: [{ property_id: "o", owner_counterparty_id: "owner" }],
  settlements: [],
  parties: [{ id: "owner", name: "Малых Елена" }],
  articles: [
    { id: "rent-article", name: "Аренда", code: "rent_in" },
    { id: "owner-article", name: "Выплата собственнику", code: "owner_payout" },
  ],
  assigneeId: "admin",
});
const owner = (s: FinanceTaskSources) =>
  buildFinanceTasks(s).find((t) => t.finance.kind === "owner_payout")!;
test("one quarterly receipt and one owner task reference booking and correct articles", () => {
  const tasks = buildFinanceTasks(source());
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0]!.due_date, "2026-12-01");
  assert.equal(tasks[0]!.finance.articleName, "Аренда");
  assert.equal(tasks[0]!.finance.bookingId, "b");
  assert.equal(tasks[1]!.due_date, "2026-12-05");
  assert.equal(tasks[1]!.finance.remaining, 1200000);
  assert.equal(tasks[1]!.finance.partyName, "Малых Елена");
  assert.equal(tasks[1]!.finance.articleName, "Выплата собственнику");
  assert.equal(tasks[1]!.finance.payableNow, 0);
});
test("price and date edits update stable task IDs without independent copies", () => {
  const a = buildFinanceTasks(source());
  const b = buildFinanceTasks(
    source([p("rent", { amount: 1500000, planned_date: "2026-12-02", owner_payout_day: 10 })]),
  );
  assert.deepEqual(
    b.map((t) => t.id),
    a.map((t) => t.id),
  );
  assert.equal(b[0]!.due_date, "2026-12-02");
  assert.equal(b[1]!.due_date, "2026-12-10");
  assert.equal(b[1]!.finance.remaining, 1350000);
});
test("deleting payment or booking removes dependent tasks; cancellation removes unreceived forecasts", () => {
  assert.equal(buildFinanceTasks(source([])).length, 0);
  const s = source();
  s.bookings = [];
  assert.equal(buildFinanceTasks(s).length, 0);
  const c = source();
  c.bookings[0]!.status = "cancelled";
  assert.equal(buildFinanceTasks(c).length, 0);
});
test("manual prepaid owner obligation creates only one owner task without incoming money", () => {
  const s = source([
    p("prior", {
      direction: "out",
      kind: "owner_payout",
      rental_component: "owner_plan",
      planned_date: "2026-11-05",
      rental_period: "2026-11-01",
      amount: 400000,
      company_fee: null,
      status: "partial",
      paid_amount: 0,
      obligation_id: "ob",
      counterparty_id: "owner",
    }),
  ]);
  s.settlements = [
    {
      id: "st",
      property_id: "o",
      booking_id: "b",
      period: "2026-11-01",
      obligation_id: "ob",
      automatic: false,
    },
  ];
  const tasks = buildFinanceTasks(s);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]!.finance.kind, "owner_payout");
  assert.equal(tasks[0]!.finance.remaining, 400000);
  assert.equal(tasks[0]!.finance.payableNow, 400000);
});
test("partial receipt and physical owner plan combine with remaining forecast once", () => {
  const s = source([
    p("rent", { status: "partial", paid_amount: 450000 }),
    p("plan", {
      direction: "out",
      kind: "owner_payout",
      rental_component: "owner_plan",
      planned_date: "2026-12-05",
      amount: 400000,
      company_fee: null,
      status: "partial",
      paid_amount: 0,
      obligation_id: "ob",
      counterparty_id: "owner",
    }),
  ]);
  s.settlements = [
    {
      id: "st",
      property_id: "o",
      booking_id: "b",
      period: "2026-12-01",
      obligation_id: "ob",
      automatic: true,
    },
  ];
  assert.equal(owner(s).finance.remaining, 1200000);
  assert.equal(owner(s).finance.payableNow, 400000);
  assert.equal(
    buildFinanceTasks(s).find((t) => t.finance.kind === "receipt")!.finance.remaining,
    900000,
  );
});
test("actual remittance completes same owner task; receipt completion reads ledger status", () => {
  const s = source([
    p("rent", { status: "paid", paid_amount: 1350000, paid_at: "2026-12-01" }),
    p("actual", {
      direction: "out",
      kind: "owner_payout",
      rental_component: null,
      planned_date: "2026-12-05",
      amount: 1200000,
      company_fee: null,
      status: "paid",
      paid_amount: 1200000,
      paid_at: "2026-12-05",
      obligation_id: "ob",
      counterparty_id: "owner",
    }),
  ]);
  s.settlements = [
    {
      id: "st",
      property_id: "o",
      booking_id: "b",
      period: "2026-12-01",
      obligation_id: "ob",
      automatic: true,
    },
  ];
  const tasks = buildFinanceTasks(s);
  assert.equal(tasks.length, 2);
  assert.ok(tasks.every((t) => t.status === "done"));
  assert.equal(owner(s).id, owner(source()).id);
});
test("planned owner expense reduces forecast and does not affect company expense task amount", () => {
  const cost = p("repair", {
    booking_id: null,
    direction: "out",
    kind: "other",
    rental_component: null,
    amount: 10000,
    company_fee: null,
    planned_date: "2026-12-04",
    expense_bearer: "owner",
    expense_owner_id: "owner",
  });
  assert.equal(owner(source([p("rent"), cost])).finance.remaining, 1190000);
  assert.equal(
    owner(source([p("rent"), { ...cost, expense_bearer: "company", expense_owner_id: null }]))
      .finance.remaining,
    1200000,
  );
});
test("allocated owner cost is not deducted a second time", () => {
  const s = source([
    p("rent", { status: "paid", paid_amount: 1350000 }),
    p("plan", {
      direction: "out",
      kind: "owner_payout",
      rental_component: "owner_plan",
      planned_date: "2026-12-05",
      amount: 1190000,
      company_fee: null,
      status: "partial",
      paid_amount: 0,
      obligation_id: "ob",
      counterparty_id: "owner",
    }),
    p("repair", {
      booking_id: null,
      direction: "out",
      kind: "other",
      rental_component: null,
      amount: 10000,
      company_fee: null,
      status: "paid",
      paid_amount: 10000,
      expense_bearer: "owner",
      expense_owner_id: "owner",
    }),
  ]);
  s.settlements = [
    {
      id: "st",
      property_id: "o",
      booking_id: "b",
      period: "2026-12-01",
      obligation_id: "ob",
      automatic: true,
      expense_amount: 10000,
    },
  ];
  assert.equal(owner(s).finance.remaining, 1190000);
});
test("historic expected receipts do not create old backlog but edited overdue items remain visible", () => {
  const old = p("old", {
    planned_date: "2026-10-01",
    rental_period: "2026-10-01",
    created_at: "2026-10-01",
    updated_at: "2026-10-01",
  });
  assert.equal(buildFinanceTasks(source([old])).length, 0);
  assert.ok(buildFinanceTasks(source([{ ...old, updated_at: "2026-10-22" }])).length > 0);
});

test("moving receipt expectation retains contract date, amount and following month", () => {
  const tasks = buildFinanceTasks(
    source([
      p("rent", { task_expected_date: "2026-12-09", status: "partial", paid_amount: 350000 }),
      p("next", { rental_period: "2027-01-01", planned_date: "2027-01-01" }),
    ]),
  );
  const receipt = tasks.find((t) => t.id === "finance:receipt:rent")!;
  assert.equal(receipt.due_date, "2026-12-09");
  assert.equal(receipt.finance.contractDate, "2026-12-01");
  assert.equal(receipt.finance.remaining, 1000000);
  assert.equal(tasks.find((t) => t.id === "finance:receipt:next")!.due_date, "2027-01-01");
});
test("owner expectation overrides only matching booking/period, preserving contractual payout", () => {
  const tasks = buildFinanceTasks(
    source([
      p("rent", { owner_task_expected_date: "2026-12-14" }),
      p("next", { rental_period: "2027-01-01", planned_date: "2027-01-01" }),
    ]),
  );
  const current = tasks.find(
    (t) => t.finance.kind === "owner_payout" && t.finance.period === "2026-12-01",
  )!;
  assert.equal(current.due_date, "2026-12-14");
  assert.equal(current.finance.contractDate, "2026-12-05");
  assert.equal(
    tasks.find((t) => t.finance.kind === "owner_payout" && t.finance.period === "2027-01-01")!
      .due_date,
    "2027-01-05",
  );
});

test("standalone future income and expenses produce one task each without booking", () => {
  const tasks = buildFinanceTasks(
    source([
      p("service", {
        booking_id: null,
        rental_component: null,
        direction: "in",
        kind: "other",
        amount: 12000,
        company_fee: null,
        planned_date: "2099-01-07",
        requires_confirmation: true,
      }),
      p("ads", {
        booking_id: null,
        property_id: null,
        rental_component: null,
        direction: "out",
        kind: "agency_cost",
        amount: 4000,
        company_fee: null,
        planned_date: "2099-01-08",
        requires_confirmation: true,
      }),
    ]),
  );
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0]!.id, "finance:payment:service");
  assert.equal(tasks[0]!.finance.bookingId, null);
  assert.equal(tasks[0]!.finance.direction, "in");
  assert.equal(tasks[1]!.finance.direction, "out");
  assert.equal(tasks[1]!.property_id, null);
  assert.match(tasks[1]!.title, /^Оплатить/);
});
test("part-paid ordinary expense persists overdue and keeps actual history, paid legacy facts stay out", () => {
  const tasks = buildFinanceTasks(
    source([
      p("partial-cost", {
        booking_id: null,
        rental_component: null,
        direction: "out",
        kind: "other",
        amount: 10000,
        paid_amount: 4000,
        status: "partial",
        planned_date: "2020-01-01",
        task_expected_date: "2099-02-01",
        requires_confirmation: true,
      }),
      p("old-auto", {
        booking_id: null,
        rental_component: null,
        planned_date: "2020-01-01",
        status: "expected",
      }),
      p("already-paid", {
        booking_id: null,
        rental_component: null,
        planned_date: "2099-01-01",
        status: "paid",
      }),
    ]),
  );
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]!.finance.remaining, 6000);
  assert.equal(tasks[0]!.due_date, "2099-02-01");
  assert.equal(tasks[0]!.finance.contractDate, "2020-01-01");
});
test("standalone dated owner obligation is one grouped task; undated balance is excluded", () => {
  const rows = [
    p("owner-plan", {
      booking_id: null,
      direction: "out",
      kind: "owner_payout",
      rental_component: "owner_plan",
      obligation_id: "ob",
      amount: 7000,
      status: "partial",
      paid_amount: 0,
    }),
    p("owner-paid", {
      booking_id: null,
      direction: "out",
      kind: "owner_payout",
      rental_component: null,
      obligation_id: "ob",
      amount: 3000,
      status: "paid",
      paid_amount: 3000,
    }),
  ];
  const tasks = buildFinanceTasks(source(rows));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]!.id, "finance:obligation:ob");
  assert.equal(tasks[0]!.finance.remaining, 7000);
  assert.equal(tasks[0]!.finance.amount, 10000);
  assert.equal(tasks[0]!.finance.bookingId, null);
  assert.equal(
    buildFinanceTasks(source([{ ...rows[0]!, owner_payout_on_request: true }, rows[1]!])).length,
    0,
  );
});
test("booking receipts and owner payouts never gain duplicate generic tasks", () => {
  const tasks = buildFinanceTasks(source());
  assert.equal(tasks.length, 2);
  assert.ok(tasks.every((t) => t.finance.kind !== "payment"));
});
test("cancelled booking payments stay excluded from generic tasks", () => {
  const s = source([
    p("cancelled-service", {
      booking_id: "cancelled",
      rental_component: null,
      planned_date: "2099-01-01",
      requires_confirmation: true,
    }),
  ]);
  s.cancelledBookingIds = ["cancelled"];
  assert.equal(buildFinanceTasks(s).length, 0);
});
