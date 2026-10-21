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
  payment: {
    requires_confirmation?: boolean;
    paid_amount?: number | null;
    status: string;
    planned_date: string;
    kind?: string;
    rental_component?: string | null;
    owner_payout_on_request?: boolean;
  },
  today = financeToday(),
): PaymentStatus {
  if (payment.status === "paid") return "paid";
  if (payment.rental_component === "owner_plan" && payment.owner_payout_on_request)
    return "expected";
  // Явно введённая частичная оплата не означает получения всей суммы.
  if (payment.kind === "owner_payout" && payment.rental_component === "owner_plan")
    return payment.planned_date < today ? "overdue" : "expected";
  if (payment.status === "partial" && payment.paid_amount === 0 && payment.requires_confirmation)
    return payment.planned_date < today ? "overdue" : "expected";
  if (payment.status === "partial") return "partial";
  if (payment.requires_confirmation) return payment.planned_date < today ? "overdue" : "expected";
  if (payment.kind === "owner_payout") return payment.planned_date < today ? "overdue" : "expected";
  return payment.planned_date <= today ? "paid" : "expected";
}

export function paymentFactAmount(
  payment: {
    requires_confirmation?: boolean;
    status: string;
    planned_date: string;
    amount: number;
    paid_amount: number | null;
    kind?: string;
  },
  today = financeToday(),
): number {
  if (payment.status === "partial") return payment.paid_amount ?? 0;
  if (payment.status === "paid") return payment.paid_amount ?? payment.amount;
  return effectivePaymentStatus(payment, today) === "paid" ? payment.amount : 0;
}
