import { rentalPeriodPrice } from "./rental-period-price.ts";
export type FinanceRental = {
  id: string;
  property_id: string;
  start_date: string;
  end_date: string;
  price_type: string;
  price_month: number | null;
  payment_day: number;
  status: string;
  stay_kind: string;
  booking_price_periods: { start_date: string; end_date: string; price_month: number }[];
};
export function rentalMonthPlan(
  booking: FinanceRental,
  month: string,
  rate: number | null,
  feeType: "percent" | "amount" = "percent",
) {
  const calculation = rentalPeriodPrice(booking, month);
  const due = calculation.due;
  const rent = calculation.amount;
  const scheduled =
    booking.status === "active" &&
    booking.stay_kind === "long_term" &&
    calculation.occupiedDays > 0;
  const valid = rent !== null && Number.isFinite(rent) && rent > 0;
  const percent =
    rate != null && Number.isFinite(rate) && rate >= 0 && (feeType === "amount" || rate <= 100)
      ? rate
      : null;
  const calculatedFee =
    valid && percent !== null
      ? feeType === "amount"
        ? Math.round(((percent * calculation.occupiedDays) / calculation.cycleDays) * 100) / 100
        : Math.round(rent! * percent) / 100
      : null;
  const fee = calculatedFee !== null && calculatedFee <= rent! ? calculatedFee : null;
  return {
    ...calculation,
    due,
    scheduled,
    rent: valid ? rent : null,
    fee,
    ownerBeforeExpenses: fee !== null ? Math.round((rent! - fee) * 100) / 100 : null,
  };
}
export function rentalForProperty(bookings: FinanceRental[], id: string, today: string) {
  const rows = bookings.filter(
    (b) =>
      b.property_id === id &&
      b.status === "active" &&
      b.stay_kind === "long_term" &&
      b.end_date > today,
  );
  const current = rows.filter((b) => b.start_date <= today);
  const booking =
    current[0] ?? rows.sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;
  const conflict =
    !!booking &&
    rows.some(
      (b) =>
        b.id !== booking.id && b.start_date < booking.end_date && b.end_date > booking.start_date,
    );
  return { booking, conflict };
}
export function financeToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
