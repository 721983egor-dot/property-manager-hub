import type { Payment } from "./finance.ts";

export function confirmationSource(payment: Pick<Payment, "id" | "cash_parent_id">) {
  const movement = payment.id.replace(/^(company|owner):/, "");
  return {
    paymentId: payment.cash_parent_id || movement,
    receiptId: movement.startsWith("cash:") ? movement.slice(5) : null,
  };
}
