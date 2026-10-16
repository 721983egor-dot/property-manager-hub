import { test } from "node:test";
import assert from "node:assert/strict";
import { commissionTotals, validateSeasons } from "./crm-commission-model.ts";
const payment = {
  id: "1",
  deal_id: "d",
  planned_date: "2027-06-20",
  amount: 20000,
  status: "partial",
  paid_at: "2027-07-02",
  paid_amount: 5000,
  rental_turnover: 200000,
  crm_charge: "month:2027-06",
};
test("income uses commission, turnover separate; planned and received use their own dates", () => {
  assert.deepEqual(commissionTotals([payment], "2027-06-01", "2027-06-30"), {
    planned: 20000,
    received: 0,
    outstanding: 15000,
    turnover: 200000,
  });
  assert.deepEqual(commissionTotals([payment], "2027-07-01", "2027-07-31"), {
    planned: 0,
    received: 5000,
    outstanding: 0,
    turnover: 0,
  });
});
test("paid legacy rows without paid_amount use total; one-time fee never increases rental turnover", () => {
  const upfront = {
    ...payment,
    crm_charge: "one_time",
    rental_turnover: null,
    status: "paid",
    paid_amount: null,
  };
  assert.deepEqual(commissionTotals([upfront], "", ""), {
    planned: 20000,
    received: 20000,
    outstanding: 0,
    turnover: 0,
  });
});
test("season prices must be positive, within rental, and nonoverlapping", () => {
  const season = { start_date: "2027-06-01", end_date: "2027-08-31", price_month: 200000 };
  validateSeasons([season], "2027-01-01", "2028-01-01");
  assert.throws(
    () => validateSeasons([season, season], "2027-01-01", "2028-01-01"),
    /пересекаются/,
  );
  assert.throws(() => validateSeasons([{ ...season, price_month: 0 }], "2027-01-01", "2028-01-01"));
  assert.throws(() => validateSeasons([season], "2027-07-01", "2028-01-01"));
});
