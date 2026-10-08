import assert from "node:assert/strict";
import test from "node:test";
import { rentalMonthPlan, rentalForProperty, type FinanceRental } from "./finance-rental-model.ts";
const booking: FinanceRental = {
  id: "vip",
  property_id: "p",
  start_date: "2026-05-07",
  end_date: "2027-05-07",
  price_type: "fixed",
  price_month: 150000,
  payment_day: 7,
  status: "active",
  stay_kind: "long_term",
  booking_price_periods: [],
};
test("VIP23 uses contract rent, splits company and owner, excludes end-date payment", () => {
  assert.deepEqual(rentalMonthPlan(booking, "2026-10", 10), {
    due: "2026-10-07",
    scheduled: true,
    rent: 150000,
    fee: 15000,
    ownerBeforeExpenses: 135000,
  });
  assert.equal(rentalMonthPlan(booking, "2027-05", 10).scheduled, false);
  assert.equal(
    rentalMonthPlan({ ...booking, status: "cancelled" }, "2026-10", 10).scheduled,
    false,
  );
});
test("31st clamps to February; periodic prices require exactly one matching period", () => {
  const periodic = {
    ...booking,
    payment_day: 31,
    price_type: "periodic",
    booking_price_periods: [
      { start_date: "2027-02-01", end_date: "2027-02-28", price_month: 100000 },
    ],
  };
  assert.equal(rentalMonthPlan(periodic, "2027-02", 10).due, "2027-02-28");
  assert.equal(rentalMonthPlan(periodic, "2027-02", 10).fee, 10000);
  assert.equal(rentalMonthPlan(periodic, "2026-10", 10).rent, null);
  assert.equal(
    rentalMonthPlan(
      {
        ...periodic,
        booking_price_periods: [
          ...periodic.booking_price_periods,
          ...periodic.booking_price_periods,
        ],
      },
      "2027-02",
      10,
    ).fee,
    null,
  );
});
test("unknown commission does not become zero; flat monthly fee supported", () => {
  assert.equal(rentalMonthPlan(booking, "2026-10", null).fee, null);
  assert.equal(rentalMonthPlan(booking, "2026-10", 0).fee, 0);
  assert.equal(rentalMonthPlan(booking, "2026-10", 5000, "amount").ownerBeforeExpenses, 145000);
  assert.equal(rentalMonthPlan(booking, "2026-10", 101).fee, null);
});
test("current contract preferred over future; overlapping contracts flagged; ended contracts excluded", () => {
  const future = { ...booking, id: "next", start_date: "2027-05-07", end_date: "2028-05-07" };
  assert.equal(rentalForProperty([future, booking], "p", "2026-10-08").booking?.id, "vip");
  assert.equal(rentalForProperty([future, booking], "p", "2026-10-08").conflict, false);
  assert.equal(rentalForProperty([booking], "p", "2027-05-07").booking, null);
  assert.equal(
    rentalForProperty([booking, { ...booking, id: "duplicate" }], "p", "2026-10-08").conflict,
    true,
  );
});
