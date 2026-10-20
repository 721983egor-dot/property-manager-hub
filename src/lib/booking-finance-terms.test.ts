import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultBookingFinancialTerms,
  previewBookingCollections,
  bookingFinancialTermsProblem,
  bookingFinancialSummary,
} from "./booking-finance-terms.ts";
const terms = {
  start_date: "2026-09-01",
  end_date: "2027-03-01",
  price_type: "fixed",
  price_month: 450000,
  payment_day: 1,
  booking_price_periods: [],
};
const financial = {
  ...defaultBookingFinancialTerms(terms),
  receipts_from: "2026-12-01",
  collection_interval: 3,
  prepaid_owner_payouts: [{ period: "2026-11-01", date: "2026-11-05", amount: 400000 }],
};
test("quarterly preview excludes prepaid months and keeps prior owner payout separate", () => {
  const result = previewBookingCollections(terms, financial, 50000, "amount");
  assert.deepEqual(result, [
    {
      period: "2026-12-01",
      date: "2026-12-01",
      through: "2027-02-28",
      amount: 1350000,
      company_fee: 150000,
    },
  ]);
  assert.equal(bookingFinancialTermsProblem(financial, terms), null);
  assert.match(bookingFinancialSummary(financial), /400/);
});
test("automatic quarter prorates checkout while explicit agreement keeps stated total", () => {
  const short = { ...terms, end_date: "2027-02-28" };
  const result = previewBookingCollections(short, financial, 50000, "amount");
  assert.equal(result[0]!.amount, 1333928.57);
  assert.equal(result[0]!.company_fee, 148214.29);
  const explicit = {
    ...financial,
    collection_interval: 0,
    collection_plan: [
      {
        period: "2026-12-01",
        date: "2026-12-01",
        through: "2027-02-28",
        amount: 1350000,
        company_fee: 150000,
      },
    ],
  };
  assert.equal(previewBookingCollections(short, explicit, 50000, "amount")[0]!.amount, 1350000);
});
test("seasonal monthly prices are summed and owner fixed winter rate leaves summer unchanged", () => {
  const season = {
    ...terms,
    start_date: "2027-04-01",
    end_date: "2027-07-01",
    price_type: "periodic",
    price_month: null,
    booking_price_periods: [
      { start_date: "2027-04-01", end_date: "2027-05-31", price_month: 110000 },
      { start_date: "2027-06-01", end_date: "2027-07-01", price_month: 150000 },
    ],
  };
  const f = {
    ...defaultBookingFinancialTerms(season),
    collection_interval: 3,
    owner_rates: [{ from: "2027-04-01", to: "2027-05-31", owner_monthly: 100000 }],
  };
  const result = previewBookingCollections(season, f, 10, "percent");
  assert.equal(result[0]!.amount, 370000);
  assert.equal(result[0]!.company_fee, 35000);
});
test("invalid overlaps, owner amounts and paid-period payout setup fail clearly", () => {
  assert.match(
    bookingFinancialTermsProblem(
      {
        ...financial,
        prepaid_owner_payouts: [{ period: "2026-12-01", date: "2026-12-05", amount: 400000 }],
      },
      terms,
    )!,
    /до первого/,
  );
  assert.throws(
    () =>
      previewBookingCollections(
        terms,
        {
          ...financial,
          owner_rates: [{ from: "2026-09-01", to: "2027-03-01", owner_monthly: 500000 }],
        },
        50000,
        "amount",
      ),
    /превышает/,
  );
  assert.match(
    bookingFinancialTermsProblem(
      {
        ...financial,
        owner_rates: [
          { from: "2026-09-01", to: "2027-03-01", owner_monthly: 100000 },
          { from: "2026-10-01", to: "2026-11-01", owner_monthly: 100000 },
        ],
      },
      terms,
    )!,
    /пересекаются/,
  );
});
test("first payment defaults to payment deadline, independently of arrival day", () => {
  const f = defaultBookingFinancialTerms({ ...terms, start_date: "2026-10-19", payment_day: 21 });
  assert.equal(f.receipts_from, "2026-10-21");
});

test("explicit first receipt date applies once, later dates use the regular payment day", () => {
  const rows = previewBookingCollections(
    terms,
    { ...financial, collection_interval: 1, receipts_from: "2026-12-14" },
    50000,
    "amount",
  );
  assert.deepEqual(
    rows.map((r) => r.date),
    ["2026-12-14", "2027-01-01", "2027-02-01"],
  );
});

test("payment due on checkout day remains valid for a short final period", () => {
  const short = { ...terms, start_date: "2026-10-01", end_date: "2026-10-10", payment_day: 21 };
  const f = defaultBookingFinancialTerms(short);
  assert.equal(f.receipts_from, "2026-10-10");
  assert.equal(bookingFinancialTermsProblem(f, short), null);
  assert.equal(previewBookingCollections(short, f, 50000, "amount")[0]?.date, "2026-10-10");
});

test("percentage commission uses the rounded monthly charge, matching PostgreSQL kopecks", () => {
  const short = {
    ...terms,
    start_date: "2026-10-01",
    end_date: "2026-10-03",
    price_month: 111.06,
    payment_day: 1,
  };
  const rows = previewBookingCollections(short, defaultBookingFinancialTerms(short), 50, "percent");
  assert.equal(rows[0]?.amount, 7.17);
  assert.equal(rows[0]?.company_fee, 3.59);
});
