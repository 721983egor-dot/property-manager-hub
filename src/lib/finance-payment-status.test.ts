import assert from "node:assert/strict";
import { test } from "node:test";
import {
  effectivePaymentStatus,
  financeToday,
  paymentFactAmount,
} from "./finance-payment-status.ts";

const today = "2026-10-16";
test("plans become conducted on their date, including old overdue records", () => {
  for (const status of ["expected", "overdue"]) {
    assert.equal(effectivePaymentStatus({ status, planned_date: "2026-10-15" }, today), "paid");
    assert.equal(effectivePaymentStatus({ status, planned_date: today }, today), "paid");
    assert.equal(effectivePaymentStatus({ status, planned_date: "2026-10-17" }, today), "expected");
  }
});
test("manual check conducts a future payment; partial payment preserves the actual sum", () => {
  const future = {
    status: "expected",
    planned_date: "2026-10-17",
    amount: 12000,
    paid_amount: null,
  };
  assert.equal(paymentFactAmount(future, today), 0);
  assert.equal(effectivePaymentStatus({ ...future, status: "paid" }, today), "paid");
  assert.equal(paymentFactAmount({ ...future, status: "paid" }, today), 12000);
  const partial = { ...future, status: "partial", planned_date: "2026-10-15", paid_amount: 3000 };
  assert.equal(effectivePaymentStatus(partial, today), "partial");
  assert.equal(paymentFactAmount(partial, today), 3000);
});
test("automatic fact uses the entire planned sum once and updates at the date boundary", () => {
  const payment = { status: "expected", planned_date: today, amount: 12000, paid_amount: 1000 };
  assert.equal(paymentFactAmount(payment, "2026-10-15"), 0);
  assert.equal(paymentFactAmount(payment, today), 12000);
  assert.equal(paymentFactAmount(payment, "2026-10-17"), 12000);
});
test("Moscow financial day changes at 21:00 UTC, across month and year boundaries", () => {
  assert.equal(financeToday(new Date("2026-10-15T20:59:59Z")), "2026-10-15");
  assert.equal(financeToday(new Date("2026-10-15T21:00:00Z")), "2026-10-16");
  assert.equal(financeToday(new Date("2026-12-31T21:00:00Z")), "2027-01-01");
});
