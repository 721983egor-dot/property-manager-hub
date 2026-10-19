import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Booking } from "@/lib/bookings";
import {
  fetchPayments,
  formatAdeskMoney,
  formatFinanceDate,
  rentalPaymentLabel,
  statusLabel,
  effectivePaymentStatus,
  type Payment,
} from "@/lib/finance";
import { financeToday } from "@/lib/finance-payment-status";
import { rentalMonthPlan } from "@/lib/finance-rental-model";
import { PaymentDialog } from "./PaymentDialog";
import { RentalInstallmentsDialog } from "./RentalInstallmentsDialog";
import { Button } from "./ui/button";
export function BookingFinanceActions({
  booking,
  fee,
  feeType,
  account,
}: {
  booking: Booking;
  fee: number | null;
  feeType: "percent" | "amount";
  account?: string | undefined;
}) {
  const today = financeToday();
  const [period, setPeriod] = useState(
    () =>
      [
        booking.start_date.slice(0, 7),
        [today.slice(0, 7), booking.end_date.slice(0, 7)].sort()[0]!,
      ].sort()[1]!,
  );
  const [installments, setInstallments] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [adding, setAdding] = useState<"utilities" | "deposit" | null>(null);
  const payments = useQuery({
    queryKey: ["payments", "booking", booking.id],
    queryFn: () => fetchPayments({ bookingId: booking.id }),
  });
  const rental = {
    ...booking,
    booking_price_periods: booking.periods,
    clients: booking.client,
    deposit: booking.deposit ?? 0,
  };
  const plan = rentalMonthPlan(rental, period, fee, feeType);
  return (
    <section className="rounded-lg border p-4 space-y-3">
      <h3 className="font-medium">Платежи по брони</h3>
      <p className="text-xs text-muted-foreground">
        График аренды создаётся из условий брони. Получение денег отмечайте в существующем платеже.
        Предоплата и остаток заменяют один платёж графика, без второго прихода.
      </p>
      <label className="text-sm block">
        Месяц арендного периода{" "}
        <input
          aria-label="Месяц платежей брони"
          type="month"
          value={period}
          min={booking.start_date.slice(0, 7)}
          max={booking.end_date.slice(0, 7)}
          onChange={(e) => setPeriod(e.target.value)}
          className="ml-2 rounded border p-1"
        />
      </label>
      {plan.scheduled && (
        <p className="text-sm">
          Аренда: {plan.rent == null ? "уточните цену" : formatAdeskMoney(plan.rent)} · компания:{" "}
          {plan.fee == null ? "уточните комиссию" : formatAdeskMoney(plan.fee)}
        </p>
      )}
      {booking.status === "active" && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!plan.scheduled || plan.rent == null || plan.fee == null}
            onClick={() => setInstallments(true)}
          >
            Предоплата и остаток
          </Button>
          <Button variant="outline" onClick={() => setAdding("utilities")}>
            Добавить КУ
          </Button>
          <Button variant="outline" onClick={() => setAdding("deposit")}>
            Добавить депозит
          </Button>
        </div>
      )}
      {payments.isPending ? (
        <p>Загрузка платежей…</p>
      ) : payments.error ? (
        <p role="alert">
          Не удалось загрузить график.{" "}
          <button onClick={() => void payments.refetch()}>Повторить</button>
        </p>
      ) : (
        <div className="max-h-64 overflow-auto divide-y">
          {(payments.data ?? [])
            .filter(
              (p) => p.direction === "in" && (p.rental_period ?? p.planned_date).startsWith(period),
            )
            .map((p) => (
              <button
                key={p.id}
                className="w-full flex flex-wrap justify-between gap-2 py-3 text-left text-sm"
                onClick={() => setEditing(p)}
              >
                <span>
                  {formatFinanceDate(p.planned_date)} · {rentalPaymentLabel(p)}
                  <small className="block text-muted-foreground">
                    {statusLabel(effectivePaymentStatus(p))}
                  </small>
                </span>
                <strong>{formatAdeskMoney(p.amount)}</strong>
              </button>
            ))}
          {!(payments.data ?? []).some(
            (p) => p.direction === "in" && (p.rental_period ?? p.planned_date).startsWith(period),
          ) && <p className="text-sm text-muted-foreground">За выбранный период платежей нет</p>}
        </div>
      )}
      {installments && (
        <RentalInstallmentsDialog
          booking={rental}
          onClose={() => setInstallments(false)}
          period={period}
          defaultTotal={plan.rent ?? undefined}
          defaultFee={plan.fee ?? undefined}
          defaultAccount={account}
        />
      )}
      <PaymentDialog
        open={!!adding || !!editing}
        onOpenChange={(v) => {
          if (!v) {
            setAdding(null);
            setEditing(null);
            void payments.refetch();
          }
        }}
        payment={editing}
        defaultDirection="in"
        defaultBookingId={booking.id}
        defaultPropertyId={booking.property_id}
        defaultRentalComponent={adding ?? undefined}
        defaultDate={today}
        defaultAccount={account}
        defaultRentalPeriod={period}
      />
    </section>
  );
}
