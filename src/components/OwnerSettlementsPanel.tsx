import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { fetchFinanceAccounts } from "@/lib/finance-accounts";
import { formatAdeskMoney, type Payment } from "@/lib/finance";
import type { FinanceCounterparty, FinanceObligation } from "@/lib/finance-counterparties";
import type { FinanceObjectAssignment } from "@/lib/finance-objects";
import {
  fetchOwnerSettlements,
  saveOwnerPayoutSettings,
  createOwnerSettlement,
  payOwnerSettlement,
} from "@/lib/finance-owner-settlements";
import { ownerSettlementState } from "@/lib/finance-owner-model";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function OwnerSettlementsPanel({
  propertyId,
  suggestedAmount,
  month,
  settings,
  parties,
  obligations,
  payments,
}: {
  propertyId: string;
  suggestedAmount?: number | null;
  month: string;
  settings?: FinanceObjectAssignment | undefined;
  parties: FinanceCounterparty[];
  obligations: FinanceObligation[];
  payments: Payment[];
}) {
  const qc = useQueryClient();
  const [owner, setOwner] = useState(settings?.owner_counterparty_id ?? "");
  const [day, setDay] = useState(String(settings?.payout_day ?? 5));
  const [amount, setAmount] = useState(""),
    [entity, setEntity] = useState("");
  const [pay, setPay] = useState<{
    obligation: FinanceObligation;
    amount: string;
    account: string;
    date: string;
    requestId: string;
  } | null>(null);
  useEffect(() => {
    setOwner(settings?.owner_counterparty_id ?? "");
    setDay(String(settings?.payout_day ?? 5));
  }, [settings?.owner_counterparty_id, settings?.payout_day]);
  const settlements = useQuery({
    queryKey: ["finance-owner-settlements", propertyId],
    queryFn: () => fetchOwnerSettlements(propertyId),
  });
  const accounts = useQuery({ queryKey: ["finance-accounts"], queryFn: fetchFinanceAccounts });
  const invalidate = () => {
    for (const key of [
      "finance-owner-settlements",
      "finance-object-settings",
      "finance-obligations",
      "payments",
    ])
      void qc.invalidateQueries({ queryKey: [key] });
  };
  const save = useMutation({
    mutationFn: () => saveOwnerPayoutSettings(propertyId, owner, Number(day)),
    onSuccess: () => {
      invalidate();
      toast.success("Условия выплаты сохранены");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const create = useMutation({
    mutationFn: () => createOwnerSettlement(propertyId, month, Number(amount), entity),
    onSuccess: () => {
      setAmount("");
      invalidate();
      toast.success("Расчёт создан: сумма учтена в долге собственнику");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const payout = useMutation({
    mutationFn: async () => {
      if (!pay) throw new Error("Выберите расчёт");
      await payOwnerSettlement(
        pay.obligation.id,
        Number(pay.amount),
        pay.account,
        pay.date,
        pay.requestId,
      );
    },
    onSuccess: () => {
      setPay(null);
      invalidate();
      toast.success("Выплата записана, долг пересчитан");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const active = accounts.data?.filter((a) => !a.archived) ?? [];
  const existing = settlements.data?.some((s) => s.period === month + "-01");
  return (
    <section className="fa-panel mt-5">
      <h2>Расчёты с собственником</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Подтвердите сумму за месяц после удержания комиссии и расходов собственника. Остаток — наш
        долг; после даты выплаты он становится просроченным. Для 29–31 числа в коротком месяце
        используется последний день месяца.
      </p>
      <form
        className="flex flex-wrap items-end gap-3 mb-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="flex flex-col gap-1">
          Собственник
          <select
            aria-label="Собственник для выплаты"
            className="border p-2"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">Выберите контрагента</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          День выплаты
          <Input
            aria-label="День выплаты собственнику"
            type="number"
            min={1}
            max={31}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="w-28"
          />
        </label>
        <Button
          type="submit"
          variant="outline"
          disabled={
            save.isPending ||
            !owner ||
            !Number.isInteger(Number(day)) ||
            Number(day) < 1 ||
            Number(day) > 31
          }
        >
          Сохранить условия
        </Button>
      </form>
      <form
        className="flex flex-wrap items-end gap-3 mb-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label className="flex flex-col gap-1">
          К выплате за {month}
          <Input
            aria-label="Сумма собственнику за месяц"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {suggestedAmount != null && suggestedAmount > 0 && (
            <button
              type="button"
              className="fa-debt-link text-sm"
              onClick={() => setAmount(String(suggestedAmount))}
            >
              Из аренды: {formatAdeskMoney(suggestedAmount)} до расходов
            </button>
          )}
        </label>
        <label className="flex flex-col gap-1">
          Юридическое лицо
          <Input
            aria-label="Юридическое лицо расчёта"
            placeholder="ИП / организация"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          />
        </label>
        <Button
          type="submit"
          disabled={
            create.isPending ||
            settlements.isPending ||
            !!settlements.error ||
            existing ||
            !settings?.owner_counterparty_id ||
            !settings?.payout_day ||
            !Number.isFinite(Number(amount)) ||
            Number(amount) <= 0 ||
            !entity.trim()
          }
        >
          {existing ? "Расчёт за месяц уже есть" : "Создать расчёт"}
        </Button>
      </form>
      {settlements.isPending && <p>Загрузка расчётов…</p>}
      {settlements.error && (
        <p role="alert">Не удалось загрузить расчёты: {settlements.error.message}</p>
      )}
      <div className="fa-table-scroll">
        <table className="fa-table">
          <thead>
            <tr>
              <th>Месяц</th>
              <th>Собственник</th>
              <th>Дата выплаты</th>
              <th>Начислено</th>
              <th>Выплачено</th>
              <th>Осталось</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {settlements.data?.map((s) => {
              const o = obligations.find((x) => x.id === s.obligation_id);
              if (!o)
                return (
                  <tr key={s.id}>
                    <td colSpan={8}>Обновляется расчёт за {s.period.slice(0, 7)}…</td>
                  </tr>
                );
              const state = ownerSettlementState(o, payments, today());
              return (
                <tr key={s.id}>
                  <td>{s.period.slice(0, 7)}</td>
                  <td>
                    <Link to="/finance/counterparties/$id" params={{ id: o.counterparty_id }}>
                      {parties.find((p) => p.id === o.counterparty_id)?.name ?? "Собственник"}
                    </Link>
                  </td>
                  <td>{o.planned_date}</td>
                  <td>{formatAdeskMoney(o.amount)}</td>
                  <td>{formatAdeskMoney(state.paid)}</td>
                  <td className={state.overdue ? "fa-negative" : ""}>
                    {formatAdeskMoney(o.status === "closed" ? 0 : state.remaining)}
                  </td>
                  <td>{state.label}</td>
                  <td>
                    {o.status === "open" && state.remaining > 0 && (
                      <Button
                        disabled={accounts.isPending || !!accounts.error || !active.length}
                        onClick={() =>
                          setPay({
                            obligation: o,
                            amount: String(state.remaining),
                            account: active[0]?.name ?? "",
                            date: today(),
                            requestId: crypto.randomUUID(),
                          })
                        }
                      >
                        Выплачено
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!settlements.isPending && !settlements.error && !settlements.data?.length && (
        <p className="mt-3 text-muted-foreground">
          Расчётов пока нет. Укажите условия и создайте расчёт за выбранный месяц.
        </p>
      )}
      {accounts.error && <p role="alert">Не удалось загрузить счета</p>}
      <Dialog
        open={!!pay}
        onOpenChange={(open) => {
          if (!open && !payout.isPending) setPay(null);
        }}
      >
        <DialogContent className="finance-dialog">
          <DialogHeader>
            <DialogTitle>Подтвердить выплату собственнику</DialogTitle>
          </DialogHeader>
          {pay && (
            <div className="grid gap-4">
              <p>Запишем расход и уменьшим долг. Можно указать частичную выплату.</p>
              <label>
                Сумма выплаты
                <Input
                  aria-label="Сумма выплаты"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={pay.amount}
                  onChange={(e) => setPay({ ...pay, amount: e.target.value })}
                />
              </label>
              <label>
                Счёт выплаты
                <select
                  aria-label="Счёт выплаты"
                  className="block w-full border p-2"
                  value={pay.account}
                  onChange={(e) => setPay({ ...pay, account: e.target.value })}
                >
                  {active.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Фактическая дата
                <Input
                  aria-label="Дата выплаты"
                  type="date"
                  max={today()}
                  value={pay.date}
                  onChange={(e) => setPay({ ...pay, date: e.target.value })}
                />
              </label>
              <Button
                disabled={
                  payout.isPending ||
                  !pay.account ||
                  !pay.date ||
                  pay.date > today() ||
                  !Number.isFinite(Number(pay.amount)) ||
                  Number(pay.amount) <= 0
                }
                onClick={() => payout.mutate()}
              >
                {payout.isPending ? "Сохраняем…" : "Записать выплату"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
