import assert from "node:assert/strict";
import { test } from "node:test";
import { obligationCash, summarizeCounterparty } from "./finance-counterparty-model.ts";
import type { Payment } from "./finance.ts";
import type { FinanceObligation } from "./finance-counterparties.ts";
const obligation = (overrides: Partial<FinanceObligation> = {}): FinanceObligation => ({
  id: "debt",
  counterparty_id: "party",
  amount: 100000,
  direction: "payable",
  planned_date: "2026-08-24",
  description: "Депозит",
  legal_entity: "",
  status: "open",
  property_id: null,
  property: null,
  created_at: "",
  ...overrides,
});
const payment = (overrides: Partial<Payment> = {}): Payment =>
  ({
    id: "payment",
    amount: 100000,
    direction: "in",
    status: "paid",
    paid_amount: null,
    obligation_id: "debt",
    planned_date: "2026-08-24",
    property_id: null,
    ...overrides,
  }) as Payment;
test("deposit receipt creates payable debt; only return reduces it", () => {
  const receipt = payment();
  const refund = payment({ id: "refund", direction: "out", amount: 40000 });
  assert.equal(obligationCash(obligation(), [receipt]).remaining, 100000);
  assert.equal(obligationCash(obligation(), [receipt, refund]).remaining, 60000);
  const overview = summarizeCounterparty([receipt, refund], [obligation()]);
  assert.equal(overview.theyOweUs, -60000);
  assert.equal(overview.transferredToUs, 100000);
  assert.equal(overview.weTransferred, 40000);
  assert.equal(overview.cashSaldo, 60000);
});
test("partial settlement uses paid amount; expected and unrelated payments do not settle", () => {
  const items = [
    payment({ direction: "out", status: "partial", paid_amount: 15000 }),
    payment({ direction: "out", status: "partial", paid_amount: null }),
    payment({ direction: "out", status: "expected" }),
    payment({ direction: "out", obligation_id: "other" }),
  ];
  assert.equal(obligationCash(obligation(), items).remaining, 85000);
  assert.equal(summarizeCounterparty(items, [obligation()]).weTransferred, 115000);
});
test("receivable settlement and closed obligations", () => {
  const receivable = obligation({ direction: "receivable" });
  assert.equal(summarizeCounterparty([payment({ amount: 25000 })], [receivable]).theyOweUs, 75000);
  assert.equal(summarizeCounterparty([], [obligation({ status: "closed" })]).theyOweUs, 0);
  assert.equal(obligationCash(receivable, [payment({ amount: 150000 })]).remaining, 0);
});
test("period filters do not hide repayments when computing outstanding debt", () => {
  assert.equal(
    summarizeCounterparty([], [obligation()], [payment({ direction: "out", amount: 100000 })])
      .theyOweUs,
    0,
  );
});
