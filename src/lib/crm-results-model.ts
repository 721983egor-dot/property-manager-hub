import type { Deal, DealStage } from "./deals";
export type ResultMode = "inquiries" | "won" | "lost";
export function moscowDay(value: string) {
  return new Date(value).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
}
export function resultKind(deal: Deal, stages: DealStage[]) {
  return stages.find((s) => s.id === deal.stage_id)?.kind ?? "open";
}
export function filterCrmResults(
  deals: Deal[],
  stages: DealStage[],
  mode: ResultMode,
  from: string,
  to: string,
) {
  return deals.filter((d) => {
    if (mode !== "inquiries" && resultKind(d, stages) !== mode) return false;
    const stamp = mode === "inquiries" ? d.created_at : d.closed_at;
    if (!stamp) return !from && !to;
    const date = moscowDay(stamp);
    return (!from || date >= from) && (!to || date <= to);
  });
}
export function crmSources(deals: Deal[], stages: DealStage[], mode: ResultMode) {
  const map = new Map<
    string,
    { name: string; total: number; won: number; lost: number; open: number }
  >();
  for (const d of deals) {
    const name = (mode === "won" ? d.closing_source : d.source)?.trim() || "Не указан";
    const r = map.get(name) ?? { name, total: 0, won: 0, lost: 0, open: 0 };
    r.total++;
    r[resultKind(d, stages)]++;
    map.set(name, r);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
export function companyIncome(rent: number, type: "percent" | "amount", value: number) {
  if (
    !Number.isFinite(rent) ||
    rent <= 0 ||
    !Number.isFinite(value) ||
    value < 0 ||
    (type === "percent" && value > 100)
  )
    throw new Error("Проверьте стоимость и доход компании");
  const fee = Math.round((type === "percent" ? (rent * value) / 100 : value) * 100) / 100;
  if (fee > rent) throw new Error("Доход компании больше аренды");
  return fee;
}
