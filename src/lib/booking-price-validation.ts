import { financeToday } from "./finance-payment-status.ts";
type Period = { start_date: string; end_date: string; price_month: number };
const ru = (date: string) => date.split("-").reverse().join(".");
const nextDay = (date: string) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Period endpoints are inclusive, matching booking prices and the database RPC. */
export function bookingPriceProblem(
  periods: Period[],
  start: string,
  end: string,
  paymentDay: number,
  today = financeToday(),
): string | null {
  if (!start || !end || end <= start) return "Дата окончания аренды должна быть позже даты начала.";
  if (!periods.length) return "Добавьте периоды стоимости аренды.";
  const sorted = periods
    .map((p, i) => ({ ...p, row: i + 1 }))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    if (!p.start_date || !p.end_date) return `Период ${p.row}: укажите обе даты.`;
    if (p.end_date < p.start_date) return `Период ${p.row}: окончание раньше начала.`;
    if (p.start_date < start || p.end_date > end)
      return `Период ${p.row}: даты должны быть в пределах аренды ${ru(start)} — ${ru(end)}.`;
    if (!Number.isFinite(p.price_month) || p.price_month <= 0)
      return `Период ${p.row}: укажите стоимость больше нуля.`;
    const previous = sorted[i - 1];
    if (previous && previous.end_date >= p.start_date)
      return `Периоды ${previous.row} и ${p.row} пересекаются. Дата «По» включается в период: следующий период должен начинаться после ${ru(previous.end_date)}.`;
  }
  const first = start > today ? start : today;
  const day = Math.min(31, Math.max(1, paymentDay || 1));
  for (
    let year = Number(first.slice(0, 4)), month = Number(first.slice(5, 7)) - 1;
    `${year}-${String(month + 1).padStart(2, "0")}-01` < end;
    month++
  ) {
    if (month === 12) {
      year++;
      month = 0;
    }
    const due = `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())).padStart(2, "0")}`;
    if (due >= end) break;
    if (due < first) continue;
    if (!periods.some((p) => p.start_date <= due && p.end_date >= due))
      return `На дату платежа ${ru(due)} не задана стоимость. Продлите период или добавьте недостающий.`;
  }
  return null;
}

/** Suggest only dates not already covered; never rewrite entered contractual dates. */
export function nextBookingPricePeriod(periods: Period[], start: string, end: string): Period {
  let candidate = start;
  if (!start || !end || end < start) return { start_date: "", end_date: "", price_month: 0 };
  const sorted = periods
    .filter((p) => p.start_date && p.end_date && p.end_date >= p.start_date)
    .slice()
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  for (const p of sorted) {
    if (p.end_date < candidate) continue;
    if (p.start_date > candidate) {
      const d = new Date(p.start_date + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      return {
        start_date: candidate,
        end_date: d.toISOString().slice(0, 10) < end ? d.toISOString().slice(0, 10) : end,
        price_month: 0,
      };
    }
    candidate = nextDay(p.end_date);
    if (candidate > end) return { start_date: "", end_date: "", price_month: 0 };
  }
  return { start_date: candidate, end_date: end, price_month: 0 };
}
export function bookingErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return typeof error === "string" ? error : "Не удалось сохранить бронь. Попробуйте ещё раз.";
}
