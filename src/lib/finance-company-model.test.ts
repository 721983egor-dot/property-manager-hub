import test from "node:test";
import assert from "node:assert/strict";
import { bankPayments, companyPayments, companySummary } from "./finance-company-model.ts";
import { effectivePaymentStatus, paymentFactAmount } from "./finance-payment-status.ts";
import { ownerSettlementState } from "./finance-owner-model.ts";
import type { Payment } from "./finance.ts";
import type { FinanceObligation } from "./finance-counterparties.ts";
const p = (id: string, amount: number, extra: Partial<Payment> = {}) =>
  ({
    id,
    amount,
    planned_date: "2026-10-01",
    status: "paid",
    paid_amount: null,
    paid_at: null,
    direction: "in",
    kind: "other",
    booking_id: "b",
    property_id: "o",
    client_id: "c",
    rental_period: "2026-10-01",
    ...extra,
  }) as Payment;
const rows = [
  p("rent", 100000, { kind: "rent_in", rental_component: "rent", company_fee: 10000 }),
  p("ku", 2500, { rental_component: "utilities", company_fee: 0 }),
  p("ad", 3000, { kind: "agency_cost", direction: "out" }),
];
test("gross receipts, owner funds and company money remain separate", () => {
  assert.deepEqual(companySummary(rows, "2026-10-01", "2026-10-31", "2026-10-16"), {
    income: 10000,
    expense: 3000,
    profit: 7000,
    bank: 99500,
    ownerReserve: 92500,
    deposits: 0,
    available: 7000,
    unallocated: 0,
  });
});
test("monthly CRM commission already included in gross rent is counted once; upfront stays", () => {
  const withFees = [
    ...rows,
    p("legacy", 10000, { management_period: "2026-10-01", crm_charge: "month:2026-10" }),
    p("upfront", 5000, { crm_charge: "one_time" }),
  ];
  assert.equal(bankPayments(withFees).length, 4);
  assert.equal(companySummary(withFees, "2026-10-01", "2026-10-31", "2026-10-16").income, 15000);
});
test("partial rent prorates fee and reserves unpaid owner money", () => {
  const s = companySummary(
    [
      p("rent", 100000, {
        kind: "rent_in",
        rental_component: "rent",
        company_fee: 10000,
        status: "partial",
        paid_amount: 40000,
      }),
    ],
    "2026-10-01",
    "2026-10-31",
    "2026-10-16",
  );
  assert.equal(s.income, 4000);
  assert.equal(s.bank, 40000);
  assert.equal(s.ownerReserve, 36000);
  assert.equal(s.available, 4000);
});
test("past-dated pending owner payout never becomes fact or clears debt", () => {
  const pending = p("owner", 92500, {
    kind: "owner_payout",
    direction: "out",
    status: "expected",
    planned_date: "2026-10-10",
    rental_component: "owner_plan",
    obligation_id: "ob",
  });
  assert.equal(effectivePaymentStatus(pending, "2026-10-16"), "overdue");
  assert.equal(paymentFactAmount(pending, "2026-10-16"), 0);
  assert.equal(
    ownerSettlementState(
      {
        id: "ob",
        amount: 92500,
        status: "open",
        direction: "payable",
        planned_date: "2026-10-10",
      } as FinanceObligation,
      [pending],
      "2026-10-16",
    ).remaining,
    92500,
  );
  assert.equal(
    companySummary([...rows, pending], "2026-10-01", "2026-10-31", "2026-10-16").bank,
    99500,
  );
});
test("confirmed owner transfer reduces bank and reserve, never company profit", () => {
  const s = companySummary(
    [...rows, p("owner", 40000, { kind: "owner_payout", direction: "out" })],
    "2026-10-01",
    "2026-10-31",
    "2026-10-16",
  );
  assert.equal(s.bank, 59500);
  assert.equal(s.ownerReserve, 52500);
  assert.equal(s.available, 7000);
  assert.equal(s.profit, 7000);
});
test("deposits are reserved, and unlinked rent never appears as company income", () => {
  const s = companySummary(
    [p("deposit", 50000, { kind: "deposit_in" }), p("old", 100000, { kind: "rent_in" })],
    "2026-10-01",
    "2026-10-31",
    "2026-10-16",
  );
  assert.equal(s.deposits, 50000);
  assert.equal(s.ownerReserve, 100000);
  assert.equal(s.income, 0);
  assert.equal(s.available, 0);
  assert.equal(s.unallocated, 1);
  assert.equal(
    companyPayments([
      p("future", 100000, {
        kind: "rent_in",
        rental_component: "rent",
        company_fee: 10000,
        status: "expected",
        planned_date: "2026-11-01",
      }),
    ])[0]?.amount,
    10000,
  );
});

