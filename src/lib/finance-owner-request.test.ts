import test from "node:test";
import assert from "node:assert/strict";
import {
  companySummary,
  ownerCashPayments,
  ownerForecastPayments,
} from "./finance-company-model.ts";
import { ownerSettlementState } from "./finance-owner-model.ts";
import { buildFinanceTasks, type FinanceTaskSources } from "./finance-tasks-model.ts";
import {
  bookingFinancialTermsProblem,
  previewBookingCollections,
} from "./booking-finance-terms.ts";
import type { Payment } from "./finance.ts";
import type { FinanceObligation } from "./finance-counterparties.ts";
const receipt = {
  id: "r",
  property_id: "p",
  booking_id: "b",
  client_id: "c",
  direction: "in",
  kind: "rent_in",
  rental_component: "rent",
  amount: 140000,
  company_fee: 14000,
  status: "paid",
  paid_amount: 140000,
  paid_at: "2026-10-21",
  planned_date: "2026-10-08",
  rental_period: "2026-10-01",
  owner_payout_day: null,
  owner_payout_on_request: true,
  account: "Касса",
  created_at: "2026-10-21",
  updated_at: "2026-10-21",
} as Payment;
const hold = {
  ...receipt,
  id: "h",
  direction: "out",
  kind: "owner_payout",
  rental_component: "owner_plan",
  amount: 126000,
  company_fee: null,
  status: "partial",
  paid_amount: 0,
  paid_at: null,
  counterparty_id: "owner",
  obligation_id: "o",
  planned_date: "2026-10-01",
} as Payment;
const obligation = {
  id: "o",
  property_id: "p",
  counterparty_id: "owner",
  amount: 126000,
  direction: "payable",
  status: "open",
  planned_date: "2026-10-01",
  on_request: true,
} as FinanceObligation;
const settings = [{ property_id: "p", owner_counterparty_id: "owner", payout_day: 5 }];
test("retained owner funds remain reserved and do not become company income", () => {
  const s = companySummary([receipt, hold], "2026-10-01", "2026-10-31", "2026-10-21");
  assert.equal(s.income, 14000);
  assert.equal(s.profit, 14000);
  assert.equal(s.bank, 140000);
  assert.equal(s.ownerReserve, 126000);
  assert.equal(s.available, 14000);
  assert.equal(
    ownerForecastPayments([receipt, hold], settings, []).length,
    0,
    "legacy object day does not invent a date",
  );
  assert.deepEqual(
    ownerCashPayments([receipt, hold], settings, []).map((p) => p.id),
    ["r"],
  );
});
test("retained funds have no overdue state; partial issuance preserves the remaining balance", () => {
  const state = ownerSettlementState(obligation, [hold], "2028-01-01");
  assert.equal(state.overdue, false);
  assert.equal(state.label, "Хранится у нас · по запросу");
  assert.equal(state.remaining, 126000);
  const payout = {
    ...hold,
    id: "issued",
    rental_component: null,
    status: "paid",
    paid_amount: 30000,
    amount: 30000,
    paid_at: "2026-10-21",
    owner_payout_on_request: false,
  } as Payment;
  assert.equal(ownerSettlementState(obligation, [hold, payout], "2028-01-01").remaining, 96000);
  const summary = companySummary([receipt, hold, payout], "2026-10-01", "2026-10-31", "2026-10-21");
  assert.equal(summary.bank, 110000);
  assert.equal(summary.ownerReserve, 96000);
  assert.equal(summary.available, 14000);
});
test("no open payment task is created for an undated owner hold", () => {
  const sources: FinanceTaskSources = {
    payments: [receipt, hold],
    bookings: [
      { id: "b", property_id: "p", status: "active", clientName: "Клиент", propertyName: "Объект" },
    ],
    settings,
    settlements: [
      {
        id: "s",
        property_id: "p",
        booking_id: "b",
        period: "2026-10-01",
        obligation_id: "o",
        automatic: true,
      },
    ],
    parties: [{ id: "owner", name: "Собственник" }],
    articles: [],
    assigneeId: null,
  };
  assert.equal(
    buildFinanceTasks(sources).filter(
      (t) => t.finance.kind === "owner_payout" && t.status === "open",
    ).length,
    0,
  );
});
test("blank special owner amount cannot silently replace a 10 percent commission", () => {
  const terms = {
    start_date: "2026-11-01",
    end_date: "2026-12-01",
    price_type: "fixed",
    price_month: 140000,
    payment_day: 8,
    booking_price_periods: [],
  };
  const f = {
    receipts_from: "2026-11-08",
    collection_interval: 1,
    owner_rates: [],
    collection_plan: null,
    prepaid_owner_payouts: [],
  };
  assert.equal(previewBookingCollections(terms, f, 10, "percent")[0]?.company_fee, 14000);
  assert.ok(
    bookingFinancialTermsProblem(
      { ...f, owner_rates: [{ from: terms.start_date, to: terms.end_date, owner_monthly: NaN }] },
      terms,
    ),
  );
});
