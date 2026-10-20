import { supabase } from "@/integrations/supabase/client";
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
  const cashTerms = useQuery({
    queryKey: ["finance-booking-cash-terms", booking.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_booking_cash_terms")
        .select("receipts_from,owner_rates,collection_plan")
        .eq("id", booking.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const rental = {
    ...booking,
    booking_price_periods: booking.periods,
    clients: booking.client,
    deposit: booking.deposit ?? 0,
  };
  const plan = rentalMonthPlan(rental, period, fee, feeType);
  const periodReceipts = (payments.data ?? []).filter(
    (p) =>
      p.direction === "in" && p.rental_component === "rent" && p.rental_period === `${period}-01`,
  );
  const cashBlocked = !!cashTerms.data && !!plan.due && plan.due < cashTerms.data.receipts_from;
  const separatePlan = cashTerms.data?.collection_plan != null;
  const actualFee = cashBlocked
    ? 0
    : cashTerms.data && periodReceipts.length
      ? periodReceipts.reduce((n, p) => n + (p.company_fee ?? 0), 0)
      : plan.fee;
  return (
    <section className="rounded-lg border p-4 space-y-3">
      <h3 className="font-medium">Платежи по брони</h3>
      <p className="text-xs text-muted-foreground">
        График аренды создаётся из условий брони. Получение денег отмечайте в существующем платеже.
        Предоплата и остаток заменяют один платёж графика, без второго прихода.
      </p>
      {cashTerms.data && (
        <p className="text-sm">
          Первое новое поступление: {formatFinanceDate(cashTerms.data.receipts_from)}.
          {separatePlan
            ? " Действует отдельный согласованный график. Суммы поступлений и комиссии фиксированы; при изменении цены обновите этот график."
            : " Индивидуальные суммы собственнику учтены в графике."}
        </p>
      )}
      {cashTerms.error && (
        <p role="alert" className="text-sm">
          Не удалось проверить индивидуальные условия брони.
        </p>
      )}
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
      {cashBlocked ? (
        <p className="text-sm">
          Аренда оплачена ранее. Нового поступления и комиссии компании за этот период нет.
        </p>
      ) : separatePlan ? (
        <p className="text-sm">
          {periodReceipts.length
            ? `Поступление по графику: ${formatAdeskMoney(periodReceipts.reduce((n, p) => n + p.amount, 0))} · компания: ${formatAdeskMoney(actualFee ?? 0)}`
            : "Отдельного поступления в этом месяце нет: оплата включена в согласованный график."}
        </p>
      ) : (
        plan.scheduled && (
          <p className="text-sm">
            Аренда: {plan.rent == null ? "уточните цену" : formatAdeskMoney(plan.rent)} · компания:{" "}
            {actualFee == null ? "уточните комиссию" : formatAdeskMoney(actualFee)}
          </p>
        )
      )}
      {booking.status === "active" && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={
              separatePlan ||
              cashBlocked ||
              !!cashTerms.error ||
              !plan.scheduled ||
              plan.rent == null ||
              actualFee == null
            }
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
          defaultFee={actualFee ?? undefined}
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