test("future owner forecast reserves next month's payout without turning it into fact", async () => {
  const { ownerForecastPayments } = await import("./finance-company-model.ts");
  const future = p("future", 100000, {
    status: "expected",
    planned_date: "2026-11-01",
    rental_period: "2026-11-01",
    rental_component: "rent",
    company_fee: 10000,
    kind: "rent_in",
  });
  const forecasts = ownerForecastPayments(
    [future],
    [{ property_id: "o", owner_counterparty_id: "owner", payout_day: 10 }],
    [],
  );
  assert.equal(forecasts[0]?.amount, 90000);
  assert.equal(forecasts[0]?.planned_date, "2026-11-10");
  assert.equal(paymentFactAmount(forecasts[0]!, "2026-11-20"), 0);
});
test("partial rent forecast adds only the unpaid portion, not a second full owner payout", async () => {
  const { ownerForecastPayments } = await import("./finance-company-model.ts");
  const rent = p("rent", 100000, {
    status: "partial",
    paid_amount: 40000,
    rental_component: "rent",
    company_fee: 10000,
    kind: "rent_in",
  });
  const pending = p("plan", 36000, {
    status: "expected",
    kind: "owner_payout",
    rental_component: "owner_plan",
    direction: "out",
    obligation_id: "ob",
  });
  const forecasts = ownerForecastPayments(
    [rent, pending],
    [{ property_id: "o", owner_counterparty_id: "owner", payout_day: 10 }],
    [{ property_id: "o", period: "2026-10-01", obligation_id: "ob", automatic: true }],
  );
  assert.equal(forecasts[0]?.amount, 54000);
});

test("compatibility owner plan with zero actual amount is planned/overdue, not partially paid", () => {
  const pending = p("owner", 92500, {
    kind: "owner_payout",
    direction: "out",
    rental_component: "owner_plan",
    status: "partial",
    paid_amount: 0,
    planned_date: "2026-10-10",
  });
  assert.equal(effectivePaymentStatus(pending, "2026-10-01"), "expected");
  assert.equal(effectivePaymentStatus(pending, "2026-10-16"), "overdue");
  assert.equal(paymentFactAmount(pending, "2026-10-16"), 0);
});

test("owner rental income excludes KU, company costs and transfers, and scopes by object and rental period", async () => {
  const { ownerRentalIncome } = await import("./finance-company-model.ts");
  const payments = [
    ...rows,
    p("other-object", 500000, {
      property_id: "other",
      rental_component: "rent",
      company_fee: 50000,
    }),
    p("next-period", 200000, {
      rental_period: "2026-11-01",
      rental_component: "rent",
      company_fee: 20000,
    }),
    p("owner", 40000, { direction: "out", kind: "owner_payout" }),
    p("deposit", 50000, { kind: "deposit_in" }),
  ];
  assert.deepEqual(ownerRentalIncome(payments, "2026-10", "o", "2026-10-17"), {
    rent: 100000,
    commission: 10000,
    netRent: 90000,
    utilities: 2500,
    total: 92500,
    unallocatedRent: 0,
  });
  assert.equal(ownerRentalIncome(payments, "2026-10", undefined, "2026-10-17").netRent, 540000);
});

test("owner income uses received part only and never guesses an unknown fee", async () => {
  const { ownerRentalIncome } = await import("./finance-company-model.ts");
  const payments = [
    p("partial", 100000, {
      rental_component: "rent",
      company_fee: 10000,
      status: "partial",
      paid_amount: 40000,
    }),
    p("unknown", 50000, { rental_component: "rent", company_fee: null }),
    p("legacy", 30000, { kind: "rent_in" }),
    p("zero", 0, { rental_component: "rent", company_fee: 0 }),
    p("future", 100000, {
      rental_component: "rent",
      company_fee: 10000,
      status: "expected",
      planned_date: "2026-10-25",
    }),
  ];
  assert.deepEqual(ownerRentalIncome(payments, "2026-10", "o", "2026-10-17"), {
    rent: 40000,
    commission: 4000,
    netRent: 36000,
    utilities: 0,
    total: 36000,
    unallocatedRent: 80000,
  });
});
