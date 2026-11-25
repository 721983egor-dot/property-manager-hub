import { rentalPeriodPrice } from "./rental-period-price.ts";

export type ManagementProperty = {
  id: string;
  title: string;
  internal_name: string | null;
  ref_id: number | null;
  type: string;
  status: string;
  for_rent: boolean | null;
  service_type: string | null;
  price_month: number | null;
  seasonal_pricing: boolean | null;
  summer_price_month: number | null;
  management_fee_type: string | null;
  management_fee_value: number | null;
  commission: number | null;
};

export type ManagementBooking = {
  id: string;
  property_id: string;
  start_date: string;
  end_date: string;
  service_type: string | null;
  price_type: string;
  price_month: number | null;
  payment_day: number;
  booking_price_periods: { start_date: string; end_date: string; price_month: number }[];
};

export type ManagementDeal = {
  id: string;
  booking_id: string | null;
  closed_property_id: string;
  start_date: string | null;
  end_date: string | null;
  price_month: number | null;
  payment_day: number | null;
  income_type: string | null;
  income_value: number | null;
  finance_terms: {
    one_time?: number;
    one_time_date?: string;
    service_type?: string;
    seasons?: ManagementBooking["booking_price_periods"];
  } | null;
};

export type ManagementCashTerms = {
  id: string;
  owner_rates: { from: string; to: string; owner_monthly: number }[] | null;
  collection_plan: { period: string; through: string; company_fee: number }[] | null;
};

type Installment = { booking_id: string; period: string; total_fee: number };
export type ManagementSource = {
  properties: ManagementProperty[];
  bookings: ManagementBooking[];
  deals: ManagementDeal[];
  terms: ManagementCashTerms[];
  installments: Installment[];
};

