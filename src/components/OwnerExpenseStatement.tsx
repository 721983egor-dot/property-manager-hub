import { refreshRentalSettlements } from "@/lib/finance-workspace";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { fetchPayments, formatAdeskMoney, formatFinanceDate, type Payment } from "@/lib/finance";
import {
  fetchOwnerSettlements,
  fetchOwnerExpenseAllocations,
} from "@/lib/finance-owner-settlements";
import { fetchObligations } from "@/lib/finance-counterparties";
import { paymentFactAmount } from "@/lib/finance-payment-status";
import { ownerSettlementState } from "@/lib/finance-owner-model";
import { financeToday } from "@/lib/finance-payment-status";
import { useState } from "react";
import { OwnerPayoutDialog } from "./OwnerPayoutDialog";

export function OwnerExpenseStatement({
  ownerId,
  ownerName,
  propertyId,
  from,
  propertyLabel,
  onEdit,
}: {
  ownerId: string;
  ownerName: string;
  propertyId: string | null;
  from: string;
  propertyLabel: (id: string | null) => string;
  onEdit: (payment: Payment) => void;
}) {
  const qc = useQueryClient();
  const [payout, setPayout] = useState<{ id: string; amount: number } | null>(null);
  const refreshed = useQuery({
    queryKey: ["finance-owner-refresh", financeToday()],
    queryFn: async () => {
      await refreshRentalSettlements();
      for (const key of [
        "payments",
        "finance-obligations",
        "finance-owner-settlements",
        "finance-owner-expenses",
      ])
        void qc.invalidateQueries({ queryKey: [key] });
      return true;
    },
    staleTime: Infinity,
  });
  const payments = useQuery({
    queryKey: ["payments", "owner-statement"],
    queryFn: () => fetchPayments(),
  });
  const settlements = useQuery({
    queryKey: ["finance-owner-settlements"],
    queryFn: () => fetchOwnerSettlements(),
  });
  const obligations = useQuery({
    queryKey: ["finance-obligations", ownerId],
    queryFn: () => fetchObligations({ counterpartyId: ownerId }),
  });
  const allocations = useQuery({
    queryKey: ["finance-owner-expenses", ownerId],
    queryFn: fetchOwnerExpenseAllocations,
  });
  if ([refreshed, payments, settlements, obligations, allocations].some((q) => q.error))
    return (
      <p role="alert" className="mt-5 text-red-600">
        Не удалось загрузить расшифровку выплат и расходов собственника.
      </p>
    );
  if ([refreshed, payments, settlements, obligations, allocations].some((q) => q.isPending))
    return <p className="mt-5">Загрузка расчёта собственника…</p>;
  const today = financeToday();
  const rows = payments.data ?? [];
  const expenses = rows.filter(
    (p) =>
      p.expense_bearer === "owner" &&
      p.expense_owner_id === ownerId &&
      (!propertyId || p.property_id === propertyId),
  );
  const visibleCosts = expenses.filter((p) => !from || p.planned_date >= from);
  const scope = (settlements.data ?? []).flatMap((s) => {
    const o = obligations.data?.find((x) => x.id === s.obligation_id);
    if (
      !o ||
      (propertyId && s.property_id !== propertyId) ||
      (from && o.planned_date < from && !o.on_request)
    )
      return [];
    const receipts = rows.filter(
      (p) =>
        p.property_id === s.property_id &&
        p.rental_period === s.period &&
        (!s.booking_id || p.booking_id === s.booking_id),
    );
    const rent = receipts
      .filter((p) => p.rental_component === "rent")
      .reduce((n, p) => n + paymentFactAmount(p, today), 0);
    const fee = receipts
      .filter((p) => p.rental_component === "rent" && p.amount > 0)
      .reduce((n, p) => n + (paymentFactAmount(p, today) * (p.company_fee ?? 0)) / p.amount, 0);
    const utilities = receipts
      .filter((p) => p.rental_component === "utilities")
      .reduce((n, p) => n + paymentFactAmount(p, today), 0);
    return [{ s, o, rent, fee, utilities, state: ownerSettlementState(o, rows, today) }];
  });
  const unrecovered = Math.max(
    0,
    expenses.reduce((n, p) => n + paymentFactAmount(p, today), 0) -
      (allocations.data ?? [])
        .filter((a) => expenses.some((p) => p.id === a.payment_id))
        .reduce((n, a) => n + Number(a.amount), 0),
  );
  const copy = async () => {
    const lines = [
      `Расчёт собственнику: ${ownerName}`,
      ...scope.map(
        ({ s, o, rent, fee, utilities, state }) =>
          `${s.period.slice(0, 7)} · ${propertyLabel(s.property_id)}: аренда ${formatAdeskMoney(rent)}, комиссия ${formatAdeskMoney(fee)}, КУ ${formatAdeskMoney(utilities)}, расходы ${formatAdeskMoney(s.expense_amount ?? 0)}, выплачено ${formatAdeskMoney(state.paid)}, осталось ${formatAdeskMoney(o.status === "closed" ? 0 : state.remaining)}.`,
      ),
      "Расходы за счёт собственника:",
      ...visibleCosts.map(
        (p) =>
          `${formatFinanceDate(p.paid_at ?? p.planned_date)} · ${propertyLabel(p.property_id)} · ${p.article?.name ?? "Расход"} · ${p.comment || "Без описания"}: ${formatAdeskMoney(paymentFactAmount(p, today))}${paymentFactAmount(p, today) < p.amount ? ` (план ${formatAdeskMoney(p.amount)})` : ""}.`,
      ),
      `Ещё не удержанные оплаченные расходы: ${formatAdeskMoney(unrecovered)}.`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Расчёт скопирован — можно отправить собственнику");
    } catch {
      toast.error("Не удалось скопировать расчёт");
    }
  };
  return (
    <section className="fa-panel mt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2>Расчёт выплаты собственнику</h2>
        <Button variant="outline" onClick={() => void copy()}>
          Скопировать расчёт
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Аренда и КУ минус комиссия и оплаченные расходы. Расход удерживается один раз. Непокрытая
        сумма переносится на следующие выплаты по тому же объекту.
      </p>
      {scope.some(({ o, state }) => o.on_request && o.status === "open" && state.remaining > 0) && (
        <div className="mb-4 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Деньги собственника хранятся у нас до запроса
          </p>
          <p className="text-xl font-semibold">
            {formatAdeskMoney(
              scope.reduce(
                (n, { o, state }) =>
                  n + (o.on_request && o.status === "open" ? state.remaining : 0),
                0,
              ),
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            После комиссии и расходов. Это резерв собственника, без просрочки и плановой даты
            расхода.
          </p>
        </div>
      )}
      {payout && (
        <OwnerPayoutDialog
          obligationId={payout.id}
          remaining={payout.amount}
          onClose={() => setPayout(null)}
        />
      )}
      <div className="fa-table-scroll">
        <table className="fa-table">
          <thead>
            <tr>
              <th>Месяц / объект</th>
              <th>Аренда</th>
              <th>Комиссия</th>
              <th>КУ</th>
              <th>Расходы</th>
              <th>Выплачено</th>
              <th>Осталось перечислить</th>
            </tr>
          </thead>
          <tbody>
            {scope.map(({ s, o, rent, fee, utilities, state }) => (
              <tr key={s.id}>
                <td>
                  {s.period.slice(0, 7)}
                  <br />
                  {propertyLabel(s.property_id)}
                </td>
                <td>{formatAdeskMoney(rent)}</td>
                <td>{formatAdeskMoney(fee)}</td>
                <td>{formatAdeskMoney(utilities)}</td>
                <td>{formatAdeskMoney(s.expense_amount ?? 0)}</td>
                <td>{formatAdeskMoney(state.paid)}</td>
                <td>
                  {formatAdeskMoney(o.status === "closed" ? 0 : state.remaining)}
                  {o.on_request && state.remaining > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Хранится у нас · без даты выплаты
                    </p>
                  )}
                  {o.status === "open" && state.remaining > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => setPayout({ id: o.id, amount: state.remaining })}
                    >
                      Выплатить
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!scope.length && (
        <p className="py-3 text-sm text-muted-foreground">
          Начислений к выплате пока нет. Расходы сохранятся до поступления аренды.
        </p>
      )}
      <h3 className="mt-5 mb-3 font-medium">Расходы за счёт собственника</h3>
      <div className="fa-table-scroll">
        <table className="fa-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Объект</th>
              <th>Статья / описание</th>
              <th>Получатель</th>
              <th>Оплачено / сумма</th>
              <th>Удержано</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleCosts.map((p) => {
              const used = (allocations.data ?? [])
                .filter((a) => a.payment_id === p.id)
                .reduce((n, a) => n + Number(a.amount), 0);
              return (
                <tr key={p.id}>
                  <td>{formatFinanceDate(p.paid_at ?? p.planned_date)}</td>
                  <td>{propertyLabel(p.property_id)}</td>
                  <td>
                    {p.article?.name ?? "Расход"}
                    <br />
                    {p.comment}
                  </td>
                  <td>{p.counterparty_name || "—"}</td>
                  <td>
                    {formatAdeskMoney(paymentFactAmount(p, today))} / {formatAdeskMoney(p.amount)}
                  </td>
                  <td>{formatAdeskMoney(used)}</td>
                  <td>
                    <Button variant="ghost" onClick={() => onEdit(p)}>
                      Открыть
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!visibleCosts.length && (
        <p className="py-3 text-sm text-muted-foreground">Расходов за выбранный период нет.</p>
      )}
      {unrecovered > 0 && (
        <p className="mt-3 text-sm">
          Ещё не удержано: <strong>{formatAdeskMoney(unrecovered)}</strong>. Будет учтено в
          следующих выплатах. Сумма включает всю историю выбранного объекта.
        </p>
      )}
    </section>
  );
}
