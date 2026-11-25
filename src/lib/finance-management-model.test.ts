import assert from "node:assert/strict";
import test from "node:test";
import {
  managementReport,
  type ManagementBooking,
  type ManagementDeal,
  type ManagementProperty,
  type ManagementSource,
} from "./finance-management-model.ts";

const property = (id: string, rest: Partial<ManagementProperty> = {}): ManagementProperty => ({
  id,
  title: id,
  internal_name: null,
  ref_id: null,
  type: "apartment",
  status: "free",
  for_rent: true,
  service_type: "management",
  price_month: 150000,
  seasonal_pricing: true,
  summer_price_month: 250000,
  management_fee_type: "percent",
  management_fee_value: 10,
  commission: null,
  ...rest,
});

const booking = (
  id: string,
  propertyId: string,
  rest: Partial<ManagementBooking> = {},
): ManagementBooking => ({
  id,
  property_id: propertyId,
  start_date: "2026-11-01",
  end_date: "2027-05-08",
  price_type: "fixed",
  service_type: "management",
  price_month: 150000,
  payment_day: 1,
  booking_price_periods: [],
  ...rest,
});

const deal = (
  id: string,
  propertyId: string,
  rest: Partial<ManagementDeal> = {},
): ManagementDeal => ({
  id,
  booking_id: null,
  closed_property_id: propertyId,
  start_date: null,
  end_date: null,
  price_month: null,
  payment_day: null,
  income_type: null,
  income_value: null,
  finance_terms: null,
  ...rest,
});

const source = (rest: Partial<ManagementSource> = {}): ManagementSource => ({
  properties: [],
  bookings: [],
  deals: [],
  terms: [],
  installments: [],
  ...rest,
});
const today = "2026-11-25";

test("approved scenario prorates a contract ending in May and keeps summer prices and one-off commissions separate", () => {
  const report = managementReport(
    source({
      properties: [
        property("flat", { status: "rented" }),
        property("house", {
          type: "villa",
          summer_price_month: 200000,
          price_month: 100000,
          management_fee_value: 15,
        }),
        property("fee", { service_type: "commission_only", commission: 50, price_month: 120000 }),
        property("archived", { status: "archived" }),
        property("paused", { for_rent: false }),
      ],
      bookings: [booking("lease", "flat")],
    }),
    "2026-11",
    today,
  );
  assert.equal(report.rows.length, 3);
  assert.equal(report.full, 3_000_000);
  assert.equal(report.contracted, 1_500_000);
  assert.equal(report.difference, 1_500_000);
  assert.deepEqual(
    report.groups.map((g) => [g.contracted, g.full]),
    [
      [1_500_000, 1_500_000],
      [0, 1_500_000],
    ],
  );
  assert.equal(report.commissions[0]?.amount, 6_000_000);
  assert.equal(report.chart.length, 12);
  const may = report.chart.find((p) => p.month === "2027-05")!;
  assert.equal(may.contracted, 338710);
  assert.equal(may.difference, 2_661_290);
  assert.equal(report.chart.find((p) => p.month === "2027-06")?.full, 5_500_000);
  assert.equal(report.chart.find((p) => p.month === "2027-06")?.contracted, 0);
});

test("uses negotiated CRM terms and changes seasonal rent by the day; honours owner and collection terms", () => {
  const s = source({
    properties: [property("flat", { for_rent: false })],
    bookings: [
      booking("lease", "flat", {
        start_date: "2026-11-01",
        end_date: "2027-07-01",
        price_type: "periodic",
        booking_price_periods: [
          { start_date: "2026-11-01", end_date: "2027-06-15", price_month: 150000 },
          { start_date: "2027-06-16", end_date: "2027-07-01", price_month: 240000 },
        ],
      }),
    ],
    deals: [
      deal("signed", "flat", { booking_id: "lease", income_type: "percent", income_value: 15 }),
    ],
    terms: [
      {
        id: "lease",
        owner_rates: [{ from: "2027-06-01", to: "2027-06-10", owner_monthly: 138000 }],
        collection_plan: null,
      },
    ],
  });
  const june = managementReport(s, "2027-06", today);
  assert.equal(june.contracted, 2_575_000); // (10 × 12k + 5 × 22.5k + 15 × 36k) / 30
  assert.equal(june.full, 2_500_000);
  assert.equal(june.difference, -75_000);
  s.terms[0]!.collection_plan = [
    { period: "2027-05-01", through: "2027-06-30", company_fee: 61000 },
  ];
  const may = managementReport(s, "2027-05", today);
  assert.equal(may.contracted, 3_100_000);
  assert.equal(may.chart[1]?.contracted, 3_000_000);
});

test("missing terms and overlapping agreements stay unknown while an explicit zero stays zero", () => {
  const report = managementReport(
    source({
      properties: [
        property("unknown", { management_fee_value: null }),
        property("zero", { management_fee_value: 0 }),
        property("conflict"),
        property("rented", { status: "rented" }),
        property("missing summer", { summer_price_month: null }),
      ],
      bookings: [booking("A", "conflict"), booking("B", "conflict"), booking("zero", "zero")],
    }),
    "2026-11",
    today,
  );
  assert.equal(report.rows.find((r) => r.id === "unknown")?.full, null);
  assert.equal(report.rows.find((r) => r.id === "zero")?.contracted, 0);
  assert.equal(report.rows.find((r) => r.id === "conflict")?.contracted, null);
  assert.equal(report.rows.find((r) => r.id === "rented")?.contractDatesMissing, true);
  assert.equal(report.missingDifference, 3);
  assert.equal(report.chart.find((x) => x.month === "2027-06")?.missingFull, 2);
});

test("CRM agreements without a booking are included once; signed commission only appears in its month", () => {
  const report = managementReport(
    source({
      properties: [
        property("flat"),
        property("fee", { commission: 50, service_type: "commission_only" }),
      ],
      bookings: [booking("booked", "fee", { service_type: "commission_only" })],
      deals: [
        deal("manual", "flat", {
          start_date: "2026-11-15",
          end_date: "2026-11-30",
          price_month: 160000,
          income_type: "amount",
          income_value: 30000,
        }),
        deal("signed", "fee", {
          booking_id: "booked",
          finance_terms: { one_time: 70000, one_time_date: "2026-11-15" },
        }),
      ],
    }),
    "2026-11",
    today,
  );
  assert.equal(report.contracted, 1_500_000);
  assert.deepEqual(
    report.commissions.map((x) => [x.kind, x.amount]),
    [["contract", 7_000_000]],
  );
  assert.equal(report.chart[1]?.contracted, 0);
});
