import type { PaymentStatus } from "./finance.ts";

/** Финансовый день определяется по Москве независимо от часового пояса устройства. */
export function financeToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** План становится фактом в день операции; ручное проведение действует и для будущей даты. */
export function effectivePaymentStatus(
  payment: { status: string; planned_date: string },
  today = financeToday(),
): PaymentStatus {
  if (payment.status === "paid") return "paid";
  // Явно введённая частичная оплата не означает получения всей суммы.
  if (payment.status === "partial") return "partial";
  return payment.planned_date <= today ? "paid" : "expected";
}

export function paymentFactAmount(
  payment: { status: string; planned_date: string; amount: number; paid_amount: number | null },
  today = financeToday(),
): number {
  if (payment.status === "partial") return payment.paid_amount ?? 0;
  if (payment.status === "paid") return payment.paid_amount ?? payment.amount;
  return effectivePaymentStatus(payment, today) === "paid" ? payment.amount : 0;
}
