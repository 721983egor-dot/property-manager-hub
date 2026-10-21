import { confirmScheduledPayment } from "@/lib/finance-task-payment";
import { PaymentDialog } from "./PaymentDialog";
import { fetchFinanceAccounts } from "@/lib/finance-accounts";
import { rescheduleFinanceTask } from "@/lib/finance-task-schedule";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchBooking } from "@/lib/bookings";
import { fetchPayment, formatAdeskMoney, formatFinanceDate } from "@/lib/finance";
import { financeToday } from "@/lib/finance-payment-status";
import { confirmTaskReceipt } from "@/lib/finance-task-receipt";
import { invalidateRentalFinance } from "@/lib/invalidate-rental-finance";
import type { StaffTask } from "@/lib/tasks";
import { BookingDialog } from "./BookingDialog";
import { OwnerPayoutDialog } from "./OwnerPayoutDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function FinanceTaskDialog({
  task,
  open,
  onOpenChange,
}: {
  task: StaffTask;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const qc = useQueryClient();
  const [snapshot] = useState(task);
  const f = snapshot.finance!;
  const incoming = f.kind === "receipt" || (f.kind === "payment" && f.direction === "in");
  const ordinary = f.kind === "payment";
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [amount, setAmount] = useState(String(f.remaining));
  const [account, setAccount] = useState(f.account);
  const [requestId] = useState(() => crypto.randomUUID());
  const [expectedDate, setExpectedDate] = useState(snapshot.due_date || "");
  const accounts = useQuery({
    queryKey: ["finance-accounts"],
    queryFn: fetchFinanceAccounts,
    enabled: open,
  });
  const activeAccounts = accounts.data?.filter((a) => !a.archived) ?? [];
  const [date, setDate] = useState(financeToday());
  const [bookingOpen, setBookingOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const booking = useQuery({
    queryKey: ["finance-task-booking", f.bookingId],
    queryFn: () => fetchBooking(f.bookingId!),
    enabled: open && bookingOpen && !!f.bookingId,
  });
  const payment = useQuery({
    queryKey: ["payments", "task-editor", f.paymentId],
    queryFn: () => fetchPayment(f.paymentId!),
    enabled: open && paymentOpen && !!f.paymentId,
  });
  const changed =
    task.due_date !== snapshot.due_date ||
    task.finance?.paymentUpdatedAt !== f.paymentUpdatedAt ||
    task.finance?.remaining !== f.remaining ||
    task.finance?.amount !== f.amount ||
    task.finance?.account !== f.account ||
    task.finance?.articleId !== f.articleId ||
    task.finance?.obligationId !== f.obligationId ||
    task.finance?.payableNow !== f.payableNow;
  const refresh = async () => {
    await invalidateRentalFinance(qc);
    await qc.invalidateQueries({ queryKey: ["finance-tasks"] });
  };
  const confirm = useMutation({
    mutationFn: async () => {
      if (changed) throw new Error("Условия изменились. Закройте задачу и откройте её заново");
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0 || n > f.remaining)
        throw new Error("Укажите сумму в пределах остатка");
      if (ordinary) {
        await confirmScheduledPayment(supabase, snapshot, n, date, account, requestId);
        return;
      }
      await confirmTaskReceipt(supabase, {
        p_payment: f.paymentId!,
        p_booking: f.bookingId!,
        p_expected_amount: f.amount,
        p_expected_paid: Math.round((f.amount - f.remaining) * 100) / 100,
        p_expected_date: snapshot.due_date!,
        p_expected_account: f.account,
        p_paid_total: Math.round((f.amount - f.remaining + n) * 100) / 100,
        p_paid_date: date,
        p_received_account: account,
        p_request_id: requestId,
      });
    },
    onSuccess: async () => {
      await refresh();
      onOpenChange(false);
      toast.success(
        `${incoming ? "Поступление записано" : "Оплата записана"}. Остаток задачи пересчитан`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось записать поступление"),
  });
  const reschedule = useMutation({
    mutationFn: () => rescheduleFinanceTask(supabase, snapshot, expectedDate),
    onSuccess: async () => {
      await refresh();
      onOpenChange(false);
      toast.success(
        ordinary
          ? "Ожидаемая дата изменена. Другие операции сохранены"
          : "Ожидаемая дата изменена. График брони сохранён",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <Dialog
        open={open && !bookingOpen && !payoutOpen && !paymentOpen}
        onOpenChange={(v) => {
          if (!confirm.isPending && !reschedule.isPending) onOpenChange(v);
        }}
      >
        <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{task.title}</DialogTitle>
            <DialogDescription>
              Задача связана с операцией в финансах. Части оплаты сохраняются отдельно, задача
              закрывается после полной оплаты.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Дата</dt>
              <dd>{formatFinanceDate(snapshot.due_date ?? "")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Осталось {incoming ? "получить" : "оплатить"}
              </dt>
              <dd className="font-semibold">{formatAdeskMoney(f.remaining)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Статья</dt>
              <dd>{f.articleName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {ordinary ? "Контрагент" : incoming ? "Клиент" : "Собственник"}
              </dt>
              <dd>{f.partyName}</dd>
            </div>
          </dl>
          <p className="text-sm">
            Всего: {formatAdeskMoney(f.amount)} · {incoming ? "Получено" : "Оплачено"}:{" "}
            {formatAdeskMoney(f.amount - f.remaining)}
          </p>
          {f.contractDate && (
            <p
              className={
                f.remaining > 0 && f.contractDate < financeToday()
                  ? "text-sm text-destructive"
                  : "text-sm text-muted-foreground"
              }
            >
              {ordinary ? "Первоначальная дата" : "Срок по договору"}:{" "}
              {formatFinanceDate(f.contractDate)}
              {f.remaining > 0 && f.contractDate < financeToday() ? " · Просрочено" : ""}
            </p>
          )}
          {!!f.receipts?.length && (
            <div className="space-y-1 text-sm border-t pt-2">
              {f.receipts.map((r) => (
                <div key={r.id} className="flex justify-between gap-2">
                  <span>
                    {formatFinanceDate(r.date)} · {r.account}
                  </span>
                  <span>{formatAdeskMoney(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {task.status !== "done" && (
            <div className="flex items-end gap-2">
              <label className="text-sm flex-1">
                Ожидаемая дата остатка
                <Input
                  type="date"
                  aria-label="Ожидаемая дата остатка"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </label>
              <Button
                variant="outline"
                disabled={
                  reschedule.isPending ||
                  confirm.isPending ||
                  changed ||
                  !expectedDate ||
                  expectedDate === snapshot.due_date
                }
                onClick={() => reschedule.mutate()}
              >
                Перенести
              </Button>
            </div>
          )}
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {task.description.split("\n")[0]}
          </p>
          {changed && (
            <p role="alert" className="text-sm text-destructive">
              Условия изменились. Откройте задачу заново, чтобы подтвердить актуальную сумму.
            </p>
          )}
          {f.bookingId && (
            <Button variant="outline" onClick={() => setBookingOpen(true)}>
              Открыть бронь и условия
            </Button>
          )}
          {ordinary && (
            <Button
              variant="outline"
              disabled={confirm.isPending || reschedule.isPending}
              onClick={() => setPaymentOpen(true)}
            >
              Изменить платёж
            </Button>
          )}
          {task.status === "done" ? (
            <p className="text-sm">
              Оплата подтверждена. Изменение фактической операции доступно в финансах.
            </p>
          ) : incoming || ordinary ? (
            <div className="space-y-3 border-t pt-3">
              <p className="text-sm">
                Запишите сумму, {incoming ? "полученную" : "оплаченную"} сейчас. Для каждой части
                сохраняются дата и фактический счёт.
              </p>
              <label className="text-sm block">
                Фактический счёт
                <select
                  aria-label={incoming ? "Счёт поступления" : "Счёт оплаты"}
                  className="block w-full border rounded p-2"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                >
                  <option value="">Выберите счёт</option>
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              {accounts.error && (
                <p role="alert" className="text-destructive text-sm">
                  Не удалось загрузить счета
                </p>
              )}
              <label className="text-sm block">
                {incoming ? "Получено" : "Оплачено"} сейчас, ₽
                <Input
                  aria-label={incoming ? "Получено сейчас" : "Оплачено сейчас"}
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={f.remaining}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="text-sm block">
                Фактическая дата
                <Input
                  aria-label={incoming ? "Дата поступления" : "Дата оплаты"}
                  type="date"
                  max={financeToday()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <Button
                disabled={
                  confirm.isPending ||
                  reschedule.isPending ||
                  changed ||
                  !activeAccounts.some((a) => a.name === account)
                }
                onClick={() => confirm.mutate()}
              >
                {confirm.isPending
                  ? "Сохранение…"
                  : incoming
                    ? "Подтвердить поступление"
                    : "Подтвердить оплату"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 border-t pt-3">
              <p className="text-sm">
                Сумма учитывает расходы за счёт собственника. Подтверждено к выплате по полученным
                деньгам: {formatAdeskMoney(f.payableNow)}.
              </p>
              {!f.obligationId && (
                <p className="text-sm text-muted-foreground">
                  Сначала подтвердите поступление от арендатора. После этого появится возможность
                  записать перевод собственнику.
                </p>
              )}
              <Button
                disabled={!f.obligationId || f.payableNow <= 0 || changed}
                onClick={() => setPayoutOpen(true)}
              >
                Отметить выплату собственнику
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {paymentOpen && !payment.data && (
        <Dialog open onOpenChange={() => setPaymentOpen(false)}>
          <DialogContent>
            <DialogTitle>
              {payment.error ? "Не удалось загрузить платёж" : "Загрузка платежа…"}
            </DialogTitle>
            {payment.error && <Button onClick={() => void payment.refetch()}>Повторить</Button>}
          </DialogContent>
        </Dialog>
      )}
      {paymentOpen && payment.data && (
        <PaymentDialog
          open
          payment={payment.data}
          onOpenChange={(v) => {
            setPaymentOpen(v);
            if (!v) {
              void refresh();
              onOpenChange(false);
            }
          }}
        />
      )}
      {bookingOpen && booking.isPending && (
        <Dialog open onOpenChange={() => setBookingOpen(false)}>
          <DialogContent>
            <DialogTitle>Загрузка брони…</DialogTitle>
          </DialogContent>
        </Dialog>
      )}
      {bookingOpen && booking.error && (
        <Dialog open onOpenChange={() => setBookingOpen(false)}>
          <DialogContent>
            <DialogTitle>Не удалось загрузить бронь</DialogTitle>
            <Button onClick={() => void booking.refetch()}>Повторить</Button>
          </DialogContent>
        </Dialog>
      )}
      {bookingOpen && booking.data && (
        <BookingDialog
          open
          onOpenChange={setBookingOpen}
          booking={booking.data}
          onSaved={() => {
            void refresh();
            onOpenChange(false);
          }}
        />
      )}
      {payoutOpen && f.obligationId && (
        <OwnerPayoutDialog
          defaultAccount={f.account}
          obligationId={f.obligationId}
          remaining={f.payableNow}
          onClose={() => {
            setPayoutOpen(false);
            void refresh();
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}
