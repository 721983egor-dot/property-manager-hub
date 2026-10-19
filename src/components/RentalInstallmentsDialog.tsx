import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { fetchFinanceAccounts } from "@/lib/finance-accounts";
import { createRentalInstallments, type FinanceClientRental } from "@/lib/finance-workspace";
import { financeToday } from "@/lib/finance-payment-status";
import { formatAdeskMoney as money } from "@/lib/finance";

export function RentalInstallmentsDialog({
  booking,
  onClose,
  period,
  defaultTotal,
  defaultFee,
  defaultAccount,
}: {
  booking: FinanceClientRental;
  onClose: () => void;
  period?: string | undefined;
  defaultTotal?: number | undefined;
  defaultFee?: number | undefined;
  defaultAccount?: string | undefined;
}) {
  const today = financeToday();
  const qc = useQueryClient();
  const [total, setTotal] = useState(String(defaultTotal ?? booking.price_month ?? ""));
  const [fee, setFee] = useState(defaultFee == null ? "" : String(defaultFee));
  const [advance, setAdvance] = useState("");
  const [advanceDate, setAdvanceDate] = useState(today);
  const [balanceDate, setBalanceDate] = useState(
    booking.start_date > today ? booking.start_date : today,
  );
  const [account, setAccount] = useState(defaultAccount ?? "");
  const [requestId] = useState(() => crypto.randomUUID());
  const accounts = useQuery({ queryKey: ["finance-accounts"], queryFn: fetchFinanceAccounts });
  const valid =
    Number(total) > Number(advance) &&
    Number(advance) > 0 &&
    fee !== "" &&
    Number(fee) >= 0 &&
    Number(fee) <= Number(advance) &&
    !!account &&
    !!advanceDate &&
    balanceDate >= advanceDate;
  const save = useMutation({
    mutationFn: () =>
      createRentalInstallments({
        bookingId: booking.id,
        period: period ?? balanceDate.slice(0, 7),
        total: Number(total),
        fee: Number(fee),
        advance: Number(advance),
        advanceDate,
        balanceDate,
        account,
        requestId,
      }),
    onSuccess: () => {
      for (const key of ["payments", "finance-obligations", "finance-owner-settlements"])
        void qc.invalidateQueries({ queryKey: [key] });
      toast.success("Предоплата и остаток добавлены в календарь");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Предоплата и остаток</DialogTitle>
          <DialogDescription>
            {booking.clients?.full_name} · одна аренда, два платежа {period ? `· ${period}` : ""}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate();
          }}
        >
          <label>
            Аренда за расчётный период, ₽
            <input
              className="block w-full rounded border p-2"
              aria-label="Общая аренда"
              type="number"
              min="0.01"
              step="0.01"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              required
            />
          </label>
          <label>
            Комиссия компании за расчётный период, ₽
            <input
              className="block w-full rounded border p-2"
              aria-label="Фиксированная комиссия"
              type="number"
              min="0"
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              Предоплата, ₽
              <input
                className="block w-full rounded border p-2"
                aria-label="Сумма предоплаты"
                type="number"
                min="0.01"
                step="0.01"
                value={advance}
                onChange={(e) => setAdvance(e.target.value)}
                required
              />
            </label>
            <label>
              Дата предоплаты
              <input
                className="block w-full rounded border p-2"
                aria-label="Дата предоплаты"
                type="date"
                value={advanceDate}
                onChange={(e) => setAdvanceDate(e.target.value)}
                required
              />
            </label>
          </div>
          <label>
            Дата остатка при заезде
            <input
              className="block w-full rounded border p-2"
              aria-label="Дата остатка"
              type="date"
              value={balanceDate}
              onChange={(e) => setBalanceDate(e.target.value)}
              required
            />
          </label>
          <label>
            Счёт поступления
            <select
              className="block w-full rounded border p-2"
              aria-label="Счёт предоплаты"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
            >
              <option value="">Выберите счёт</option>
              {accounts.data
                ?.filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          {accounts.error && <p role="alert">Не удалось загрузить счета.</p>}
          {Number(advance) > 0 &&
            Number(total) > Number(advance) &&
            fee !== "" &&
            Number(fee) <= Number(advance) && (
              <div className="rounded border bg-muted p-3 text-sm space-y-2">
                <p>
                  Предоплата {money(Number(advance))}: компания {money(Number(fee))}, собственнику{" "}
                  {money(Number(advance) - Number(fee))}.
                </p>
                <p>Остаток {money(Number(total) - Number(advance))} — собственнику.</p>
                <p className="font-semibold">
                  Всего собственнику от аренды: {money(Number(total) - Number(fee))}.
                </p>
              </div>
            )}
          <p className="text-sm text-muted-foreground">
            Комиссия удерживается целиком из предоплаты. Платежи сегодня и в прошлом считаются
            проведёнными; будущие останутся планом. Перевод собственнику подтверждается отдельно. За
            месяц без других арендных операций. Суммы и даты созданной пары закреплены в графике.
          </p>
          <Button type="submit" disabled={!valid || save.isPending}>
            {save.isPending ? "Добавляем…" : "Добавить два платежа в календарь"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
