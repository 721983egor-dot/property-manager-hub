import { bankPayments } from "@/lib/finance-company-model";
import { paymentCashDate } from "@/lib/finance-calendar-model";
import { paymentFactAmount } from "@/lib/finance-payment-status";
import { useFinanceToday } from "@/hooks/use-finance-today";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  counterpartyLabel,
  fetchPayments,
  formatAdeskMoney,
  formatFinanceDate,
  kindLabel,
  markPaymentPaid,
  financePropertyLabel,
  statusLabel,
  effectivePaymentStatus,
  type Payment,
  type PaymentDirection,
} from "@/lib/finance";

export function FinanceDayCard({
  date,
  forecasts = [],
  onClose,
  onEdit,
  onAdd,
}: {
  date: string | null;
  forecasts?: Payment[];
  onClose: () => void;
  onEdit: (payment: Payment) => void;
  onAdd: (date: string, direction: PaymentDirection) => void;
}) {
  const today = useFinanceToday();
  const queryClient = useQueryClient();
  const markPaid = useMutation({
    mutationFn: (id: string) => markPaymentPaid(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Операция проведена");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Не удалось провести операцию"),
  });
  const {
    data: history = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["payments", "calendar-history"],
    queryFn: () => fetchPayments(),
    enabled: Boolean(date),
  });
  const payments = [...bankPayments(history), ...forecasts].filter(
    (p) =>
      p.planned_date === date || (paymentFactAmount(p, today) > 0 && paymentCashDate(p) === date),
  );
  const income = payments.filter((p) => p.direction === "in").reduce((sum, p) => sum + p.amount, 0);
  const expense = payments
    .filter((p) => p.direction === "out")
    .reduce((sum, p) => sum + p.amount, 0);
  return (
    <Sheet
      open={Boolean(date)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="finance-detail-sheet">
        <SheetHeader>
          <SheetTitle>Операции за {date ? formatFinanceDate(date) : ""}</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 p-5">
          <p className="text-sm text-muted-foreground">
            Все операции дня, независимо от фильтров календаря. Нажмите на операцию, чтобы изменить
            её.
          </p>
          <div className="flex gap-3">
            <Button onClick={() => date && onAdd(date, "in")}>+ Приход</Button>
            <Button onClick={() => date && onAdd(date, "out")}>− Расход</Button>
          </div>
          {isLoading ? (
            <p>Загрузка…</p>
          ) : error ? (
            <p role="alert">Не удалось загрузить операции. Попробуйте открыть день снова.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 rounded border p-3 text-sm">
                <div>
                  Приход<p className="text-emerald-600">{formatAdeskMoney(income)}</p>
                </div>
                <div>
                  Расход<p className="text-red-600">{formatAdeskMoney(expense)}</p>
                </div>
                <div>
                  Сальдо<p>{formatAdeskMoney(income - expense)}</p>
                </div>
              </div>
              {payments.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">В этот день операций нет.</p>
              )}
              <div>
                {payments.map((payment) => (
                  <div key={payment.id} className="flex items-start gap-3 border-b py-4">
                    <button
                      type="button"
                      onClick={() => onEdit(payment)}
                      className="flex min-w-0 flex-1 items-start justify-between gap-4 text-left hover:bg-muted/40"
                    >
                      <span>
                        <strong className="block">
                          {payment.article?.name ?? kindLabel(payment.kind)}
                        </strong>
                        <span className="block text-sm text-muted-foreground">
                          {counterpartyLabel(payment)}
                        </span>
                        <span className="block text-sm">{payment.comment}</span>
                        <span className="block text-sm text-muted-foreground">
                          {payment.property
                            ? financePropertyLabel(payment.property)
                            : "Без объекта"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {statusLabel(effectivePaymentStatus(payment, today))} · {payment.account}
                        </span>
                      </span>
                      <strong
                        className={payment.direction === "in" ? "text-emerald-600" : "text-red-600"}
                      >
                        {formatAdeskMoney(
                          payment.direction === "in" ? payment.amount : -payment.amount,
                          true,
                        )}
                      </strong>
                    </button>
                    {effectivePaymentStatus(payment, today) !== "paid" ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label={`Провести операцию: ${payment.article?.name ?? kindLabel(payment.kind)}`}
                        title="Провести операцию"
                        disabled={markPaid.isPending || payment.id.startsWith("owner-forecast:")}
                        onClick={() => markPaid.mutate(payment.id)}
                      >
                        <Check size={18} />
                      </Button>
                    ) : (
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"
                        title="Операция проведена"
                      >
                        <Check size={18} aria-label="Проведена" />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
