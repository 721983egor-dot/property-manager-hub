import { test } from "node:test";
import assert from "node:assert/strict";
import { financeAccountBalances } from "./finance-account-balances.ts";
import { effectivePaymentStatus } from "./finance-payment-status.ts";
import { confirmationSource } from "./finance-confirmation.ts";
import type { Payment } from "./finance.ts";
const p = (patch: Partial<Payment> = {}): Payment =>
  ({
    id: "rent",
    planned_date: "2026-10-21",
    amount: 100000,
    direction: "in",
    status: "expected",
    kind: "rent_in",
    paid_amount: null,
    paid_at: null,
    account: "Карта",
    requires_confirmation: true,
    ...patch,
  }) as Payment;
const accounts = [
  { id: "card", name: "Карта", type: "card" as const, archived: false },
  { id: "cash", name: "Наличные", type: "cash" as const, archived: false },
];
test("actual balances use each receipt account, exclude unpaid/future/owner plans and subtract actual expenses", () => {
  const rows = [
    p({
      status: "partial",
      paid_amount: 15000,
      cash_receipts: [
        { id: "a", date: "2026-10-20", account: "Карта", amount: 10000, total: 10000 },
        { id: "b", date: "2026-10-21", account: "Наличные", amount: 5000, total: 15000 },
      ],
    }),
    p({
      id: "expense",
      direction: "out",
      kind: "agency_cost",
      amount: 2000,
      status: "paid",
      paid_amount: 2000,
    }),
    p({ id: "future", status: "paid", paid_amount: 100000, paid_at: "2026-10-22" }),
    p({
      id: "owner",
      direction: "out",
      rental_component: "owner_plan",
      status: "partial",
      paid_amount: 0,
    }),
  ];
  assert.deepEqual(
    financeAccountBalances(accounts, rows, "2026-10-21").accounts.map((a) => [a.name, a.balance]),
    [
      ["Карта", 8000],
      ["Наличные", 5000],
    ],
  );
  assert.equal(financeAccountBalances(accounts, rows, "2026-10-21").total, 13000);
});
test("legacy monthly commission is not a second bank receipt; dormant accounts stay visible at zero", () => {
  const rows = [
    p({
      status: "paid",
      paid_amount: 100000,
      rental_component: "rent",
      booking_id: "b",
      rental_period: "2026-10-01",
    }),
    p({
      id: "legacy",
      status: "paid",
      amount: 10000,
      paid_amount: 10000,
      booking_id: "b",
      management_period: "2026-10-01",
    }),
  ];
  assert.equal(financeAccountBalances(accounts, rows, "2026-10-21").total, 100000);
  assert.equal(financeAccountBalances(accounts, rows, "2026-10-21").accounts[1]?.balance, 0);
});
test("reversal stays unpaid after its due date, without changing an existing partial payment", () => {
  assert.equal(
    effectivePaymentStatus(p({ status: "partial", paid_amount: 0 }), "2026-10-25"),
    "overdue",
  );
  assert.equal(
    effectivePaymentStatus(p({ status: "partial", paid_amount: 5000 }), "2026-10-25"),
    "partial",
  );
  assert.deepEqual(
    confirmationSource({ id: "company:cash:receipt-id", cash_parent_id: "source-id" }),
    { paymentId: "source-id", receiptId: "receipt-id" },
  );
});
