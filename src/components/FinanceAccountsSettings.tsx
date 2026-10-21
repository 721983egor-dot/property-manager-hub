import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";
import {
  fetchFinanceAccounts,
  createFinanceAccount,
  archiveFinanceAccount,
  updateFinanceAccount,
  fetchFinanceAccountUsage,
  deleteFinanceAccount,
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
  const [showArchived, setShowArchived] = useState(false);
  const [deleting, setDeleting] = useState<FinanceAccount | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const qc = useQueryClient();
  const usage = useQuery({
    queryKey: ["finance-account-usage", deleting?.id],
    queryFn: () => fetchFinanceAccountUsage(deleting!.id),
    enabled: !!deleting,
  });
  const used =
    !!usage.data &&
    (usage.data.payments > 0 ||
      usage.data.deals > 0 ||
      (usage.data.schedules ?? 0) > 0 ||
      (usage.data.receipts ?? 0) > 0);
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleting) throw new Error("Выберите счёт");
      await deleteFinanceAccount(deleting.id, used ? transferTo : null);
    },
    onSuccess: () => {
      try {
        const saved = localStorage.getItem("rm-os-finance-filters");
        if (saved && deleting) {
          const prefs = JSON.parse(saved);
          if (prefs.account === deleting.name) {
            prefs.account = accounts.data?.find((a) => a.id === transferTo)?.name ?? "all";
            localStorage.setItem("rm-os-finance-filters", JSON.stringify(prefs));
          }
        }
      } catch {
        /* Optional preferences. */
      }
      setDeleting(null);
      setEditing(null);
      setTransferTo("");
      for (const key of [
        "finance-accounts",
        "finance-account-usage",
        "payments",
        "finance-summary",
        "finance-counterparties",
        "crm-commission-payments",
        "deals",
      ]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
      toast.success("Счёт удалён. История операций сохранена");
    },
    onError: (error: Error) => toast.error(error.message),
  });
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
        Архивные счета скрыты из основного списка. При удалении счёта его операции можно перенести
        на другой счёт.
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
      {!!accounts.data?.some((a) => a.archived) && (
        <Button
          type="button"
          variant="ghost"
          className="mt-3"
          aria-pressed={showArchived}
          onClick={() => {
            setShowArchived((v) => !v);
            setEditing(null);
          }}
        >
          {showArchived
            ? "Скрыть архив"
            : `Показать архив (${accounts.data.filter((a) => a.archived).length})`}
        </Button>
      )}
      <div className="mt-4 divide-y">
        {accounts.data
          ?.filter((a) => !a.archived || showArchived)
          .map((a) => (
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
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive"
                      disabled={
                        mutation.isPending || editMutation.isPending || deleteMutation.isPending
                      }
                      aria-label={`Удалить счёт ${a.name}`}
                      onClick={() => {
                        setDeleting(a);
                        setTransferTo("");
                      }}
                    >
                      <Trash2 size={15} />
                      Удалить
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleting(null);
            setTransferTo("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить счёт «{deleting?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {used
                ? `На счёте ${usage.data?.payments ?? 0} операций и ${usage.data?.deals ?? 0} связанных сделок, ${usage.data?.schedules ?? 0} графиков аренды и ${usage.data?.receipts ?? 0} платежей с частями поступлений. Выберите действующий счёт для их переноса. Суммы, даты и статусы операций сохранятся. Старый счёт будет удалён.`
                : usage.isPending
                  ? "Проверяем связанные операции перед удалением."
                  : "На счёте нет операций и связанных сделок. Счёт будет удалён без возможности восстановления."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {usage.isPending && <p role="status">Проверка операций счёта…</p>}
          {usage.error && (
            <p role="alert" className="text-destructive">
              Не удалось проверить счёт: {usage.error.message}
            </p>
          )}
          {used && (
            <label className="space-y-2 text-sm">
              Перенести операции и сделки на счёт
              <select
                className="block w-full rounded border p-2"
                aria-label="Счёт для переноса"
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                disabled={deleteMutation.isPending}
              >
                <option value="">Выберите счёт</option>
                {accounts.data
                  ?.filter((a) => !a.archived && a.id !== deleting?.id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
              {!accounts.data?.some((a) => !a.archived && a.id !== deleting?.id) && (
                <p>Сначала создайте другой действующий счёт.</p>
              )}
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              disabled={
                usage.isPending ||
                !!usage.error ||
                deleteMutation.isPending ||
                (used && !transferTo)
              }
              onClick={(event) => {
                event.preventDefault();
                deleteMutation.mutate();
              }}
            >
              {used ? "Перенести и удалить счёт" : "Удалить счёт"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
