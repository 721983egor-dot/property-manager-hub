import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, Plus, Package, CirclePlus, Info } from "lucide-react";
import { toast } from "sonner";

import { AdminOnly } from "@/components/AdminOnly";
import { PaymentDialog } from "@/components/PaymentDialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import "@/components/finance-obligation.css";
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
  deleteObligation,
  fetchCounterparty,
  fetchObligations,
  obligationCash,
  saveCounterparty,
  saveObligation,
  summarizeCounterparty,
  type ObligationDirection,
  type FinanceObligation,
} from "@/lib/finance-counterparties";
import {
  effectivePaymentStatus,
  type Payment,
  type PaymentDirection,
  fetchFinancePropertyOptions,
  fetchPayments,
  financePropertyLabel,
  formatAdeskMoney,
  formatFinanceDate,
  kindLabel,
  statusLabel,
} from "@/lib/finance";
import { toISODate } from "@/lib/rentals";
import { fetchCounterpartyClassifications } from "@/lib/finance-classifications";
import "@/components/finance-counterparty.css";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/finance/counterparties/$id")({
  head: () => ({
    meta: [{ title: "Контрагент — Финансы — RM OS" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <AdminOnly>
      <CounterpartyRoutePage />
    </AdminOnly>
  ),
});

function CounterpartyRoutePage() {
  const { id } = Route.useParams();
  return <CounterpartyCardPage id={id} />;
}

export function CounterpartyCardPage({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"money" | "obligations">("money");
  const [editName, setEditName] = useState("");
  const [editClass, setEditClass] = useState("__none__");
  const [editRequisites, setEditRequisites] = useState("");
  const [period, setPeriod] = useState("all");
  const [settlingObligation, setSettlingObligation] = useState<FinanceObligation | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [paymentDirection, setPaymentDirection] = useState<PaymentDirection>("in");
  const [editingObligation, setEditingObligation] = useState<FinanceObligation | null>(null);
  const [kindOpen, setKindOpen] = useState(false);
  const [oblOpen, setOblOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [projectFilter, setProjectFilter] = useState("all");
  const [oblDate, setOblDate] = useState(toISODate(new Date()));
  const [oblLegalEntity, setOblLegalEntity] = useState("");
  const [oblAmount, setOblAmount] = useState("");
  const [oblDirection, setOblDirection] = useState<ObligationDirection>("receivable");
  const [oblDescription, setOblDescription] = useState("");
  const [oblProperty, setOblProperty] = useState("");

  const { data: classifications = [], error: classError } = useQuery({
    queryKey: ["finance-counterparty-classes"],
    queryFn: fetchCounterpartyClassifications,
  });
  const {
    data: party,
    isLoading,
    error: partyError,
  } = useQuery({
    queryKey: ["finance-counterparties", id],
    queryFn: () => fetchCounterparty(id),
  });
  const { data: obligations = [], error: obligationError } = useQuery({
    queryKey: ["finance-obligations", id],
    queryFn: () => fetchObligations({ counterpartyId: id }),
    enabled: Boolean(id),
  });
  const { data: payments = [], error: paymentError } = useQuery({
    queryKey: ["payments", "counterparty", id],
    queryFn: () => fetchPayments({ counterpartyId: id }),
    enabled: Boolean(id),
  });
  const { data: properties = [] } = useQuery({
    queryKey: ["finance-property-options"],
    queryFn: fetchFinancePropertyOptions,
    staleTime: 5 * 60 * 1000,
  });

  const propertyLabel = (propertyId: string | null) => {
    if (!propertyId) return "—";
    const found = properties.find((p) => p.id === propertyId);
    return found ? financePropertyLabel(found) : "—";
  };

  const periodFrom =
    period === "month"
      ? toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
      : period === "year"
        ? `${new Date().getFullYear()}-01-01`
        : "";
  const inPeriod = (date: string) =>
    !periodFrom || (date >= periodFrom && date <= toISODate(new Date()));
  const visibleObligations = obligations.filter(
    (item) =>
      (projectFilter === "all" || item.property_id === projectFilter) &&
      inPeriod(item.planned_date),
  );
  const visiblePayments = payments.filter(
    (item) =>
      (projectFilter === "all" || item.property_id === projectFilter) &&
      inPeriod(item.planned_date),
  );
  const overview = summarizeCounterparty(visiblePayments, visibleObligations, payments);
  const allOverview = summarizeCounterparty(payments, obligations);
  const openPartyEditor = () => {
    setEditName(party?.name ?? "");
    setEditClass(party?.classification_id ?? "__none__");
    setEditRequisites(party?.requisites ?? "");
    setKindOpen(true);
  };
  const kindMutation = useMutation({
    mutationFn: () =>
      saveCounterparty(id, {
        name: editName,
        kind: party?.kind ?? "other",
        classification_id: editClass === "__none__" ? null : editClass,
        requisites: editRequisites,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance-counterparties"] });
      setKindOpen(false);
      toast.success("Карточка обновлена");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const oblMutation = useMutation({
    mutationFn: () =>
      saveObligation(editingObligation?.id ?? null, {
        counterparty_id: id,
        planned_date: oblDate,
        amount: Number(oblAmount),
        direction: oblDirection,
        description: oblDescription,
        legal_entity: oblLegalEntity,
        property_id: oblProperty || null,
        status: editingObligation?.status ?? "open",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance-obligations"] });
      setOblOpen(false);
      setOblAmount("");
      setOblDescription("");
      toast.success("Обязательство сохранено");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const deleteObl = useMutation({
    mutationFn: (obligationId: string) => deleteObligation(obligationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance-obligations"] });
      toast.success("Удалено");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка удаления"),
  });

  const openObligation = (item: FinanceObligation | null) => {
    setEditingObligation(item);
    setOblLegalEntity(item?.legal_entity ?? "");
    setOblDate(item?.planned_date ?? toISODate(new Date()));
    setOblAmount(item ? String(item.amount) : "");
    setOblDirection(item?.direction ?? "receivable");
    setOblDescription(item?.description ?? "");
    setOblProperty(item?.property_id ?? "");
    setOblOpen(true);
  };

  if (partyError)
    return (
      <p role="alert" className="p-8">
        Не удалось загрузить контрагента.
      </p>
    );
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
    <div className="finance-ui finance-counterparty-page px-4 py-6 sm:px-6 sm:py-8">
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
            onClick={openPartyEditor}
          >
            ▰{" "}
            {classifications.find((c) => c.id === party.classification_id)?.name ??
              "Без классификации"}
          </button>
        </div>
      </div>

      <div className="party-overview-tab">
        Обзор{" "}
        <Button variant="ghost" onClick={openPartyEditor}>
          Редактировать карточку
        </Button>
      </div>
      <div className="mt-6">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все время</SelectItem>
            <SelectItem value="month">Текущий месяц</SelectItem>
            <SelectItem value="year">Текущий год</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {(paymentError || obligationError || classError) && (
        <p role="alert" className="mt-4 text-red-600">
          Не удалось загрузить часть данных. Итоги могут быть неполными.
        </p>
      )}
      <div className="party-summary mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-5">
          <p className="text-sm text-muted-foreground">
            {overview.theyOweUs < 0
              ? "Мы должны контрагенту"
              : overview.theyOweUs > 0
                ? "Контрагент должен нам"
                : "Нет задолженности"}
          </p>
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
            {formatAdeskMoney(Math.abs(overview.theyOweUs))}
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
              <p className="mb-2 text-sm text-muted-foreground">Участвует в объектах</p>
              <div className="flex flex-wrap gap-1.5">
                {allOverview.propertyIds.map((propertyId) => (
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
          <p className="whitespace-pre-wrap">
            {party.requisites || "Для этого контрагента не заданы реквизиты"}
          </p>
          <Button variant="outline" className="mt-4" onClick={openPartyEditor}>
            {party.requisites ? "Изменить реквизиты" : "+ Добавить реквизиты"}
          </Button>
        </div>
      </div>

      <div className="party-transactions mt-6 rounded-xl border border-border bg-white">
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
            <>
              <Button
                type="button"
                onClick={() => {
                  setSettlingObligation(null);
                  setEditingPayment(null);
                  setPaymentDirection("in");
                  setPayOpen(true);
                }}
              >
                + Приход
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setSettlingObligation(null);
                  setEditingPayment(null);
                  setPaymentDirection("out");
                  setPayOpen(true);
                }}
              >
                − Расход
              </Button>
            </>
          ) : (
            <Button
              type="button"
              className="bg-[#3b82f6] hover:bg-[#2563eb]"
              onClick={() => openObligation(null)}
            >
              <Plus className="size-4" />
              Добавить обязательство
            </Button>
          )}
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder="Все объекты" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все объекты</SelectItem>
              {allOverview.propertyIds.map((propertyId) => (
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
              <span>Объект</span>
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
                    role="button"
                    tabIndex={0}
                    aria-label={`Изменить операцию ${formatFinanceDate(payment.planned_date)} ${payment.amount}`}
                    onClick={() => {
                      setEditingPayment(payment);
                      setPayOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setEditingPayment(payment);
                        setPayOpen(true);
                      }
                    }}
                    className="grid cursor-pointer gap-1 border-b border-border px-5 py-3 last:border-0 hover:bg-muted/40 sm:grid-cols-[7rem_9rem_1fr_8rem_7rem] sm:items-center"
                  >
                    <p className="tabular-nums text-sm">
                      {formatFinanceDate(payment.planned_date)}
                    </p>
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
                      {payment.comment || payment.article?.name || kindLabel(payment.kind)}
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
              <span>Объект</span>
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
                  <div className="grid items-start gap-1 sm:grid-cols-[7rem_12rem_1fr_16rem] sm:items-center">
                    <p className="tabular-nums text-sm">{formatFinanceDate(item.planned_date)}</p>
                    <div>
                      <p
                        className={cn(
                          "font-medium tabular-nums",
                          item.direction === "receivable" ? "text-emerald-600" : "text-red-600",
                        )}
                      >
                        {formatAdeskMoney(
                          item.direction === "receivable" ? cash.remaining : -cash.remaining,
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
                    <div>
                      <p className="text-sm">{item.description || "—"}</p>
                      {item.legal_entity && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Юр. лицо: {item.legal_entity}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {propertyLabel(item.property_id)}
                      </span>
                      {item.status === "open" && cash.remaining > 0 && (
                        <button
                          type="button"
                          className="text-xs text-blue-600"
                          onClick={() => {
                            setSettlingObligation(item);
                            setEditingPayment(null);
                            setPaymentDirection(item.direction === "payable" ? "out" : "in");
                            setPayOpen(true);
                          }}
                        >
                          Добавить оплату
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-xs text-blue-600"
                        onClick={() => openObligation(item)}
                      >
                        Изменить
                      </button>
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
        <DialogContent className="finance-dialog">
          <DialogHeader>
            <DialogTitle>Редактировать контрагента</DialogTitle>
          </DialogHeader>
          <Label htmlFor="party-name">Имя</Label>
          <Input id="party-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
          <Label>Классификация</Label>
          <Select value={editClass} onValueChange={setEditClass}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Без классификации</SelectItem>
              {classifications.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link to="/finance/settings" className="text-sm text-blue-600">
            Настроить классификации
          </Link>
          <Label htmlFor="party-requisites">Реквизиты</Label>
          <Textarea
            id="party-requisites"
            rows={5}
            value={editRequisites}
            onChange={(e) => setEditRequisites(e.target.value)}
            placeholder="Наименование, ИНН, банковский счёт, БИК"
          />
          <DialogFooter>
            <Button
              disabled={!editName.trim() || kindMutation.isPending}
              onClick={() => kindMutation.mutate()}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={oblOpen} onOpenChange={setOblOpen}>
        <SheetContent
          className="finance-obligation-sheet"
          overlayClassName="finance-obligation-overlay"
        >
          <SheetHeader className="obligation-heading">
            <SheetTitle>
              {editingObligation
                ? "Изменить обязательство"
                : "Зафиксировать исполнение обязательства"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Укажите направление передачи, сумму, юридическое лицо, объект и дату.
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!oblMutation.isPending) oblMutation.mutate();
            }}
          >
            <div
              className="obligation-directions"
              role="group"
              aria-label="Направление обязательства"
            >
              {(
                [
                  {
                    value: "receivable",
                    title: "Мы передали",
                    description: "Мы исполнили обязательство перед контрагентом",
                  },
                  {
                    value: "payable",
                    title: "Нам передали",
                    description: "Контрагент исполнил обязательство перед нами",
                  },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={oblDirection === option.value}
                  className={cn(
                    "obligation-direction",
                    oblDirection === option.value && "is-selected",
                  )}
                  onClick={() => setOblDirection(option.value)}
                >
                  <span className="obligation-package">
                    <Package size={28} />
                    <CirclePlus
                      size={14}
                      className={option.value === "receivable" ? "transfer-out" : "transfer-in"}
                    />
                  </span>
                  <span>
                    <strong>{option.title}</strong>
                    <span>{option.description}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="obligation-fields">
              <div className="obligation-field">
                <label htmlFor="obligation-amount">
                  Сумма <span>*</span>
                </label>
                <input
                  id="obligation-amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  autoFocus
                  placeholder="0,00"
                  value={oblAmount}
                  onChange={(e) => setOblAmount(e.target.value)}
                />
              </div>
              <div className="obligation-field">
                <label htmlFor="obligation-currency">Валюта</label>
                <select id="obligation-currency" aria-label="Валюта">
                  <option value="RUB">Российский рубль (RUB)</option>
                </select>
              </div>
              <div className="obligation-field">
                <label htmlFor="obligation-party">
                  Контрагент <span>*</span>
                </label>
                <input id="obligation-party" readOnly value={party.name} title={party.name} />
              </div>
              <div className="obligation-field">
                <label htmlFor="obligation-legal-entity">
                  Юр. лицо <span>*</span>
                </label>
                <input
                  id="obligation-legal-entity"
                  list="obligation-legal-options"
                  required
                  placeholder="Введите юр. лицо…"
                  value={oblLegalEntity}
                  onChange={(e) => setOblLegalEntity(e.target.value)}
                />
                <datalist id="obligation-legal-options">
                  {Array.from(new Set(obligations.map((o) => o.legal_entity).filter(Boolean))).map(
                    (name) => (
                      <option key={name} value={name} />
                    ),
                  )}
                </datalist>
              </div>
              <div className="obligation-field">
                <label htmlFor="obligation-project">Объект</label>
                <select
                  id="obligation-project"
                  value={oblProperty}
                  onChange={(e) => setOblProperty(e.target.value)}
                >
                  <option value="">Выберите объект…</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {financePropertyLabel(property)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="obligation-field">
                <label htmlFor="obligation-date">
                  Дата <span>*</span>
                </label>
                <input
                  id="obligation-date"
                  type="date"
                  required
                  value={oblDate}
                  onChange={(e) => setOblDate(e.target.value)}
                />
              </div>
              <div className="obligation-field obligation-description">
                <label htmlFor="obligation-description">Описание</label>
                <textarea
                  id="obligation-description"
                  rows={2}
                  placeholder="Например, предоплата или оказание услуги"
                  value={oblDescription}
                  onChange={(e) => setOblDescription(e.target.value)}
                />
              </div>
            </div>
            <button
              className="obligation-submit"
              type="submit"
              disabled={
                !oblAmount ||
                Number(oblAmount) <= 0 ||
                !oblLegalEntity.trim() ||
                !oblDate ||
                oblMutation.isPending
              }
            >
              {oblMutation.isPending ? "Сохранение…" : editingObligation ? "Сохранить" : "Добавить"}
            </button>
            <div
              className="obligation-documents"
              aria-label="Прикрепление документов пока недоступно"
            >
              <span>Документы</span>
              <span>
                Прикрепление файлов пока недоступно <Info size={14} />
              </span>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <PaymentDialog
        defaultObligationId={editingPayment ? undefined : settlingObligation?.id}
        defaultAmount={
          editingPayment || !settlingObligation
            ? undefined
            : obligationCash(settlingObligation, payments).remaining
        }
        defaultPropertyId={settlingObligation?.property_id ?? undefined}
        payment={editingPayment}
        defaultDirection={paymentDirection}
        open={payOpen}
        onOpenChange={(open) => {
          setPayOpen(open);
          if (!open) {
            void queryClient.invalidateQueries({ queryKey: ["payments"] });
            void queryClient.invalidateQueries({ queryKey: ["finance-obligations"] });
          }
        }}
        defaultDate={toISODate(new Date())}
        defaultCounterpartyId={party.id}
        defaultCounterpartyName={party.name}
      />
    </div>
  );
}
