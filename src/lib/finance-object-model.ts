import type { FinancePropertyOption, Payment } from "./finance.ts";
import type { FinanceCatalog } from "./finance-articles-model.ts";
import type { FinanceObligation } from "./finance-counterparties.ts";
import type { FinanceObjectAssignment } from "./finance-objects.ts";
import {
  reportEntries,
  entryTotals,
  currentDebts,
  paidAmount,
  type ReportBasis,
} from "./finance-analytics.ts";
export function filterFinanceObjects<T extends FinancePropertyOption>(
  properties: T[],
  assignments: FinanceObjectAssignment[],
  classificationId = "all",
  query = "",
) {
  const term = query.trim().toLocaleLowerCase("ru");
  return properties.filter((p) => {
    const assigned = assignments.find((a) => a.property_id === p.id)?.classification_id ?? null;
    return (
      (classificationId === "all" ||
        (classificationId === "none" ? assigned === null : assigned === classificationId)) &&
      (!term ||
        `${p.title} ${p.internal_name ?? ""} ${p.ref_id ?? ""}`
          .toLocaleLowerCase("ru")
          .includes(term))
    );
  });
}
export function objectFinanceSummary(
  id: string,
  payments: Payment[],
  obligations: FinanceObligation[],
  catalog: FinanceCatalog,
  from: string,
  to: string,
  basis: ReportBasis = "profit",
) {
  const entries = reportEntries(payments, catalog, basis, from, to, id);
  const debts = currentDebts(obligations, payments, id);
  const receivable = debts
    .filter((d) => d.direction === "receivable")
    .reduce((s, d) => s + d.remaining, 0);
  const payable = debts
    .filter((d) => d.direction === "payable")
    .reduce((s, d) => s + d.remaining, 0);
  return {
    ...entryTotals(entries),
    entries,
    receivable,
    payable,
    debtBalance: receivable - payable,
  };
}
export function objectFinanceSeries(
  id: string,
  payments: Payment[],
  catalog: FinanceCatalog,
  from: string,
  to: string,
  basis: "cash" | "profit",
  today: string,
) {
  const entries = reportEntries(payments, catalog, basis, from, to, id);
  const daily = new Map<string, number>();
  for (const e of entries)
    daily.set(
      e.date,
      (daily.get(e.date) ?? 0) + (e.payment.direction === "in" ? e.amount : -e.amount),
    );
  if (basis === "cash")
    for (const p of payments) {
      if (
        p.property_id !== id ||
        p.planned_date <= today ||
        p.planned_date < from ||
        p.planned_date > to
      )
        continue;
      const remaining = Math.max(0, p.amount - paidAmount(p));
      daily.set(
        p.planned_date,
        (daily.get(p.planned_date) ?? 0) + (p.direction === "in" ? remaining : -remaining),
      );
    }
  const result: { date: string; actual: number | null; forecast: number | null }[] = [];
  let cumulative = 0;
  for (let date = from; date <= to;) {
    cumulative += daily.get(date) ?? 0;
    result.push({
      date,
      actual: date <= today ? cumulative : null,
      forecast: date >= today ? cumulative : null,
    });
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0, 10);
  }
  if (result.length && from > today) result[0]!.forecast = result[0]!.forecast ?? 0;
  return result;
}
