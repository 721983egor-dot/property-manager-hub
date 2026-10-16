import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { fetchFinanceAccounts } from "@/lib/finance-accounts";
import { payOwnerSettlement } from "@/lib/finance-owner-settlements";
import { financeToday } from "@/lib/finance-payment-status";
import { formatAdeskMoney } from "@/lib/finance";
export function OwnerPayoutDialog({
  obligationId,
  remaining,
  onClose,
}: {
  obligationId: string;
  remaining: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(remaining)),
    [account, setAccount] = useState(""),
    [date, setDate] = useState(financeToday()),
    [requestId] = useState(() => crypto.randomUUID());
  const accounts = useQuery({ queryKey: ["finance-accounts"], queryFn: fetchFinanceAccounts });
  const active = accounts.data?.filter((a) => !a.archived) ?? [];
  const save = useMutation({
    mutationFn: () => payOwnerSettlement(obligationId, Number(amount), account, date, requestId),
    onSuccess: () => {
      for (const key of ["payments", "finance-obligations", "finance-owner-settlements"])
        void qc.invalidateQueries({ queryKey: [key] });
      onClose();
      toast.success("Выплата записана, задолженность уменьшена");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !save.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Подтвердить перевод собственнику</DialogTitle>
          <DialogDescription>
            Запишите уже выполненный перевод. Остаток долга: {formatAdeskMoney(remaining)}. Можно
            указать частичную выплату.
          </DialogDescription>
        </DialogHeader>
        <label>
          Сумма
          <Input
            aria-label="Сумма выплаты"
            type="number"
            min="0.01"
            max={remaining}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          Счёт
          <select
            className="block w-full border rounded p-2 mt-1"
            aria-label="Счёт выплаты"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="">Выберите счёт</option>
            {active.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {accounts.error && <p role="alert">Не удалось загрузить счета</p>}
        <label>
          Фактическая дата
          <Input
            aria-label="Дата выплаты"
            type="date"
            max={financeToday()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <Button
          disabled={
            save.isPending ||
            !active.some((a) => a.name === account) ||
            !date ||
            date > financeToday() ||
            !Number.isFinite(Number(amount)) ||
            Number(amount) <= 0 ||
            Number(amount) > remaining
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Сохраняем…" : "Записать выплату"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