const date = (iso: string) => new Date(iso + "T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const min = (a: string, b: string) => (a < b ? a : b);
const max = (a: string, b: string) => (a > b ? a : b);
const dayCount = (from: string, to: string) =>
  (date(to).getTime() - date(from).getTime()) / 86400000;
const cents = (rubles: number) => Math.round(rubles * 100);
const nonNegative = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;

function nextDay(day: string) {
  const value = date(day);
  value.setUTCDate(value.getUTCDate() + 1);
  return iso(value);
}

export function managementMonth(month: string, offset: number) {
  const value = date(month + "-01");
  value.setUTCMonth(value.getUTCMonth() + offset);
  return iso(value).slice(0, 7);
}

export function managementMonthRange(month: string) {
  return { from: month + "-01", to: managementMonth(month, 1) + "-01" };
}

export const isSummerMonth = (month: string) => ["06", "07", "08"].includes(month.slice(5));

const overlaps = (start: string, end: string, from: string, to: string) =>
  start < to && end > from && start < end;

function validRent(n: number | null | undefined): n is number {
  return nonNegative(n) && n > 0;
}

function monthlyFee(rent: number | null, type: string | null, rate: number | null) {
  if (!nonNegative(rate)) return null;
  if (type === "percent" && rate <= 100) return validRent(rent) ? (rent * rate) / 100 : null;
  if (type === "amount" && (!validRent(rent) || rate <= rent)) return rate;
  return null;
}

type FeeCoverage = { from: string; to: string; fee: number };

function explicitCoverage(
  booking: ManagementBooking,
  terms: ManagementCashTerms | undefined,
  installments: Installment[],
) {
  if (terms?.collection_plan) {
    return terms.collection_plan.map((p) => ({
      from: max(booking.start_date, p.period),
      to: min(booking.end_date, nextDay(p.through)),
      fee: p.company_fee,
    }));
  }
  return installments.map((plan) => {
    const period = rentalPeriodPrice(booking, plan.period.slice(0, 7));
    return { from: period.from, to: period.to, fee: plan.total_fee };
  });
}

function contractualFee(
  booking: ManagementBooking,
  deal: ManagementDeal | undefined,
  property: ManagementProperty,
  terms: ManagementCashTerms | undefined,
  overrides: FeeCoverage[],
  start: string,
  end: string,
  monthDays: number,
) {
  const fees = [];
  for (
    let day = max(start, booking.start_date);
    day < min(end, booking.end_date);
    day = nextDay(day)
  ) {
    const explicit = overrides.filter((x) => x.from <= day && day < x.to);
    if (explicit.length) {
      const item = explicit[0]!;
      if (explicit.length !== 1 || !nonNegative(item.fee)) return null;
      const span = dayCount(item.from, item.to);
      const elapsed = dayCount(item.from, day);
      const amount = cents(item.fee);
      fees.push(
        Math.round((amount * (elapsed + 1)) / span) - Math.round((amount * elapsed) / span),
      );
      continue;
    }
    const seasonal = booking.booking_price_periods.filter(
      (p) => p.start_date <= day && p.end_date >= day,
    );
    const rent =
      booking.price_type === "periodic"
        ? seasonal.length === 1
          ? seasonal[0]!.price_month
          : null
        : booking.price_type === "fixed"
          ? booking.price_month
          : null;
    if (!validRent(rent)) return null;
    const owner = (terms?.owner_rates ?? []).filter((p) => p.from <= day && p.to >= day);
    if (owner.length > 1) return null;
    const fee = owner.length
      ? rent - owner[0]!.owner_monthly
      : monthlyFee(
          rent,
          deal?.income_type ?? property.management_fee_type,
          deal?.income_value ?? property.management_fee_value,
        );
    if (!nonNegative(fee) || fee > rent) return null;
    fees.push((fee * 100) / monthDays);
  }
  return Math.round(fees.reduce((sum, fee) => sum + fee, 0));
}

const groups = ["Квартиры и апартаменты", "Дома и виллы", "Другие объекты"] as const;
type Group = (typeof groups)[number];
const propertyGroup = (type: string): Group => {
  switch (type) {
    case "apartment":
    case "aparts":
      return groups[0];
    case "house":
    case "villa":
    case "townhouse":
      return groups[1];
    default:
      return groups[2];
  }
};

type Amounts = { contracted: number | null; full: number | null; difference: number | null };
type OneOff = { key: string; title: string; amount: number | null; kind: "contract" | "potential" };

function amountTotals(rows: Amounts[]) {
  const contracted = rows.reduce((sum, p) => sum + (p.contracted ?? 0), 0);
  const full = rows.reduce((sum, p) => sum + (p.full ?? 0), 0);
  const missingContracted = rows.filter((p) => p.contracted === null).length;
  const missingFull = rows.filter((p) => p.full === null).length;
  const difference = rows.reduce((sum, p) => sum + (p.difference ?? 0), 0);
  return {
    contracted,
    full,
    difference,
    missingContracted,
    missingFull,
    missingDifference: rows.filter((p) => p.difference === null).length,
  };
}

function groupByProperty<T extends { property_id: string }>(rows: T[]) {
  const index = new Map<string, T[]>();
  for (const row of rows) {
    const list = index.get(row.property_id) ?? [];
    list.push(row);
    index.set(row.property_id, list);
  }
  return index;
}

export function managementReport(source: ManagementSource, month: string, today: string) {
  const dealsByBooking = new Map(
    source.deals.flatMap((d) => (d.booking_id ? [[d.booking_id, d] as const] : [])),
  );
  const termsByBooking = new Map(source.terms.map((t) => [t.id, t]));
  const bookings: ManagementBooking[] = source.bookings.slice();
  for (const d of source.deals) {
    if (d.booking_id || !d.start_date || !d.end_date || d.start_date >= d.end_date) continue;
    const seasons = d.finance_terms?.seasons ?? [];
    bookings.push({
      id: d.id,
      property_id: d.closed_property_id,
      start_date: d.start_date,
      end_date: d.end_date,
      service_type: d.finance_terms?.service_type ?? "management",
      price_type: seasons.length ? "periodic" : "fixed",
      price_month: d.price_month,
      payment_day: d.payment_day ?? 1,
      booking_price_periods: seasons,
    });
    dealsByBooking.set(d.id, d);
  }
  const byProperty = groupByProperty(bookings);
  const dateOverrides = new Map(
    bookings.map((b) => [
      b.id,
      explicitCoverage(
        b,
        termsByBooking.get(b.id),
        source.installments.filter((i) => i.booking_id === b.id),
      ),
    ]),
  );
  const properties = source.properties.filter(
    (p) =>
      p.status !== "archived" &&
      (p.for_rent !== false || byProperty.get(p.id)?.some((b) => b.end_date > today)),
  );
  const included = new Set(properties.map((p) => p.id));
  const dealCommissions = groupByProperty(
    source.deals
      .filter((d) => included.has(d.closed_property_id))
      .map((d) => ({ ...d, property_id: d.closed_property_id })),
  );

  function calculate(selected: string) {
    const { from, to } = managementMonthRange(selected);
    const monthDays = dayCount(from, to);
    const rows = properties
      .map((p) => {
        const title = p.internal_name?.trim() || p.title;
        const seasonal = p.seasonal_pricing && isSummerMonth(selected);
        const rentValue = seasonal ? p.summer_price_month : p.price_month;
        const rent = validRent(rentValue) ? rentValue : null;
        const commissionOnly = p.service_type === "commission_only";
        const plan = commissionOnly
          ? 0
          : monthlyFee(rent, p.management_fee_type, p.management_fee_value);
        const full = plan === null ? null : cents(plan);
        const contracts = (byProperty.get(p.id) ?? []).filter((b) =>
          overlaps(b.start_date, b.end_date, from, to),
        );
        const hasOverlap = contracts.some((a, i) =>
          contracts
            .slice(i + 1)
            .some((b) =>
              overlaps(
                max(from, a.start_date),
                min(to, a.end_date),
                max(from, b.start_date),
                min(to, b.end_date),
              ),
            ),
        );
        const contractDatesMissing =
          selected === today.slice(0, 7) &&
          (((p.status === "rented" || p.status === "soon_free") &&
            !(byProperty.get(p.id) ?? []).some(
              (b) => b.start_date <= today && today < b.end_date,
            )) ||
            (p.status === "booked" &&
              !(byProperty.get(p.id) ?? []).some((b) => b.end_date > today)));
        const amounts = contracts
          .filter((b) => b.service_type !== "commission_only")
          .map((b) =>
            contractualFee(
              b,
              dealsByBooking.get(b.id),
              p,
              termsByBooking.get(b.id),
              dateOverrides.get(b.id) ?? [],
              from,
              to,
              monthDays,
            ),
          );
        const contracted =
          hasOverlap || contractDatesMissing || amounts.some((a) => a === null)
            ? null
            : amounts.reduce<number>((sum, a) => sum + (a ?? 0), 0);
        const actualCommissions: OneOff[] = (dealCommissions.get(p.id) ?? []).flatMap((d) => {
          const value = d.finance_terms?.one_time;
          const due = d.finance_terms?.one_time_date;
          return nonNegative(value) && value > 0 && due && from <= due && due < to
            ? [{ key: d.id, title, amount: cents(value), kind: "contract" as const }]
            : [];
        });
        const possibleCommission: OneOff | null =
          commissionOnly &&
          !contracts.length &&
          !actualCommissions.length &&
          p.for_rent !== false &&
          p.status !== "rented" &&
          p.status !== "booked"
            ? {
                key: p.id,
                title,
                kind: "potential",
                amount:
                  nonNegative(p.commission) &&
                  p.commission <= 100 &&
                  (p.commission === 0 || rent !== null)
                    ? cents(((rent ?? 0) * p.commission) / 100)
                    : null,
              }
            : null;
        const difference = full === null || contracted === null ? null : full - contracted;
        return {
          id: p.id,
          title,
          ref: p.ref_id,
          group: propertyGroup(p.type),
          status: p.status,
          contractDates: contracts.map((b) => ({ from: b.start_date, to: b.end_date })),
          hasOverlap,
          contractDatesMissing,
          rent,
          seasonal: Boolean(seasonal),
          full,
          contracted,
          difference,
          feeType: p.management_fee_type,
          feeValue: p.management_fee_value,
          commissionRate: p.commission,
          commissionOnly,
          actualCommissions,
          possibleCommission,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title, "ru", { numeric: true }));
    return { month: selected, ...amountTotals(rows), rows };
  }

  const selected = calculate(month);
  const chart = [
    selected,
    ...Array.from({ length: 11 }, (_, i) => calculate(managementMonth(month, i + 1))),
  ].map(({ rows, ...point }) => ({
    ...point,
    seasonal: rows.some((row) => row.seasonal && !row.commissionOnly),
  }));
  return {
    ...selected,
    chart,
    groups: groups.flatMap((label) => {
      const rows = selected.rows.filter((r) => r.group === label);
      return rows.length || label !== groups[2] ? [{ label, ...amountTotals(rows) }] : [];
    }),
    commissions: selected.rows.flatMap((r) => [
      ...r.actualCommissions,
      ...(r.possibleCommission ? [r.possibleCommission] : []),
    ]),
  };
}

export type ManagementReport = ReturnType<typeof managementReport>;
