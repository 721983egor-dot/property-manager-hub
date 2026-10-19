import assert from "node:assert/strict";
import { test } from "node:test";
import { rentalPeriodPrice, type RentalPriceTerms } from "./rental-period-price.ts";
const terms: RentalPriceTerms = {
  start_date: "2026-10-22",
  end_date: "2027-06-22",
  payment_day: 21,
  price_type: "periodic",
  price_month: null,
  booking_price_periods: [
    { start_date: "2026-10-22", end_date: "2027-05-31", price_month: 140000 },
    { start_date: "2027-06-01", end_date: "2027-06-22", price_month: 250000 },
  ],
};
test("May-June full rental month splits ten winter and twenty-one summer days", () => {
  const p = rentalPeriodPrice(terms, "2027-05");
  assert.equal(p.amount, 214516.13);
  assert.equal(p.cycleDays, 31);
  assert.deepEqual(
    p.parts.map((p) => [p.days, p.monthlyRate, p.amount]),
    [
      [10, 140000, 45161.29],
      [21, 250000, 169354.84],
    ],
  );
});
test("arrival day defines period, payment deadline does not shift it", () => {
  const p = rentalPeriodPrice({ ...terms, start_date: "2026-10-19" }, "2027-05");
  assert.equal(p.from, "2027-05-19");
  assert.equal(p.to, "2027-06-19");
  assert.equal(p.due, "2027-05-21");
  assert.equal(p.amount, 203870.97);
});
test("Olga final winter period is only three of thirty-one days", () => {
  const p = rentalPeriodPrice(
    {
      ...terms,
      start_date: "2026-10-19",
      end_date: "2027-05-22",
      price_type: "fixed",
      price_month: 140000,
    },
    "2027-05",
  );
  assert.equal(p.amount, 13548.39);
  assert.equal(p.occupiedDays, 3);
  assert.equal(p.due, "2027-05-21");
});
test("constant monthly price remains constant across calendar month boundaries", () => {
  for (const month of ["2026-10", "2026-11", "2027-02", "2027-03"]) {
    assert.equal(
      rentalPeriodPrice({ ...terms, price_type: "fixed", price_month: 140000 }, month).amount,
      140000,
    );
  }
});
test("31-day arrival anchor clamps February and returns to 31 in March", () => {
  const b = { ...terms, start_date: "2026-10-31", price_type: "fixed", price_month: 140000 };
  const p = rentalPeriodPrice(b, "2027-02");
  assert.equal(p.from, "2027-02-28");
  assert.equal(p.cycleEnd, "2027-03-31");
  assert.equal(p.amount, 140000);
});
test("each occupied day needs exactly one price; checkout needs no price", () => {
  const gap = {
    ...terms,
    booking_price_periods: [
      { ...terms.booking_price_periods[0]!, end_date: "2027-05-30" },
      terms.booking_price_periods[1]!,
    ],
  };
  assert.match(rentalPeriodPrice(gap, "2027-05").problem!, /2027-05-31/);
  const overlap = {
    ...terms,
    booking_price_periods: [...terms.booking_price_periods, terms.booking_price_periods[0]!],
  };
  assert.equal(rentalPeriodPrice(overlap, "2027-05").amount, null);
  assert.equal(rentalPeriodPrice(terms, "2027-06").amount, null);
});
