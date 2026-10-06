import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";
import { toast } from "sonner";

import { AdminOnly } from "@/components/AdminOnly";
import { PaymentDialog } from "@/components/PaymentDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  COUNTERPARTY_KINDS,
  OBLIGATION_DIRECTIONS,
  counterpartyKindLabel,
  deleteObligation,
  fetchCounterparty,
  fetchObligations,
  obligationCash,
  saveCounterparty,
  saveObligation,
  summarizeCounterparty,
  type CounterpartyKind,
  type ObligationDirection,
} from "@/lib/finance-counterparties";
import {
  effectivePaymentStatus,
  fetchPayments,
  formatAdeskMoney,
  formatFinanceDate,
  kindLabel,
  statusLabel,
} from "@/lib/finance";
import { fetchProperties, internalTitle } from "@/lib/properties";
import { toISODate } from "@/lib/rentals";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/finance/counterparties/$id")({
  head: () => ({
    meta: [
      { title: "Контрагент — Финансы — RM OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <CounterpartyCardPage />
    </AdminOnly>
  ),
});

function CounterpartyCardPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"money" | "obligations">("obligations");
  const [kindOpen, setKindOpen] = useState(false);
  const [oblOpen, setOblOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [projectFilter, setProjectFilter] = useState("all");
  const [oblDate, setOblDate] = useState(toISODate(new Date()));
  const [oblAmount, setOblAmount] = useState("");
  const [oblDirection, setOblDirection] = useState<ObligationDirection>("receivable");
  const [oblDescription, setOblDescription] = useState("");
  const [oblProperty, setOblProperty] = useState("");

  const { data: party, isLoading } = useQuery({
    queryKey: ["finance-counterparties", id],
    queryFn: () => fetchCounterparty(id),
  });
  const { data: obligations = [] } = useQuery({
    queryKey: ["finance-obligations", id],
    queryFn: () => fetchObligations({ counterpartyId: id }),
    enabled: Boolean(id),
  });
  const { data: payments = [] } = useQuery({
    queryKey: ["payments", "counterparty", id],
    queryFn: () => fetchPayments({ counterpartyId: id }),
    enabled: Boolean(id),
  });
  const { data: properties = [] } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });

  const overview = useMemo(
    () => summarizeCounterparty(payments, obligations),
    [payments, obligations],
  );

  const propertyLabel = (propertyId: string | null) => {
    if (!propertyId) return "—";
    const found = properties.find((p) => p.id === propertyId);
    return found ? internalTitle(found) : "—";
  };

  const visibleObligations = useMemo(
    () =>
      obligations.filter(
        (item) => projectFilter === "all" || item.property_id === projectFilter,
      ),
    [obligations, projectFilter],
  );
  const visiblePayments = useMemo(
    () =>
      payments.filter(
        (item) => projectFilter === "all" || item.property_id === projectFilter,
      ),
    [payments, projectFilter],
  );

  const kindMutation = useMutation({
    mutationFn: (kind: CounterpartyKind) =>
      saveCounterparty(id, { name: party?.name ?? "", kind, comment: party?.comment ?? "" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance-counterparties"] });
      setKindOpen(false);
      toast.success("Тип обновлён");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const oblMutation = useMutation({
    mutationFn: () =>
      saveObligation(null, {
        counterparty_id: id,
        planned_date: oblDate,
        amount: Number(oblAmount),
        direction: oblDirection,
        description: oblDescription,
        property_id: oblProperty || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance-obligations", id] });
      setOblOpen(false);
      setOblAmount("");
      setOblDescription("");
      toast.success("Обязательство добавлено");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const deleteObl = useMutation({
    mutationFn: (obligationId: string) => deleteObligation(obligationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance-obligations", id] });
      toast.success("Удалено");
    },
  });

  if (isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Загрузка…</p>;
  }
  if (!party) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Контрагент не найден.</p>
        <Link to="/finance/counterparties" className="mt-3 inline-block text-sm text-teal-800">
          К списку
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <Link
        to="/finance/counterparties"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Контрагенты
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{party.name}</h1>
          <button
            type="button"
            className="mt-2 rounded-full border border-border bg-muted/40 px-3 py-0.5 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setKindOpen(true)}
          >
            {counterpartyKindLabel(party.kind)}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-5">
          <p className="text-sm text-muted-foreground">Контрагент должен нам</p>
          <p
            className={cn(
              "mt-1 text-4xl font-semibold tabular-nums",
              overview.theyOweUs > 0
                ? "text-emerald-600"
                : overview.theyOweUs < 0
                  ? "text-red-600"
                  : "text-foreground",
            )}
          >
            {formatAdeskMoney(overview.theyOweUs)}
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Перевел нам</p>
              <p className="mt-1 font-medium tabular-nums">
                {formatAdeskMoney(overview.transferredToUs)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Мы перевели</p>
              <p className="mt-1 font-medium tabular-nums">
                {formatAdeskMoney(overview.weTransferred)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Сальдо</p>
              <p className="mt-1 font-medium tabular-nums">
                {formatAdeskMoney(overview.cashSaldo)}
              </p>
            </div>
          </div>
          {overview.propertyIds.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm text-muted-foreground">Участвует в проектах</p>
              <div className="flex flex-wrap gap-1.5">
                {overview.propertyIds.map((propertyId) => (
                  <span
                    key={propertyId}
                    className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {propertyLabel(propertyId)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white p-5 text-center text-sm text-muted-foreground">
          <p>Для этого контрагента не заданы реквизиты</p>
          <p className="mt-1 text-xs">Реквизиты и банк не ведём — без выставления счетов.</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-white">
        <div className="flex gap-5 border-b border-border px-5">
          <button
            type="button"
            className={cn(
              "-mb-px border-b-2 py-3 text-sm font-medium",
              tab === "money"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground",
            )}
            onClick={() => setTab("money")}
          >
            Деньги
          </button>
          <button
            type="button"
            className={cn(
              "-mb-px border-b-2 py-3 text-sm font-medium",
              tab === "obligations"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground",
            )}
            onClick={() => setTab("obligations")}
          >
            Обязательства
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          {tab === "money" ? (
            <Button type="button" onClick={() => setPayOpen(true)}>
              <Plus className="size-4" />
              Операция
            </Button>
          ) : (
            <Button type="button" onClick={() => setOblOpen(true)}>
              <Plus className="size-4" />
              Добавить обязательство
            </Button>
          )}
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder="Все проекты" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все проекты</SelectItem>
              {overview.propertyIds.map((propertyId) => (
                <SelectItem key={propertyId} value={propertyId}>
                  {propertyLabel(propertyId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {tab === "money" ? (
          <div>
            <div className="hidden grid-cols-[7rem_9rem_1fr_8rem_7rem] gap-3 border-y border-border px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Дата</span>
              <span>Сумма</span>
              <span>Описание</span>
              <span>Проект</span>
              <span>Статус</span>
            </div>
            {visiblePayments.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                Нет денежных операций по этому контрагенту.
              </p>
            ) : (
              visiblePayments.map((payment) => {
                const status = effectivePaymentStatus(payment);
                return (
                  <div
                    key={payment.id}
                    className="grid gap-1 border-b border-border px-5 py-3 last:border-0 sm:grid-cols-[7rem_9rem_1fr_8rem_7rem] sm:items-center"
                  >
                    <p className="tabular-nums text-sm">{formatFinanceDate(payment.planned_date)}</p>
                    <p
                      className={cn(
                        "font-medium tabular-nums",
                        payment.direction === "in" ? "text-emerald-600" : "text-red-600",
                      )}
                    >
                      {formatAdeskMoney(
                        payment.direction === "in" ? payment.amount : -payment.amount,
                        true,
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {payment.comment || kindLabel(payment.kind)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {propertyLabel(payment.property_id)}
                    </p>
                    <p className="text-xs text-muted-foreground">{statusLabel(status)}</p>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div>
            <div className="hidden grid-cols-[7rem_12rem_1fr_8rem] gap-3 border-y border-border px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Дата</span>
              <span>Баланс</span>
              <span>Описание</span>
              <span>Проект</span>
            </div>
            {visibleObligations.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                Обязательств пока нет.
              </p>
            )}
            {visibleObligations.map((item) => {
              const cash = obligationCash(item, payments);
              return (
                <div key={item.id} className="border-b border-border px-5 py-3 last:border-0">
                  <div className="grid items-start gap-1 sm:grid-cols-[7rem_12rem_1fr_8rem] sm:items-center">
                    <p className="tabular-nums text-sm">{formatFinanceDate(item.planned_date)}</p>
                    <div>
                      <p
                        className={cn(
                          "font-medium tabular-nums",
                          item.direction === "receivable" ? "text-emerald-600" : "text-red-600",
                        )}
                      >
                        {formatAdeskMoney(
                          item.direction === "receivable" ? item.amount : -item.amount,
                          true,
                        )}
                      </p>
                      <span
                        className={cn(
                          "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px]",
                          item.direction === "receivable"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800",
                        )}
                      >
                        {item.direction === "receivable" ? "Мы передали" : "Нам передали"}
                      </span>
                    </div>
                    <p className="text-sm">{item.description || "—"}</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">
                        {propertyLabel(item.property_id)}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => deleteObl.mutate(item.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                  {cash.linked.length > 0 && (
                    <div className="mt-2 space-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      <p>
                        Движение денег: оплачено {formatAdeskMoney(cash.paid)}
                        {cash.remaining > 0 ? ` · остаток ${formatAdeskMoney(cash.remaining)}` : ""}
                      </p>
                      {cash.linked.map((payment) => (
                        <p key={payment.id} className="tabular-nums">
                          {formatFinanceDate(payment.planned_date)} ·{" "}
                          {formatAdeskMoney(
                            payment.direction === "in" ? payment.amount : -payment.amount,
                            true,
                          )}{" "}
                          · {statusLabel(effectivePaymentStatus(payment))}
                          {payment.comment ? ` · ${payment.comment}` : ""}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={kindOpen} onOpenChange={setKindOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Тип контрагента</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {COUNTERPARTY_KINDS.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant={party.kind === item.value ? "default" : "outline"}
                onClick={() => kindMutation.mutate(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={oblOpen} onOpenChange={setOblOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить обязательство</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Дата</Label>
              <Input type="date" value={oblDate} onChange={(e) => setOblDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Сумма</Label>
              <Input
                type="number"
                min={0}
                value={oblAmount}
                onChange={(e) => setOblAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Направление</Label>
              <Select
                value={oblDirection}
                onValueChange={(v) => setOblDirection(v as ObligationDirection)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBLIGATION_DIRECTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Проект</Label>
              <Select
                value={oblProperty || "__none__"}
                onValueChange={(v) => setOblProperty(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Без проекта" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без проекта</SelectItem>
                  {properties
                    .filter((p) => p.status !== "archived")
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {internalTitle(p)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Описание</Label>
              <Textarea
                value={oblDescription}
                onChange={(e) => setOblDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOblOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!oblAmount || oblMutation.isPending}
              onClick={() => oblMutation.mutate()}
            >
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentDialog
        open={payOpen}
        onOpenChange={(open) => {
          setPayOpen(open);
          if (!open) {
            void queryClient.invalidateQueries({ queryKey: ["payments"] });
            void queryClient.invalidateQueries({ queryKey: ["finance-obligations", id] });
          }
        }}
        defaultDate={toISODate(new Date())}
        defaultCounterpartyId={party.id}
        defaultCounterpartyName={party.name}
      />
    </div>
  );
}
