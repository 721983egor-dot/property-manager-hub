import type { Payment } from "./finance.ts";
import type { FinanceCatalog } from "./finance-articles-model.ts";
import type { FinanceObjectAssignment } from "./finance-objects.ts";
import type { OwnerSettlement } from "./finance-owner-settlements.ts";
import {
  objectFlowPayments,
  objectFlowSummary,
  type ObjectMoneyFlow,
} from "./finance-object-flow.ts";
import {
  buildFinanceCalendar,
  paymentCashDate,
  findOpeningAnchor,
  financeOpeningScope,
  type OpeningAnchor,
} from "./finance-calendar-model.ts";
import { paymentFactAmount } from "./finance-payment-status.ts";

type Anchors = { forecast: OpeningAnchor | null; actual: OpeningAnchor | null };
export type OverviewOpenings = Record<ObjectMoneyFlow, { selected: Anchors; current: Anchors }>;
const round = (n: number) => Math.round(n * 100) / 100;
export function readOverviewOpenings(
  storage: Pick<Storage, "length" | "key" | "getItem"> | null,
  month: string,
  today: string,
  propertyId = "all",
): OverviewOpenings {
  return Object.fromEntries(
    (["company", "owner", "total"] as const).map((flow) => {
      const scope = financeOpeningScope(propertyId, "all", "all", flow);
      const read = (m: string) => (storage ? findOpeningAnchor(storage, m, scope) : null);
      return [
        flow,
        {
          selected: {
            forecast: read(month),
            actual: read(month < today.slice(0, 7) ? month : today.slice(0, 7)),
          },
          current: { forecast: read(today.slice(0, 7)), actual: read(today.slice(0, 7)) },
        },
      ];
    }),
  ) as OverviewOpenings;
}

export function financeOverview(
  payments: Payment[],
  catalog: FinanceCatalog,
  settings: FinanceObjectAssignment[],
  settlements: OwnerSettlement[],
  month: string,
  today: string,
  propertyId: string | null = null,
  openings = readOverviewOpenings(null, month, today),
) {
  const year = Number(month.slice(0, 4)),
    mi = Number(month.slice(5, 7)) - 1;
  const from = month + "-01",
    to = new Date(Date.UTC(year, mi + 1, 0)).toISOString().slice(0, 10);
  const flows = Object.fromEntries(
    (["company", "owner", "total"] as const).map((flow) => {
      const rows = objectFlowPayments(propertyId, payments, catalog, flow, settings, settlements);
      const anchors = openings[flow];
      const calendar = buildFinanceCalendar(
        rows,
        year,
        mi,
        today,
        anchors.selected.forecast,
        anchors.selected.actual,
      );
      const current = buildFinanceCalendar(
        rows,
        Number(today.slice(0, 4)),
        Number(today.slice(5, 7)) - 1,
        today,
        anchors.current.forecast,
        anchors.current.actual,
      );
      return [
        flow,
        {
          rows,
          calendar,
          currentBalance: current.chart.at(-1)?.actual ?? 0,
          forecastBalance: calendar.chart.at(-1)?.balance ?? 0,
        },
      ];
    }),
  ) as Record<
    ObjectMoneyFlow,
    {
      rows: Payment[];
      calendar: ReturnType<typeof buildFinanceCalendar>;
      currentBalance: number;
      forecastBalance: number;
    }
  >;
  const result = objectFlowSummary(flows.company.rows, catalog, from, to, today);
  const bank = flows.total.currentBalance,
    ownerReserve = flows.owner.currentBalance,
    available = flows.company.currentBalance;
  const deposits = round(
    flows.total.rows
      .filter(
        (p) => (p.kind === "deposit_in" || p.kind === "deposit_out") && paymentCashDate(p) <= today,
      )
      .reduce((sum, p) => sum + (p.direction === "in" ? 1 : -1) * paymentFactAmount(p, today), 0),
  );
  // Unknown rent, unexplained opening cash and excluded articles must not silently become company funds.
  const unallocatedBalance = round(bank - ownerReserve - deposits - available);
  const remaining = (p: Payment) =>
    p.status === "paid" ? 0 : round(Math.max(0, p.amount - paymentFactAmount(p, today)));
  const pending = flows.total.rows
    .filter((p) => remaining(p) > 0)
    .map((payment) => ({
      payment,
      remaining: remaining(payment),
      forecastOnly: payment.id.startsWith("owner-forecast:"),
      overdue: payment.planned_date < today && !payment.id.startsWith("owner-forecast:"),
    }));
  const week = new Date(today + "T12:00:00Z");
  week.setUTCDate(week.getUTCDate() + 6);
  const weekEnd = week.toISOString().slice(0, 10);
  const upcoming = pending
    .filter((p) => p.payment.planned_date <= weekEnd)
    .sort(
      (a, b) =>
        a.payment.planned_date.localeCompare(b.payment.planned_date) ||
        a.payment.id.localeCompare(b.payment.id),
    );
  const plan = flows.company.rows.filter(
    (p) => p.planned_date <= to && p.planned_date >= from && p.planned_date >= today,
  );
  // Overdue partial amounts roll to today in the calendar, and belong in the current month's forecast.
  if (month === today.slice(0, 7))
    plan.push(...flows.company.rows.filter((p) => p.planned_date < today && remaining(p) > 0));
  const expectedIncome = round(
    plan.filter((p) => p.direction === "in").reduce((s, p) => s + remaining(p), 0),
  );
  const expectedExpense = round(
    plan.filter((p) => p.direction === "out").reduce((s, p) => s + remaining(p), 0),
  );
  return {
    from,
    to,
    today,
    weekEnd,
    flows,
    income: result.income,
    expense: result.expense,
    profit: result.net,
    bank,
    ownerReserve,
    deposits,
    available,
    unallocatedBalance,
    unallocatedRent: flows.total.rows.filter(
      (p) =>
        (p.kind === "rent_in" || p.rental_component === "rent") &&
        (p.rental_component !== "rent" || p.company_fee == null) &&
        paymentFactAmount(p, today) > 0,
    ).length,
    expectedIncome,
    expectedExpense,
    overdueCount: pending.filter((p) => p.overdue).length,
    upcoming,
  };
}
