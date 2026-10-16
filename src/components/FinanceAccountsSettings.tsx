import { Pencil } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  fetchFinanceAccounts,
  createFinanceAccount,
  archiveFinanceAccount,
  updateFinanceAccount,
  type FinanceAccount,
  FINANCE_ACCOUNT_TYPES,
  type FinanceAccountType,
} from "@/lib/finance-accounts";
export function FinanceAccountsSettings() {
  const [name, setName] = useState("");
  const [type, setType] = useState<FinanceAccountType>("bank");
  const [editing, setEditing] = useState<FinanceAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<FinanceAccountType>("bank");
  const qc = useQueryClient();
  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Выберите счёт");
      await updateFinanceAccount(editing.id, editName, editType);
    },
    onSuccess: () => {
      try {
        const saved = localStorage.getItem("rm-os-finance-filters");
        if (saved && editing) {
          const prefs = JSON.parse(saved);
          if (prefs.account === editing.name) {
            prefs.account = editName.trim();
            localStorage.setItem("rm-os-finance-filters", JSON.stringify(prefs));
          }
        }
      } catch {
        /* Browser preferences are optional. */
      }
      setEditing(null);
      for (const key of [
        "finance-accounts",
        "payments",
        "finance-summary",
        "finance-counterparties",
        "finance-obligations",
      ]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
      toast.success("Счёт изменён. Все операции сохранены");
    },
    onError: (error: Error) => toast.error(error.message),
  });
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
        расхода. Название и тип счёта можно изменить. Все операции сохранятся при переименовании.
        Архивные счета остаются в истории и отчётах.
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
          <div key={a.id} className="py-3">
            {editing?.id === a.id ? (
              <form
                className="flex flex-wrap items-center gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  editMutation.mutate();
                }}
              >
                <Input
                  aria-label="Новое название счёта"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="max-w-sm"
                  autoFocus
                  disabled={editMutation.isPending}
                />
                <select
                  aria-label="Новый тип счёта"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as FinanceAccountType)}
                  className="border px-3 py-2"
                  disabled={editMutation.isPending}
                >
                  {Object.entries(FINANCE_ACCOUNT_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <Button type="submit" disabled={!editName.trim() || editMutation.isPending}>
                  Сохранить
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={editMutation.isPending}
                  onClick={() => setEditing(null)}
                >
                  Отмена
                </Button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong>{a.name}</strong>
                  <span className="ml-3 text-muted-foreground">
                    {FINANCE_ACCOUNT_TYPES[a.type]}
                    {a.archived ? " · Архив" : ""}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={mutation.isPending || editMutation.isPending}
                    onClick={() => {
                      setEditing(a);
                      setEditName(a.name);
                      setEditType(a.type);
                    }}
                  >
                    <Pencil size={15} />
                    Редактировать
                  </Button>
                  <Button
                    variant="outline"
                    disabled={mutation.isPending || editMutation.isPending}
                    onClick={() => mutation.mutate({ id: a.id, archived: !a.archived })}
                  >
                    {a.archived ? "Восстановить" : "В архив"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
