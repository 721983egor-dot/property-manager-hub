import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPaymentSeriesDates, buildPaymentSeriesEntries } from "./finance-payment-series.ts";
test("monthly day independent of first actual date, starts in following month", () => {
  assert.deepEqual(
    buildPaymentSeriesDates("2026-10-21", { interval: "month", paymentDay: 5, count: 4 }),
    ["2026-10-21", "2026-11-05", "2026-12-05", "2027-01-05"],
  );
  assert.deepEqual(
    buildPaymentSeriesDates("2026-10-21", { interval: "month", paymentDay: 25, count: 3 }),
    ["2026-10-21", "2026-11-25", "2026-12-25"],
  );
});
test("short months clamp without drifting the selected day, including leap years", () => {
  assert.deepEqual(
    buildPaymentSeriesDates("2027-01-21", { interval: "month", paymentDay: 31, count: 4 }),
    ["2027-01-21", "2027-02-28", "2027-03-31", "2027-04-30"],
  );
  assert.deepEqual(
    buildPaymentSeriesDates("2028-01-21", { interval: "month", paymentDay: 31, count: 3 }),
    ["2028-01-21", "2028-02-29", "2028-03-31"],
  );
});
test("end date is inclusive, series bounded and legacy weekly/monthly defaults unchanged", () => {
  assert.deepEqual(
    buildPaymentSeriesDates("2026-10-21", {
      interval: "month",
      paymentDay: 5,
      untilDate: "2027-01-05",
    }),
    ["2026-10-21", "2026-11-05", "2026-12-05", "2027-01-05"],
  );
  assert.deepEqual(
    buildPaymentSeriesDates("2026-10-21", {
      interval: "month",
      paymentDay: 5,
      untilDate: "2026-11-04",
    }),
    ["2026-10-21"],
  );
  assert.deepEqual(buildPaymentSeriesDates("2026-10-21", { interval: "week", count: 3 }), [
    "2026-10-21",
    "2026-10-28",
    "2026-11-04",
  ]);
  assert.deepEqual(buildPaymentSeriesDates("2027-01-31", { interval: "month", count: 3 }), [
    "2027-01-31",
    "2027-02-28",
    "2027-03-31",
  ]);
  assert.equal(
    buildPaymentSeriesDates("2026-10-21", {
      interval: "month",
      paymentDay: 5,
      untilDate: "2099-01-01",
    }).length,
    36,
  );
});
test("invalid schedules fail before saving even the first payment", () => {
  for (const paymentDay of [0, 32, NaN, 5.5])
    assert.throws(
      () => buildPaymentSeriesDates("2026-10-21", { interval: "month", paymentDay, count: 2 }),
      /День/,
    );
  assert.throws(
    () => buildPaymentSeriesDates("2026-10-21", { interval: "week", paymentDay: 5, count: 2 }),
    /День/,
  );
  for (const count of [0, 37, 2.5, NaN])
    assert.throws(() => buildPaymentSeriesDates("2026-10-21", { interval: "month", count }), /36/);
  assert.throws(
    () => buildPaymentSeriesDates("2026-10-21", { interval: "month", untilDate: "2026-09-01" }),
    /раньше/,
  );
  assert.throws(
    () => buildPaymentSeriesDates("2026-02-31", { interval: "month", count: 2 }),
    /дату/,
  );
});
test("future repeats never inherit paid or partial cash; accrual stays separate from payment day", () => {
  for (const status of ["paid", "partial"]) {
    const input = {
      planned_date: "2026-10-21",
      amount: 2000,
      direction: "out",
      status,
      paid_at: "2026-10-20",
      paid_amount: status === "paid" ? 2000 : 1200,
      accrual_date: "2026-10-01",
      account: "Карта",
      article_id: "advertising",
    };
    const rows = buildPaymentSeriesEntries(input, { interval: "month", paymentDay: 5, count: 3 });
    assert.deepEqual(rows[0], input);
    assert.deepEqual(
      rows
        .slice(1)
        .map((p) => [p.planned_date, p.status, p.paid_at, p.paid_amount, p.accrual_date]),
      [
        ["2026-11-05", "expected", null, null, "2026-11-01"],
        ["2026-12-05", "expected", null, null, "2026-12-01"],
      ],
    );
    assert.equal(rows[1]?.account, "Карта");
    assert.equal(rows[1]?.article_id, "advertising");
    assert.equal(input.paid_at, "2026-10-20", "original input not changed");
  }
});
test("unlimited preview has no count/end date; mixing an end rule is rejected", () => {
  const dates = buildPaymentSeriesDates("2026-10-21", { interval: "month", paymentDay: 5, unlimited: true });
  assert.equal(dates.length, 36); // bounded preview only; persistence/cron continues indefinitely
  assert.equal(dates[1], "2026-11-05");
  assert.throws(() => buildPaymentSeriesDates("2026-10-21", { interval: "month", unlimited: true, count: 12 }), /без срока/);
  assert.throws(() => buildPaymentSeriesDates("2026-10-21", { interval: "month", unlimited: true, untilDate: "2027-01-01" }), /без срока/);
});
