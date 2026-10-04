import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminOnly } from "@/components/AdminOnly";
import { FinanceTabs } from "@/components/FinanceTabs";
import {
  PaymentCalendarMonth,
  type CellMode,
} from "@/components/PaymentCalendarMonth";
import { PaymentDialog } from "@/components/PaymentDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildMonthDayLedger,
  counterpartyLabel,
  effectivePaymentStatus,
  fetchPayments,
  kindLabel,
  loadMonthOpeningBalance,
  markPaymentPaid,
  monthBounds,
  saveMonthOpeningBalance,
  statusLabel,
  type Payment,
  type PaymentStatus,
} from "@/lib/finance";
import { fetchProperties, formatMoney, internalTitle } from "@/lib/properties";
import { cn } from "@/lib/utils";
import { toISODate } from "@/lib/rentals";

export const Route = createFileRoute("/_authenticated/finance/calendar")({
  head: () => ({
    meta: [
      { title: "Финансы — платёжный календарь — RM OS" },
      {
        name: "description",
        content: "Платёжный календарь: приходы, расходы и прогноз остатка по дням.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <FinanceCalendarPage />
    </AdminOnly>
  ),
});

type ViewMode = "month" | "list";
type StatusFilter = "all" | "open" | PaymentStatus;

const STATUS_TONE: Record<PaymentStatus, string> = {
  expected: "bg-sky-500/15 text-sky-700",
  partial: "bg-amber-500/15 text-amber-800",
  paid: "bg-emerald-500/15 text-emerald-800",
  overdue: "bg-red-500/15 text-red-700",
};

function FinanceCalendarPage() {
  const queryClient = useQueryClient();
  const today = toISODate(new Date());
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [view, setView] = useState<ViewMode>("month");
  const [cellMode, setCellMode] = useState<CellMode>("sums");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [propertyId, setPropertyId] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>("");
  const [openingDraft, setOpeningDraft] = useState("0");
  const [showOpening, setShowOpening] = useState(false);

  const bounds = useMemo(() => monthBounds(year, monthIndex), [year, monthIndex]);

  useEffect(() => {
    setOpeningDraft(String(loadMonthOpeningBalance(bounds.monthKey)));
  }, [bounds.monthKey]);

  const openingBalance = Number(openingDraft) || 0;

  const { data: properties = [] } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments", bounds.from, bounds.to, propertyId],
    queryFn: () =>
      fetchPayments({
        from: bounds.from,
        to: bounds.to,
        propertyId: propertyId === "all" ? null : propertyId,
      }),
  });

  const filtered = useMemo(() => {
    return payments.filter((payment) => {
      const status = effectivePaymentStatus(payment, today);
      if (statusFilter === "all") return true;
      if (statusFilter === "open") return status !== "paid";
      return status === statusFilter;
    });
  }, [payments, statusFilter, today]);

  const ledger = useMemo(
    () => buildMonthDayLedger(filtered, year, monthIndex, openingBalance),
    [filtered, year, monthIndex, openingBalance],
  );

  const totals = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    let overdue = 0;
    for (const payment of filtered) {
      if (payment.direction === "in") inSum += payment.amount;
      else outSum += payment.amount;
      if (effectivePaymentStatus(payment, today) === "overdue") overdue += 1;
    }
    const end = ledger.length > 0 ? ledger[ledger.length - 1]!.closing : openingBalance;
    const gaps = ledger.filter((d) => d.hasGap).length;
    return { inSum, outSum, overdue, end, gaps };
  }, [filtered, today, ledger, openingBalance]);

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => markPaymentPaid(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Отмечено оплаченным");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const shiftMonth = (delta: number) => {
    const next = new Date(year, monthIndex + delta, 1);
    setYear(next.getFullYear());
    setMonthIndex(next.getMonth());
  };

  const openCreate = (date?: string) => {
    setEditing(null);
    setDefaultDate(date || bounds.from);
    setDialogOpen(true);
  };

  const openEdit = (payment: Payment) => {
    setEditing(payment);
    setDefaultDate("");
    setDialogOpen(true);
  };

  const monthTitle = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));

  const applyOpening = () => {
    const value = Number(openingDraft) || 0;
    saveMonthOpeningBalance(bounds.monthKey, value);
    setOpeningDraft(String(value));
    toast.success("Начальный остаток сохранён");
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Платёжный календарь
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Планируйте приходы и расходы по дням — остаток и кассовые разрывы видны сразу.
          </p>
        </div>
        <Button type="button" onClick={() => openCreate()}>
          <Plus className="size-4" />
          Операция
        </Button>
      </header>

      <FinanceTabs active="calendar" />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
          <Button type="button" variant="ghost" size="icon" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-[10rem] text-center text-sm font-semibold capitalize">{monthTitle}</p>
          <Button type="button" variant="ghost" size="icon" onClick={() => shiftMonth(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex rounded-md border border-border bg-card p-0.5">
          <button
            type="button"
            className={cn(
              "rounded px-3 py-1.5 text-sm",
              view === "month" ? "bg-teal-700 text-white" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setView("month")}
          >
            Календарь
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-3 py-1.5 text-sm",
              view === "list" ? "bg-teal-700 text-white" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setView("list")}
          >
            Список
          </button>
        </div>

        {view === "month" && (
          <div className="flex rounded-md border border-border bg-card p-0.5">
            <button
              type="button"
              className={cn(
                "rounded px-3 py-1.5 text-sm",
                cellMode === "sums" ? "bg-muted font-medium" : "text-muted-foreground",
              )}
              onClick={() => setCellMode("sums")}
            >
              Суммы
            </button>
            <button
              type="button"
              className={cn(
                "rounded px-3 py-1.5 text-sm",
                cellMode === "ops" ? "bg-muted font-medium" : "text-muted-foreground",
              )}
              onClick={() => setCellMode("ops")}
            >
              Операции
            </button>
          </div>
        )}

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="open">Не оплачено</SelectItem>
            <SelectItem value="expected">Ожидается</SelectItem>
            <SelectItem value="overdue">Просрочено</SelectItem>
            <SelectItem value="partial">Частично</SelectItem>
            <SelectItem value="paid">Оплачено</SelectItem>
          </SelectContent>
        </Select>

        <Select value={propertyId} onValueChange={setPropertyId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Объект" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все объекты</SelectItem>
            {properties
              .filter((p) => p.status !== "archived")
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {internalTitle(p)}
                  {p.ref_id != null ? ` · №${p.ref_id}` : ""}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowOpening((v) => !v)}
        >
          <Settings2 className="size-4" />
          Остаток
        </Button>
      </div>

      {showOpening && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Начальный остаток на {bounds.from}
            </p>
            <Input
              type="number"
              className="w-[180px]"
              value={openingDraft}
              onChange={(e) => setOpeningDraft(e.target.value)}
            />
          </div>
          <Button type="button" size="sm" onClick={applyOpening}>
            Применить
          </Button>
          <p className="text-xs text-muted-foreground">
            Хранится в браузере для этого месяца. Нужен, чтобы видеть кассовые разрывы.
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Приход"
          value={formatMoney(totals.inSum)}
          tone="text-emerald-700"
        />
        <Kpi label="Расход" value={formatMoney(totals.outSum)} tone="text-red-600" />
        <Kpi
          label="Остаток на конец"
          value={formatMoney(totals.end)}
          tone={totals.end < 0 ? "text-red-700" : "text-teal-800"}
        />
        <Kpi
          label={totals.overdue > 0 ? "Просрочено" : "Разрывы"}
          value={
            totals.overdue > 0
              ? String(totals.overdue)
              : totals.gaps > 0
                ? `${totals.gaps} дн.`
                : "нет"
          }
          tone={
            totals.overdue > 0 || totals.gaps > 0 ? "text-red-700" : "text-muted-foreground"
          }
        />
      </div>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Загрузка…</p>}

      {!isLoading && view === "month" && (
        <div className="mt-6">
          <PaymentCalendarMonth
            year={year}
            monthIndex={monthIndex}
            ledger={ledger}
            today={today}
            cellMode={cellMode}
            onAdd={openCreate}
            onEdit={openEdit}
          />
        </div>
      )}

      {!isLoading && view === "list" && (
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <div className="hidden grid-cols-[7rem_1fr_8rem_7rem_6rem] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Дата</span>
            <span>Операция</span>
            <span className="text-right">Сумма</span>
            <span>Статус</span>
            <span />
          </div>
          {filtered.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              За этот месяц операций нет. Нажмите «Операция» или «+» в дне календаря.
            </p>
          )}
          {filtered.map((payment) => {
            const status = effectivePaymentStatus(payment, today);
            const propertyTitle = payment.property
              ? internalTitle(payment.property)
              : "Без объекта";
            return (
              <div
                key={payment.id}
                className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[7rem_1fr_8rem_7rem_6rem] sm:items-center sm:gap-3"
              >
                <button
                  type="button"
                  className="text-left text-sm font-medium tabular-nums sm:col-span-1"
                  onClick={() => openEdit(payment)}
                >
                  {payment.planned_date}
                </button>
                <button type="button" className="min-w-0 text-left" onClick={() => openEdit(payment)}>
                  <p className="truncate text-sm">
                    <span className="font-medium">{kindLabel(payment.kind)}</span>
                    <span className="text-muted-foreground"> · {counterpartyLabel(payment)}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{propertyTitle}</p>
                </button>
                <p
                  className={cn(
                    "text-sm font-semibold tabular-nums sm:text-right",
                    payment.direction === "in" ? "text-emerald-700" : "text-red-600",
                  )}
                >
                  {payment.direction === "in" ? "+" : "−"}
                  {formatMoney(payment.amount)}
                </p>
                <span
                  className={cn(
                    "inline-flex w-fit rounded px-2 py-0.5 text-xs font-medium",
                    STATUS_TONE[status],
                  )}
                >
                  {statusLabel(status)}
                </span>
                <div className="sm:justify-self-end">
                  {status !== "paid" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={markPaidMutation.isPending}
                      onClick={() => markPaidMutation.mutate(payment.id)}
                    >
                      Оплачено
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">✓</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        payment={editing}
        defaultPropertyId={propertyId === "all" ? undefined : propertyId}
        defaultDate={defaultDate}
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-base font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}
