import { useQuery } from "@tanstack/react-query";
import { fetchFinanceAccounts } from "@/lib/finance-accounts";
import { fetchPayments, formatAdeskMoney } from "@/lib/finance";
import { financeAccountBalances } from "@/lib/finance-account-balances";
import { useFinanceToday } from "@/hooks/use-finance-today";

export function FinanceAccountBalances() {
  const today = useFinanceToday();
  const accounts = useQuery({
    queryKey: ["finance-accounts"],
    queryFn: fetchFinanceAccounts,
    refetchInterval: 60000,
  });
  const payments = useQuery({
    queryKey: ["payments", "account-balances"],
    queryFn: () => fetchPayments(),
    refetchInterval: 60000,
  });
  const loading = accounts.isPending || payments.isPending;
  const error = accounts.error || payments.error;
  const balance = financeAccountBalances(accounts.data ?? [], payments.data ?? [], today);
  return (
    <aside
      aria-label="Остатки на счетах"
      className="w-full max-w-xs rounded-lg border bg-background px-4 py-3 text-sm shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2 className="font-semibold">На счетах</h2>
        <span className="text-xs text-muted-foreground">Сейчас</span>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          Не удалось загрузить остатки.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void accounts.refetch();
              void payments.refetch();
            }}
          >
            Повторить
          </button>
        </p>
      ) : loading ? (
        <p className="text-muted-foreground">Загрузка…</p>
      ) : (
        <>
          <dl className="space-y-2">
            {balance.accounts.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-4">
                <dt className="min-w-0 break-words text-muted-foreground">{a.name}</dt>
                <dd className="shrink-0 tabular-nums">{formatAdeskMoney(a.balance)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex justify-between gap-4 border-t pt-2 font-semibold">
            <span>Всего</span>
            <span className="tabular-nums">{formatAdeskMoney(balance.total)}</span>
          </div>
        </>
      )}
    </aside>
  );
}
