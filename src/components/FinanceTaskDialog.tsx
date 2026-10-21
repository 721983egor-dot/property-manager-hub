import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchBooking } from "@/lib/bookings";
import { formatAdeskMoney, formatFinanceDate } from "@/lib/finance";
import { financeToday } from "@/lib/finance-payment-status";
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
  const [amount, setAmount] = useState(String(f.remaining));
  const [date, setDate] = useState(financeToday());
  const [bookingOpen, setBookingOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const booking = useQuery({
    queryKey: ["finance-task-booking", f.bookingId],
    queryFn: () => fetchBooking(f.bookingId),
    enabled: open && bookingOpen,
  });
  const changed =
    task.due_date !== snapshot.due_date ||
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
        throw new Error("Укажите полученную сумму в пределах остатка");
      const result = await supabase.rpc("finance_confirm_task_receipt", {
        p_payment: f.paymentId!,
        p_booking: f.bookingId,
        p_expected_amount: f.amount,
        p_expected_paid: Math.round((f.amount - f.remaining) * 100) / 100,
        p_expected_date: snapshot.due_date!,
        p_expected_account: f.account,
        p_paid_total: Math.round((f.amount - f.remaining + n) * 100) / 100,
        p_paid_date: date,
      });
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await refresh();
      onOpenChange(false);
      toast.success("Поступление записано в существующем платеже");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось записать поступление"),
  });
  return (
    <>
      <Dialog
        open={open && !bookingOpen && !payoutOpen}
        onOpenChange={(v) => {
          if (!confirm.isPending) onOpenChange(v);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{task.title}</DialogTitle>
            <DialogDescription>
              Задача связана с бронью. Дата, сумма и статья берутся из её платежей.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Дата</dt>
              <dd>{formatFinanceDate(snapshot.due_date ?? "")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Осталось {f.kind === "receipt" ? "получить" : "выплатить"}
              </dt>
              <dd className="font-semibold">{formatAdeskMoney(f.remaining)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Статья</dt>
              <dd>{f.articleName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {f.kind === "receipt" ? "Клиент" : "Собственник"}
              </dt>
              <dd>{f.partyName}</dd>
            </div>
          </dl>
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {task.description.split("\n")[0]}
          </p>
          {changed && (
            <p role="alert" className="text-sm text-destructive">
              Условия изменились. Откройте задачу заново, чтобы подтвердить актуальную сумму.
            </p>
          )}
          <Button variant="outline" onClick={() => setBookingOpen(true)}>
            Открыть бронь и условия
          </Button>
          {task.status === "done" ? (
            <p className="text-sm">
              Оплата подтверждена. Изменение фактической операции доступно в финансах.
            </p>
          ) : f.kind === "receipt" ? (
            <div className="space-y-3 border-t pt-3">
              <p className="text-sm">
                Запишите деньги, которые уже получены. Счёт: {f.account}. Новый приход не создаётся.
              </p>
              <label className="text-sm block">
                Получено сейчас, ₽
                <Input
                  aria-label="Получено сейчас"
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
                  aria-label="Дата поступления"
                  type="date"
                  max={financeToday()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <Button disabled={confirm.isPending || changed} onClick={() => confirm.mutate()}>
                {confirm.isPending ? "Сохранение…" : "Подтвердить поступление"}
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
