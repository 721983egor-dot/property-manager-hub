import test from "node:test";
import assert from "node:assert/strict";
import { ownerSettlementState } from "./finance-owner-model.ts";
import type { FinanceObligation } from "./finance-counterparties.ts";
import type { Payment } from "./finance.ts";
const obligation = {
  id: "o",
  amount: 88000,
  direction: "payable",
  planned_date: "2026-10-05",
  status: "open",
} as FinanceObligation;
const payment = (amount: number, overrides: Partial<Payment> = {}) =>
  ({
    id: "p",
    amount,
    paid_amount: amount,
    direction: "out",
    status: "paid",
    obligation_id: "o",
    ...overrides,
  }) as Payment;
test("owner debt is due until payout, overdue only after payout date", () => {
  assert.equal(ownerSettlementState(obligation, [], "2026-10-05").label, "К выплате");
  const state = ownerSettlementState(obligation, [], "2026-10-06");
  assert.equal(state.label, "Просрочено");
  assert.equal(state.remaining, 88000);
});
test("only actual linked outgoing payouts reduce owner debt", () => {
  const state = ownerSettlementState(
    obligation,
    [
      payment(40000),
      payment(48000, { status: "expected" }),
      payment(12000, { direction: "in" }),
      payment(1000, { obligation_id: "another" }),
    ],
    "2026-10-06",
  );
  assert.equal(state.paid, 40000);
  assert.equal(state.remaining, 48000);
  assert.equal(state.label, "Просрочено");
});
test("partial then full payout clears debt without manually closing obligation", () => {
  assert.equal(
    ownerSettlementState(obligation, [payment(40000)], "2026-10-01").label,
    "Частично выплачено",
  );
  assert.equal(
    ownerSettlementState(obligation, [payment(40000), payment(48000)], "2026-10-10").label,
    "Выплачено",
  );
});
test("deleting or correcting a payout exposes outstanding debt again", () => {
  const state = ownerSettlementState(
    obligation,
    [payment(88000, { status: "partial", paid_amount: 10000 })],
    "2026-10-10",
  );
  assert.equal(state.remaining, 78000);
  assert.equal(state.overdue, true);
  assert.equal(
    ownerSettlementState({ ...obligation, status: "closed" }, [], "2026-10-10").label,
    "Закрыт вручную",
  );
});
