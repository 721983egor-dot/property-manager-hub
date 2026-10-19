export type RentalPriceTerms = {
  start_date: string;
  end_date: string;
  payment_day: number;
  price_type: string;
  price_month: number | null;
  booking_price_periods: { start_date: string; end_date: string; price_month: number }[];
};
export type RentalPricePart = {
  from: string;
  to: string;
  days: number;
  monthlyRate: number;
  amount: number;
};
const round = (n: number) => Math.round(n * 100) / 100;
const date = (s: string) => new Date(s + "T12:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const days = (a: string, b: string) =>
  Math.round((date(b).getTime() - date(a).getTime()) / 86400000);
const monthly = (year: number, month: number, day: number) =>
  iso(
    new Date(
      Date.UTC(year, month, Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()), 12),
    ),
  );
/** Service months start on the arrival day. The payment deadline is independent. Checkout is excluded. */
export function rentalPeriodPrice(booking: RentalPriceTerms, month: string) {
  const year = Number(month.slice(0, 4)),
    mi = Number(month.slice(5, 7)) - 1;
  const anchor = Number(booking.start_date.slice(8, 10));
  const from = monthly(year, mi, anchor),
    cycleEnd = monthly(year, mi + 1, anchor);
  const to = booking.end_date < cycleEnd ? booking.end_date : cycleEnd;
  const cycleDays = days(from, cycleEnd),
    occupiedDays = Math.max(0, days(from, to));
  const nominalDue = monthly(year, mi, booking.payment_day);
  const due =
    nominalDue < booking.start_date ? booking.start_date : nominalDue > to ? to : nominalDue;
  const active = from >= booking.start_date && from < booking.end_date;
  if (!active)
    return {
      from,
      to,
      cycleEnd,
      cycleDays,
      occupiedDays: 0,
      due,
      amount: null,
      parts: [] as RentalPricePart[],
      problem: null,
    };
  const parts: RentalPricePart[] = [];
  for (let d = date(from); iso(d) < to; d.setUTCDate(d.getUTCDate() + 1)) {
    const current = iso(d),
      next = new Date(d);
    next.setUTCDate(next.getUTCDate() + 1);
    const prices = booking.booking_price_periods.filter(
      (p) => p.start_date <= current && p.end_date >= current,
    );
    const rate =
      booking.price_type === "periodic"
        ? prices.length === 1
          ? Number(prices[0]!.price_month)
          : null
        : booking.price_month;
    if (rate == null || !Number.isFinite(rate) || rate <= 0)
      return {
        from,
        to,
        cycleEnd,
        cycleDays,
        occupiedDays,
        due,
        amount: null,
        parts,
        problem: `На ${current} задайте единственную положительную цену аренды`,
      };
    const last = parts.at(-1);
    if (last?.monthlyRate === rate) {
      last.to = iso(next);
      last.days++;
    } else parts.push({ from: current, to: iso(next), days: 1, monthlyRate: rate, amount: 0 });
  }
  const amount = round(parts.reduce((sum, p) => sum + (p.monthlyRate * p.days) / cycleDays, 0));
  let allocated = 0;
  parts.forEach((p, i) => {
    p.amount =
      i === parts.length - 1
        ? round(amount - allocated)
        : round((p.monthlyRate * p.days) / cycleDays);
    allocated = round(allocated + p.amount);
  });
  return { from, to, cycleEnd, cycleDays, occupiedDays, due, amount, parts, problem: null };
}
