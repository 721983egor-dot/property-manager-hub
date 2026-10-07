import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  fetchFinanceAccounts,
  createFinanceAccount,
  archiveFinanceAccount,
  FINANCE_ACCOUNT_TYPES,
  type FinanceAccountType,
} from "@/lib/finance-accounts";
export function FinanceAccountsSettings() {
  const [name, setName] = useState("");
  const [type, setType] = useState<FinanceAccountType>("bank");
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["finance-accounts"], queryFn: fetchFinanceAccounts });
  const mutation = useMutation({
    mutationFn: async (action: { id: string; archived: boolean } | null) => {
      if (action) await archiveFinanceAccount(action.id, action.archived);
      else await createFinanceAccount(name, type);
    },
    onSuccess: (_, action) => {
      if (!action) setName("");
      void qc.invalidateQueries({ queryKey: ["finance-accounts"] });
      toast.success("Счета сохранены");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="fa-panel mt-6">
      <h2>Счета</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Добавьте расчётные счета, карты и наличные. Счёт выбирается при добавлении прихода или
        расхода. Архивные счета сохраняются в истории операций и отчётах.
      </p>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(null);
        }}
      >
        <Input
          aria-label="Название счёта"
          placeholder="Например, карта РМ"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-sm"
        />
        <select
          aria-label="Тип счёта"
          value={type}
          onChange={(e) => setType(e.target.value as FinanceAccountType)}
          className="border px-3"
        >
          {Object.entries(FINANCE_ACCOUNT_TYPES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          disabled={!name.trim() || mutation.isPending || accounts.isPending || !!accounts.error}
        >
          Добавить счёт
        </Button>
      </form>
      {accounts.isPending && <p className="mt-4">Загрузка счетов…</p>}
      {accounts.error && (
        <p role="alert" className="mt-4 text-destructive">
          Не удалось загрузить счета: {accounts.error.message}
        </p>
      )}
      <div className="mt-4 divide-y">
        {accounts.data?.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <strong>{a.name}</strong>
              <span className="ml-3 text-muted-foreground">
                {FINANCE_ACCOUNT_TYPES[a.type]}
                {a.archived ? " · Архив" : ""}
              </span>
            </div>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ id: a.id, archived: !a.archived })}
            >
              {a.archived ? "Восстановить" : "В архив"}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
