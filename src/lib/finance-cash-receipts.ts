import type { Payment } from "./finance.ts";
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** One logical charge, several cash movements. Amounts and fees sum to the original charge. */
export function expandPaymentReceipts(p: Payment): Payment[] {
  const events = p.cash_receipts ?? [];
  if (!events.length)
    return [
      { ...p, contract_date: p.planned_date, planned_date: p.task_expected_date || p.planned_date },
    ];
  let allocatedFee = 0;
  const rows = events.map((event, index): Payment => {
    const lastFull = index === events.length - 1 && p.paid_amount === p.amount;
    const fee =
      p.company_fee == null
        ? null
        : lastFull
          ? money(p.company_fee - allocatedFee)
          : money((p.company_fee * event.amount) / p.amount);
    allocatedFee = money(allocatedFee + (fee ?? 0));
    return {
      ...p,
      id: `cash:${event.id}`,
      cash_parent_id: p.id,
      cash_receipts: [],
      contract_date: p.planned_date,
      accrual_date: p.accrual_date || p.planned_date,
      planned_date: event.date,
      paid_at: event.date,
      amount: event.amount,
      paid_amount: event.amount,
      status: "paid",
      account: event.account,
      company_fee: fee,
    };
  });
  const remaining = money(p.amount - (p.paid_amount ?? 0));
  if (remaining > 0)
    rows.push({
      ...p,
      cash_parent_id: p.id,
      cash_receipts: [],
      contract_date: p.planned_date,
      accrual_date: p.accrual_date || p.planned_date,
      planned_date: p.task_expected_date || p.planned_date,
      amount: remaining,
      paid_amount: 0,
      paid_at: null,
      status: "partial",
      requires_confirmation: true,
      company_fee: p.company_fee == null ? null : money(p.company_fee - allocatedFee),
    });
  return rows;
}
