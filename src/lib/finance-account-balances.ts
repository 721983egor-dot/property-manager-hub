import type { Payment } from "./finance.ts";
import type { FinanceAccount } from "./finance-accounts.ts";
import { bankPayments } from "./finance-company-model.ts";
import { expandPaymentReceipts } from "./finance-cash-receipts.ts";
import { financeToday, paymentFactAmount } from "./finance-payment-status.ts";
import { paymentCashDate } from "./finance-calendar-model.ts";

/** All-time actual cash, independent of page filters. Accepts raw or expanded ledger rows. */
export function financeAccountBalances(
  accounts: FinanceAccount[],
  payments: Payment[],
  today = financeToday(),
) {
  const amounts = new Map<string, number>();
  for (const p of bankPayments(payments.flatMap(expandPaymentReceipts))) {
    if (paymentCashDate(p) > today) continue;
    const amount = paymentFactAmount(p, today) * (p.direction === "in" ? 1 : -1);
    amounts.set(p.account, (amounts.get(p.account) ?? 0) + amount);
  }
  const rows = accounts
    .filter((a) => !a.archived)
    .map((a) => ({ ...a, balance: Math.round((amounts.get(a.name) ?? 0) * 100) / 100 }));
  // Keep unmatched historical cash visible instead of silently dropping it from the total.
  for (const [name, balance] of amounts) {
    if (!accounts.some((a) => a.name === name) && balance !== 0)
      rows.push({
        id: `unassigned:${name}`,
        name: name || "Без счёта",
        type: "bank",
        archived: false,
        balance: Math.round(balance * 100) / 100,
      });
  }
  return {
    accounts: rows,
    total: Math.round(rows.reduce((sum, a) => sum + a.balance, 0) * 100) / 100,
    asOf: today,
  };
}
