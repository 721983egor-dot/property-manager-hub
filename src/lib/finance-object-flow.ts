import type { Payment } from "./finance.ts";
import type { FinanceCatalog } from "./finance-articles-model.ts";
import type { FinanceObjectAssignment } from "./finance-objects.ts";
import type { OwnerSettlement } from "./finance-owner-settlements.ts";
import { ownerCashPayments } from "./finance-company-model.ts";
import { reportPayments } from "./finance-report-payments.ts";
import { buildFinanceCalendar } from "./finance-calendar-model.ts";
import { entryTotals, reportEntries } from "./finance-analytics.ts";

export type ObjectMoneyFlow = "company" | "owner" | "total";
export const objectFlowLabels = { company: "Компания", owner: "Собственник", total: "Всего" };
export const objectFlowNotes = {
  company:
    "Комиссия и другие доходы компании за вычетом её расходов. Деньги собственника и депозит исключены.",
  owner:
    "Аренда после комиссии и КУ — приход. Выплаты и расходы за счёт собственника — расход. Остаток показывает его деньги у компании; депозит исключён.",
  total:
    "Все поступления и расходы по объекту, включая деньги компании, собственника и страховой депозит. Комиссия внутри аренды не дублируется.",
};
const round = (n: number) => Math.round(n * 100) / 100;
export const objectFlowSourceId = (id: string) => id.replace(/^(company|owner):/, "");

export function objectFlowPayments(
  id: string | null,
  payments: Payment[],
  catalog: FinanceCatalog,
  flow: ObjectMoneyFlow,
  settings: FinanceObjectAssignment[] = [],
  settlements: OwnerSettlement[] = [],
): Payment[] {
  const scoped = payments
    .filter((p) => id == null || p.property_id === id)
    .map((p) => {
      const article = catalog.articles.find((a) => a.id === (p.article_id ?? p.article?.id));
      return article ? { ...p, article: { ...article, category_name: null } } : p;
    });
  if (flow === "company") return reportPayments(scoped, catalog, true);
  const rows = ownerCashPayments(scoped, settings, settlements);
  if (flow === "total") return reportPayments(rows, catalog, false);
  return rows.flatMap((p) => {
    if (
      p.expense_bearer === "owner" ||
      p.kind === "owner_payout" ||
      (p.direction === "out" && p.article?.code === "utilities_out")
    )
      return [p];
    if (p.rental_component === "utilities") return [p];
    if (p.rental_component !== "rent" || p.company_fee == null || p.amount <= 0) return [];
    const amount = round(p.amount - p.company_fee);
    if (amount <= 0) return [];
    return [
      {
        ...p,
        id: `owner:${p.id}`,
        amount,
        paid_amount:
          p.paid_amount == null
            ? null
            : round(p.paid_amount - round((p.paid_amount * p.company_fee) / p.amount)),
        rental_component: null,
        company_fee: null,
        rental_stage: null,
        rental_installment_id: null,
        kind: "other" as const,
        article_id: null,
        article: {
          id: "owner_rent",
          name: "Аренда собственнику после комиссии",
          code: "owner_rent",
          category_id: null,
          category_name: null,
        },
        comment: `Доля собственника · ${p.comment}`,
      },
    ];
  });
}

/** Cash movement uses the full history for the carried balance, and the same rows for chart and table. */
export function objectFlowSummary(
  rows: Payment[],
  catalog: FinanceCatalog,
  from: string,
  to: string,
  today: string,
) {
  const entries = reportEntries(rows, catalog, "cash", from, to, "all", today);
  const calendar = buildFinanceCalendar(
    rows,
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    today,
  );
  return {
    ...entryTotals(entries),
    entries,
    actualBalance: calendar.chart.at(-1)?.actual ?? 0,
    forecastBalance: calendar.chart.at(-1)?.balance ?? 0,
    series: calendar.chart.map((p) => ({
      date: p.date,
      actual: p.actual,
      forecast: p.date >= today ? p.balance : null,
    })),
  };
}
