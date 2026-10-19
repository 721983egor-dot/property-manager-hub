import { rentalPeriodPrice } from "./rental-period-price.ts";
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
  const final = new Date(start + "T12:00:00Z");
  final.setUTCFullYear(final.getUTCFullYear() + 20);
  if (end > final.toISOString().slice(0, 10)) return "Срок аренды — не более 20 лет.";
  const terms = {
    start_date: start,
    end_date: end,
    payment_day: paymentDay,
    price_type: "periodic",
    price_month: null,
    booking_price_periods: periods,
  };
  for (
    let y = Number(first.slice(0, 4)), m = Number(first.slice(5, 7)) - 1;
    `${y}-${String(m + 1).padStart(2, "0")}-01` < end;
    m++
  ) {
    if (m === 12) {
      y++;
      m = 0;
    }
    const calculation = rentalPeriodPrice(terms, `${y}-${String(m + 1).padStart(2, "0")}`);
    if (calculation.due < today) continue;
    if (calculation.problem) return calculation.problem;
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
