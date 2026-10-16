import type { CrmCommissionPayment, SeasonalRent } from "./crm-commission";
export function commissionTotals(rows: CrmCommissionPayment[], from: string, to: string) {
  const inside = (date: string) => (!from || date >= from) && (!to || date <= to);
  return rows.reduce(
    (a, p) => {
      if (inside(p.planned_date)) {
        a.planned += Number(p.amount);
        a.turnover += Number(p.rental_turnover ?? 0);
        a.outstanding += Math.max(
          0,
          Number(p.amount) - (p.status === "paid" ? Number(p.amount) : Number(p.paid_amount ?? 0)),
        );
      }
      if (p.paid_at && inside(p.paid_at))
        a.received += Number(p.paid_amount ?? (p.status === "paid" ? p.amount : 0));
      return a;
    },
    { planned: 0, received: 0, outstanding: 0, turnover: 0 },
  );
}
export function validateSeasons(seasons: SeasonalRent[], start: string, end: string) {
  const sorted = [...seasons].sort((a, b) => a.start_date.localeCompare(b.start_date));
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]!;
    if (
      !s.start_date ||
      !s.end_date ||
      s.start_date < start ||
      s.end_date >= end ||
      s.end_date < s.start_date ||
      !Number.isFinite(s.price_month) ||
      s.price_month <= 0
    )
      throw new Error("Укажите даты сезона внутри аренды и цену больше нуля");
    if (i && sorted[i - 1]!.end_date >= s.start_date)
      throw new Error("Сезонные периоды пересекаются");
  }
}
