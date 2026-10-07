import type { Payment } from "./finance.ts";
import type { FinanceObligation } from "./finance-counterparties.ts";

export type CounterpartyOverview = {
  theyOweUs: number;
  transferredToUs: number;
  weTransferred: number;
  cashSaldo: number;
  propertyIds: string[];
};

export function summarizeCounterparty(
  payments: Payment[],
  obligations: FinanceObligation[],
  settlementPayments: Payment[] = payments,
): CounterpartyOverview {
  let theyOweUs = 0;
  for (const item of obligations) {
    if (item.status !== "open") continue;
    const { remaining } = obligationCash(item, settlementPayments);
    if (item.direction === "receivable") theyOweUs += remaining;
    else theyOweUs -= remaining;
  }
  let transferredToUs = 0;
  let weTransferred = 0;
  const propertyIds: string[] = [];
  for (const payment of payments) {
    const status = payment.status;
    const fact = payment.paid_amount ?? (status === "paid" ? payment.amount : 0);
    if (status === "paid" || status === "partial") {
      if (payment.direction === "in") transferredToUs += fact;
      else weTransferred += fact;
    }
    if (payment.property_id && !propertyIds.includes(payment.property_id)) {
      propertyIds.push(payment.property_id);
    }
  }
  for (const item of obligations) {
    if (item.property_id && !propertyIds.includes(item.property_id)) {
      propertyIds.push(item.property_id);
    }
  }
  return {
    theyOweUs,
    transferredToUs,
    weTransferred,
    cashSaldo: transferredToUs - weTransferred,
    propertyIds,
  };
}

export function obligationCash(obligation: FinanceObligation, payments: Payment[]) {
  const linked = payments.filter((payment) => payment.obligation_id === obligation.id);
  const settlementDirection = obligation.direction === "receivable" ? "in" : "out";
  let paid = 0;
  for (const payment of linked) {
    const status = payment.status;
    if (status === "paid" || status === "partial") {
      const fact = payment.paid_amount ?? (status === "paid" ? payment.amount : 0);
      if (payment.direction === settlementDirection) paid += fact;
    }
  }
  return { linked, paid, remaining: Math.max(0, obligation.amount - paid) };
}
