import { obligationCash } from "./finance-counterparty-model.ts";
import type { Payment } from "./finance.ts";
import type { FinanceObligation } from "./finance-counterparties.ts";
export function ownerSettlementState(
  obligation: FinanceObligation,
  payments: Payment[],
  today: string,
) {
  const cash = obligationCash(obligation, payments);
  const label =
    obligation.status === "closed"
      ? "Закрыт вручную"
      : cash.remaining <= 0
        ? "Выплачено"
        : obligation.planned_date < today
          ? "Просрочено"
          : cash.paid > 0
            ? "Частично выплачено"
            : "К выплате";
  return {
    ...cash,
    label,
    overdue: obligation.status === "open" && cash.remaining > 0 && obligation.planned_date < today,
  };
}
