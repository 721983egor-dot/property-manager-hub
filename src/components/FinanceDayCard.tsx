import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  counterpartyLabel,
  fetchPayments,
  formatAdeskMoney,
  formatFinanceDate,
  kindLabel,
  statusLabel,
  effectivePaymentStatus,
  type Payment,
  type PaymentDirection,
} from "@/lib/finance";

export function FinanceDayCard({
  date,
  onClose,
  onEdit,
  onAdd,
}: {
  date: string | null;
  onClose: () => void;
  onEdit: (payment: Payment) => void;
  onAdd: (date: string, direction: PaymentDirection) => void;
}) {
  const {
    data: payments = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["payments", "day", date],
    queryFn: () => fetchPayments({ from: date!, to: date! }),
    enabled: Boolean(date),
  });
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
                  <button
                    key={payment.id}
                    onClick={() => onEdit(payment)}
                    className="flex w-full items-start justify-between gap-4 border-b py-4 text-left hover:bg-muted/40"
                  >
                    <span>
                      <strong className="block">
                        {payment.article?.name ?? kindLabel(payment.kind)}
                      </strong>
                      <span className="block text-sm text-muted-foreground">
                        {counterpartyLabel(payment)}
                      </span>
                      <span className="block text-sm">{payment.comment}</span>
                      <span className="text-xs text-muted-foreground">
                        {statusLabel(effectivePaymentStatus(payment))} · {payment.account}
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
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
