import type { Payment, FinancePropertyOption } from "./finance.ts";
import type { FinanceCatalog } from "./finance-articles-model.ts";
import { reportEntries, entryTotals, type ReportEntry } from "./finance-analytics.ts";
import { bankPayments } from "./finance-company-model.ts";

export type ObjectTypeFilter = "all" | "house" | "apartment";
export function matchesObjectType(type: string | undefined, filter: ObjectTypeFilter) {
  return (
    filter === "all" ||
    (filter === "house" ? ["house", "villa", "townhouse"] : ["apartment", "aparts"]).includes(
      type ?? "",
    )
  );
}
export function objectProfitability(
  payments: Payment[],
  catalog: FinanceCatalog,
  properties: FinancePropertyOption[],
  from: string,
  to: string,
  type: ObjectTypeFilter = "all",
  propertyId = "all",
) {
  const allowed = new Map(
    properties
      .filter(
        (p) => matchesObjectType(p.type, type) && (propertyId === "all" || p.id === propertyId),
      )
      .map((p) => [p.id, p]),
  );
  const selected = payments.filter((p) => !!p.property_id && allowed.has(p.property_id));
  const entries =
    from && to && from <= to ? reportEntries(selected, catalog, "profit", from, to) : [];
  const grouped = new Map<
    string,
    {
      id: string;
      label: string;
      type: string | undefined;
      entries: ReportEntry[];
      guest: number;
      owner: number;
      unallocated: number;
    }
  >();
  const group = (id: string) => {
    if (!grouped.has(id)) {
      const p = allowed.get(id)!;
      grouped.set(id, {
        id,
        label: p.internal_name?.trim() || p.title,
        type: p.type,
        entries: [],
        guest: 0,
        owner: 0,
        unallocated: 0,
      });
    }
    return grouped.get(id)!;
  };
  for (const e of entries) group(e.payment.property_id!).entries.push(e);
  // Gross rent is explanatory only. Unknown splits are reported, never guessed.
  for (const p of bankPayments(selected)) {
    const date = (p.accrual_date ?? p.planned_date).slice(0, 10);
    if (
      date < from ||
      date > to ||
      p.direction !== "in" ||
      !(p.rental_component === "rent" || p.kind === "rent_in")
    )
      continue;
    const g = group(p.property_id!);
    g.guest += p.amount;
    if (p.rental_component === "rent" && p.company_fee != null) g.owner += p.amount - p.company_fee;
    else g.unallocated += p.amount;
  }
  const rows = [...grouped.values()]
    .map((g) => ({ ...g, ...entryTotals(g.entries) }))
    .sort((a, b) => b.net - a.net || a.label.localeCompare(b.label, "ru"));
  return {
    rows,
    entries,
    ...entryTotals(entries),
    guest: rows.reduce((s, g) => s + g.guest, 0),
    owner: rows.reduce((s, g) => s + g.owner, 0),
    unallocated: rows.reduce((s, g) => s + g.unallocated, 0),
  };
}
export type ObjectProfitability = ReturnType<typeof objectProfitability>;
