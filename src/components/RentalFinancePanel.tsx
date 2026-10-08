import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { type FinanceRental, rentalMonthPlan, financeToday } from "@/lib/finance-rental-model";
import { saveManagementFee, createManagementFeePayment } from "@/lib/finance-rentals";
import { formatAdeskMoney, type Payment } from "@/lib/finance";
export function RentalFinancePanel({
  propertyId,
  booking,
  conflict,
  month,
  percent,
  feeType,
  payments,
}: {
  propertyId: string;
  booking: FinanceRental | null;
  conflict: boolean;
  month: string;
  percent: number | null;
  feeType: "percent" | "amount";
  payments: Payment[];
}) {
  const qc = useQueryClient(),
    [rate, setRate] = useState(percent == null ? "" : String(percent));
  const [type, setType] = useState(feeType);
  useEffect(() => setType(feeType), [feeType, propertyId]);
  useEffect(() => setRate(percent == null ? "" : String(percent)), [percent, propertyId]);
  const save = useMutation({
    mutationFn: () => saveManagementFee(propertyId, Number(rate), type),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["finance-object-properties"] });
      toast.success("Комиссия за управление сохранена");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const add = useMutation({
    mutationFn: () => createManagementFeePayment(booking!.id, month, plan!.fee!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Плановый доход компании добавлен в финансы");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const plan = booking ? rentalMonthPlan(booking, month, percent, feeType) : null;
  const existing = payments.some(
    (p) => p.booking_id === booking?.id && p.management_period === month + "-01",
  );
  return (
    <section className="fa-panel finance-rental-panel">
      <h2>Аренда и комиссия компании</h2>
      <p className="fa-note">Расчёт на {month}</p>
      {booking ? (
        <>
          <p>
            {booking.start_date > financeToday() ? "Запланирована аренда" : "Действующая аренда"}:{" "}
            {booking.start_date} — {booking.end_date} · оплата {booking.payment_day}-го числа.{" "}
            <Link to="/objects/$id" params={{ id: propertyId }} className="fa-debt-link">
              Открыть объект
            </Link>
          </p>
          {conflict && (
            <p role="alert" className="fa-error">
              Есть пересекающиеся договоры. Проверьте сроки аренды перед начислением.
            </p>
          )}
          <div className="finance-rental-figures">
            <div>
              <small>Аренда в месяц</small>
              <strong>
                {plan?.rent != null ? formatAdeskMoney(plan.rent) : "Уточните цену в договоре"}
              </strong>
            </div>
            <div>
              <small>
                Доход компании{" "}
                {percent != null ? `(${percent}${feeType === "amount" ? " ₽" : "%"})` : ""}
              </small>
              <strong>{plan?.fee != null ? formatAdeskMoney(plan.fee) : "Задайте комиссию"}</strong>
            </div>
            <div>
              <small>Собственнику до расходов</small>
              <strong>
                {plan?.ownerBeforeExpenses != null
                  ? formatAdeskMoney(plan.ownerBeforeExpenses)
                  : "—"}
              </strong>
            </div>
          </div>
          {!plan?.scheduled && (
            <p className="fa-note">
              В выбранном месяце нет плановой даты оплаты в пределах договора.
            </p>
          )}
        </>
      ) : (
        <p className="fa-note">
          Нет действующего или будущего договора долгосрочной аренды в РМ ОС.
        </p>
      )}
      <form
        className="fa-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label>
          Вознаграждение за управление{" "}
          <select
            aria-label="Тип вознаграждения"
            value={type}
            onChange={(e) => setType(e.target.value as "percent" | "amount")}
          >
            <option value="percent">% от аренды</option>
            <option value="amount">₽ в месяц</option>
          </select>
          <input
            aria-label="Комиссия за управление"
            type="number"
            min="0"
            max={type === "percent" ? 100 : undefined}
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
        <button
          className="fa-button"
          disabled={
            save.isPending ||
            !rate.trim() ||
            !Number.isFinite(Number(rate)) ||
            Number(rate) < 0 ||
            (type === "percent" && Number(rate) > 100)
          }
        >
          Сохранить
        </button>
        {plan?.scheduled && plan.fee != null && plan.fee > 0 && !conflict && (
          <button
            type="button"
            className="finance-primary-button"
            disabled={add.isPending || existing}
            onClick={() => add.mutate()}
          >
            {existing
              ? "Комиссия уже в финансах"
              : `Добавить доход компании: ${formatAdeskMoney(plan.fee)}`}
          </button>
        )}
      </form>
      <p className="fa-note">
        Комиссия считается от договорной аренды до расходов. В финансы добавляется ожидаемый доход
        компании за выбранный месяц; получение денег отмечается в операции. Сумма собственнику
        уточняется с учётом расходов в расчёте ниже.
      </p>
    </section>
  );
}
