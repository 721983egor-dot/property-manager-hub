import { useState } from "react";
import { Undo2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { confirmationSource } from "@/lib/finance-confirmation";
import { loadConfirmation, reverseConfirmation } from "@/lib/finance-confirmation-client";
import { invalidateRentalFinance } from "@/lib/invalidate-rental-finance";
import { formatAdeskMoney, type Payment } from "@/lib/finance";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";

export function PaymentUndoButton({ payment, disabled }: { payment: Payment; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState("");
  const qc = useQueryClient();
  const { paymentId, receiptId } = confirmationSource(payment);
  const snapshot = useQuery({
    queryKey: ["payment-confirmation", paymentId, requestId],
    queryFn: () => loadConfirmation(paymentId),
    enabled: open,
    staleTime: Infinity,
  });
  const undo = useMutation({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error("Дождитесь загрузки операции");
      await reverseConfirmation(paymentId, receiptId, snapshot.data, requestId);
    },
    onSuccess: async () => {
      await invalidateRentalFinance(qc);
      setOpen(false);
      toast.success("Подтверждение отменено. Остатки и задачи пересчитаны");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Не удалось отменить подтверждение"),
  });
  const events = (snapshot.data?.cash_receipts ?? []) as {
    id: string;
    amount: number;
    account: string;
  }[];
  const selectedReceipt = receiptId ? events.find((e) => e.id === receiptId) : events.at(-1);
  const reversedAmount =
    selectedReceipt?.amount ??
    snapshot.data?.paid_amount ??
    snapshot.data?.amount ??
    payment.amount;
  const reversedAccount = selectedReceipt?.account ?? snapshot.data?.account ?? payment.account;
  if (paymentId.startsWith("owner-forecast:") || payment.rental_component === "owner_plan")
    return null;
  return (
    <>
      <button
        type="button"
        aria-label="Отменить подтверждение оплаты"
        title="Отменить подтверждение"
        className="grid size-8 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-2"
        disabled={disabled || undo.isPending}
        onClick={(e) => {
          e.stopPropagation();
          setRequestId(crypto.randomUUID());
          setOpen(true);
        }}
      >
        <Undo2 size={16} />
      </button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!undo.isPending) setOpen(v);
        }}
      >
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Отменить подтверждение?</DialogTitle>
            <DialogDescription>
              {receiptId
                ? "Будет отменена только выбранная часть поступления. Остальные оплаты сохранятся."
                : "Отменённая сумма снова появится к получению или выплате. Остальные частичные оплаты сохранятся; остатки и задачи пересчитаются."}{" "}
              {/^(company|owner):/.test(payment.id) &&
                " Отменяется исходная оплата целиком, включая доли компании и собственника."}{" "}
              Это исправление учёта, деньги по банку не переводятся.
            </DialogDescription>
          </DialogHeader>
          <p className="font-medium">
            Платёж: {formatAdeskMoney(Number(reversedAmount))} · {reversedAccount}
          </p>
          {snapshot.error && (
            <p role="alert" className="text-sm text-destructive">
              Не удалось загрузить операцию. Закройте окно и попробуйте снова.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={undo.isPending} onClick={() => setOpen(false)}>
              Назад
            </Button>
            <Button disabled={!snapshot.data || undo.isPending} onClick={() => undo.mutate()}>
              {undo.isPending ? "Отменяем…" : "Отменить подтверждение"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
