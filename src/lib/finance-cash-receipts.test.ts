import test from "node:test";
import assert from "node:assert/strict";
import { expandPaymentReceipts } from "./finance-cash-receipts.ts";
import { paymentFactAmount } from "./finance-payment-status.ts";
import { companyPayments } from "./finance-company-model.ts";
import { buildFinanceCalendar } from "./finance-calendar-model.ts";
import type { Payment } from "./finance.ts";
const payment = {
  id: "rent",
  amount: 150000,
  company_fee: 15000,
  rental_component: "rent",
  rental_period: "2026-10-01",
  booking_id: "b",
  property_id: "o",
  direction: "in",
  kind: "rent_in",
  account: "Карта",
  status: "partial",
  planned_date: "2026-10-07",
  task_expected_date: "2026-10-28",
  paid_amount: 90000,
  paid_at: "2026-10-21",
  requires_confirmation: true,
  cash_receipts: [
    { id: "a", amount: 60000, total: 60000, date: "2026-10-20", account: "Карта" },
    { id: "b", amount: 30000, total: 90000, date: "2026-10-21", account: "Наличные" },
  ],
} as Payment;
test("different receipts keep own date/account, only remainder moves, fee/turnover never doubles", () => {
  const rows = expandPaymentReceipts(payment);
  assert.deepEqual(
    rows.map((p) => [p.amount, p.account, p.planned_date]),
    [
      [60000, "Карта", "2026-10-20"],
      [30000, "Наличные", "2026-10-21"],
      [60000, "Карта", "2026-10-28"],
    ],
  );
  assert.equal(
    rows.reduce((s, p) => s + p.amount, 0),
    150000,
  );
  assert.equal(
    rows.reduce((s, p) => s + (p.company_fee ?? 0), 0),
    15000,
  );
  assert.equal(
    rows.reduce((s, p) => s + paymentFactAmount(p, "2026-11-01"), 0),
    90000,
    "overdue remainder never becomes fake cash",
  );
  assert.equal(
    companyPayments(rows).reduce((s, p) => s + paymentFactAmount(p, "2026-11-01"), 0),
    9000,
  );
  const calendar = buildFinanceCalendar(rows, 2026, 9, "2026-10-21");
  assert.equal(calendar.ledger.find((d) => d.date === "2026-10-20")?.payments[0]?.account, "Карта");
  assert.equal(
    calendar.ledger.find((d) => d.date === "2026-10-21")?.payments[0]?.account,
    "Наличные",
  );
});
test("final installment clears remainder and rounding keeps exact total commission", () => {
  const rows = expandPaymentReceipts({
    ...payment,
    status: "paid",
    paid_amount: 150000,
    cash_receipts: [
      ...payment.cash_receipts!,
      { id: "c", amount: 60000, total: 150000, date: "2026-10-22", account: "Наличные" },
    ],
  });
  assert.equal(rows.length, 3);
  assert.ok(rows.every((p) => p.status === "paid"));
  assert.equal(
    rows.reduce((s, p) => s + (p.company_fee ?? 0), 0),
    15000,
  );
  assert.equal(
    rows.filter((p) => p.account === "Наличные").reduce((s, p) => s + p.amount, 0),
    90000,
  );
});
test("unreceived managed rental charge does not become cash automatically at due date", () => {
  assert.equal(
    paymentFactAmount({ ...payment, status: "expected", paid_amount: null }, "2026-12-01"),
    0,
  );
});
