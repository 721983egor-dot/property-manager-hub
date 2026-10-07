import type { Payment } from "./finance.ts";
import type { FinanceCatalog } from "./finance-articles-model.ts";
import type { FinanceObligation } from "./finance-counterparties.ts";
import { obligationCash } from "./finance-counterparty-model.ts";

export type ReportBasis = "cash" | "profit" | "plan";
export type ReportEntry = {
  payment: Payment;
  date: string;
  amount: number;
  category: string;
  article: string;
  activity: string;
  object: string;
};
export const activityLabels = {
  operating: "Операционная деятельность",
  investing: "Инвестиционная деятельность",
  financing: "Финансовая деятельность",
};
export function paidAmount(p: Payment) {
  return p.status === "paid"
    ? (p.paid_amount ?? p.amount)
    : p.status === "partial"
      ? (p.paid_amount ?? 0)
      : 0;
}
export function reportEntries(
  payments: Payment[],
  catalog: FinanceCatalog,
  basis: ReportBasis,
  from: string,
  to: string,
  propertyId = "all",
): ReportEntry[] {
  const entries: ReportEntry[] = [];
  for (const p of payments) {
    if (
      propertyId !== "all" &&
      (propertyId === "none" ? !!p.property_id : p.property_id !== propertyId)
    )
      continue;
    const article = catalog.articles.find((a) => a.id === (p.article_id ?? p.article?.id));
    const profit =
      article?.affects_profit ?? !["deposit_in", "deposit_out"].includes(article?.code ?? p.kind);
    if (basis === "profit" && !profit) continue;
    // Standard accrual date is the operation date; an explicit accrual date overrides it.
    const date = (
      basis === "plan"
        ? p.planned_date
        : basis === "profit"
          ? (p.accrual_date ?? p.planned_date)
          : (p.paid_at ?? p.planned_date)
    ).slice(0, 10);
    const amount = basis === "cash" ? paidAmount(p) : p.amount;
    if (!amount || date < from || date > to) continue;
    const category =
      catalog.categories.find((c) => c.id === article?.category_id)?.name ?? "Без категории";
    const activity =
      article?.cash_flow_type ??
      (["deposit_in", "deposit_out"].includes(p.kind) ? "financing" : "operating");
    entries.push({
      payment: p,
      date,
      amount,
      category,
      article:
        article?.name ??
        p.article?.name ??
        {
          rent_in: "Аренда",
          deposit_in: "Депозит",
          deposit_out: "Возврат депозита",
          owner_payout: "Выплата собственнику",
          contractor: "Обслуживание",
          agency_cost: "Расход агентства",
          other: "Прочее",
        }[p.kind],
      activity: activityLabels[activity],
      object:
        p.property?.internal_name ||
        p.property?.title ||
        (p.property_id ? "Объект без названия" : "Без объекта"),
    });
  }
  return entries;
}
export function entryTotals(entries: ReportEntry[]) {
  let income = 0,
    expense = 0;
  for (const e of entries) {
    if (e.payment.direction === "in") income += e.amount;
    else expense += e.amount;
  }
  return {
    income,
    expense,
    net: income - expense,
    margin: income ? ((income - expense) / income) * 100 : null,
  };
}
export function groupEntries(entries: ReportEntry[], key: (entry: ReportEntry) => string) {
  const groups = new Map<string, ReportEntry[]>();
  for (const entry of entries) {
    const name = key(entry);
    const list = groups.get(name) ?? [];
    list.push(entry);
    groups.set(name, list);
  }
  return [...groups].map(([name, items]) => ({ name, items, ...entryTotals(items) }));
}
export function currentDebts(
  obligations: FinanceObligation[],
  payments: Payment[],
  propertyId = "all",
) {
  return obligations
    .filter(
      (o) =>
        o.status === "open" &&
        (propertyId === "all" ||
          (propertyId === "none" ? !o.property_id : o.property_id === propertyId)),
    )
    .map((o) => ({ ...o, remaining: obligationCash(o, payments).remaining }))
    .filter((o) => o.remaining > 0);
}
export function csvText(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) => row.map((value) => '"' + String(value).replaceAll('"', '""') + '"').join(";"))
      .join("\r\n")
  );
}

export function planFactCategories(plan: ReportEntry[], cash: ReportEntry[]) {
  const groups = new Map<
    string,
    {
      name: string;
      direction: "in" | "out";
      plan: number;
      fact: number;
      planEntries: ReportEntry[];
      cashEntries: ReportEntry[];
    }
  >();
  for (const [basis, entries] of [
    ["plan", plan],
    ["fact", cash],
  ] as const) {
    for (const entry of entries) {
      const key = `${entry.payment.direction}:${entry.category}`;
      const group = groups.get(key) ?? {
        name: entry.category,
        direction: entry.payment.direction,
        plan: 0,
        fact: 0,
        planEntries: [],
        cashEntries: [],
      };
      group[basis] += entry.amount;
      (basis === "plan" ? group.planEntries : group.cashEntries).push(entry);
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort(
    (a, b) => a.direction.localeCompare(b.direction) || a.name.localeCompare(b.name, "ru"),
  );
}
