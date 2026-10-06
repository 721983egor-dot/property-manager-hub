import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";
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
  fetchFinancePropertyOptions,
  fetchPayments,
  financePropertyLabel,
  kindLabel,
  loadMonthOpeningBalance,
  markPaymentPaid,
  monthBounds,
  saveMonthOpeningBalance,
  statusLabel,
  type Payment,
  type PaymentDirection,
  type PaymentStatus,
} from "@/lib/finance";
import { formatMoney, internalTitle } from "@/lib/properties";
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
  const [defaultDirection, setDefaultDirection] = useState<PaymentDirection>("out");
  const [openingDraft, setOpeningDraft] = useState("0");
  const [showOpening, setShowOpening] = useState(false);

  const bounds = useMemo(() => monthBounds(year, monthIndex), [year, monthIndex]);

  useEffect(() => {
    setOpeningDraft(String(loadMonthOpeningBalance(bounds.monthKey)));
  }, [bounds.monthKey]);

  const openingBalance = Number(openingDraft) || 0;

  // Лёгкий список объектов (не select(*) через server fn) — не блокирует календарь.
  const { data: propertyOptions = [] } = useQuery({
    queryKey: ["finance-property-options"],
    queryFn: fetchFinancePropertyOptions,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: payments = [],
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["payments", bounds.from, bounds.to, propertyId],
    queryFn: () =>
      fetchPayments({
        from: bounds.from,
        to: bounds.to,
        propertyId: propertyId === "all" ? null : propertyId,
      }),
    staleTime: 30 * 1000,
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

  const openCreate = (date?: string, direction: PaymentDirection = "out") => {
    setEditing(null);
    setDefaultDate(date || bounds.from);
    setDefaultDirection(direction);
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
            Платёжный календарь
          </h1>
        </div>
        <Button type="button" onClick={() => openCreate()}>
          <Plus className="size-4" />
          Операция
        </Button>
      </header>

      <FinanceTabs active="calendar" />

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-0.5 rounded-lg border border-[#e8edf2] bg-white p-0.5">
          <Button type="button" variant="ghost" size="icon" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="inline-flex min-w-[11.5rem] items-center justify-center gap-1.5 px-2 text-sm font-semibold capitalize text-slate-800">
            <CalendarDays className="size-3.5 text-slate-400" />
            {monthTitle}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => shiftMonth(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-[#e8edf2] bg-white"
          onClick={() => setShowOpening((v) => !v)}
        >
          <Settings2 className="size-4" />
          Настройки
        </Button>

        <div className="flex rounded-lg border border-[#e8edf2] bg-white p-0.5">
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              view === "month" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800",
            )}
            onClick={() => setView("month")}
          >
            Календарь
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              view === "list" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800",
            )}
            onClick={() => setView("list")}
          >
            Список
          </button>
        </div>

        {view === "month" && (
          <div className="flex rounded-lg border border-[#e8edf2] bg-white p-0.5">
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                cellMode === "sums" ? "bg-slate-100 font-medium text-slate-800" : "text-slate-500",
              )}
              onClick={() => setCellMode("sums")}
            >
              Суммы
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                cellMode === "ops" ? "bg-slate-100 font-medium text-slate-800" : "text-slate-500",
              )}
              onClick={() => setCellMode("ops")}
            >
              Операции
            </button>
          </div>
        )}

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[160px] border-[#e8edf2] bg-white">
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
          <SelectTrigger className="w-[220px] border-[#e8edf2] bg-white">
            <SelectValue placeholder="Проект" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все проекты</SelectItem>
            {propertyOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {financePropertyLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isFetching && !isLoading && (
          <span className="text-xs text-slate-400">Обновление…</span>
        )}
      </div>

      {showOpening && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-[#e8edf2] bg-[#fafbfc] px-3 py-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">
              Начальный остаток на {bounds.from}
            </p>
            <Input
              type="number"
              className="w-[180px] border-[#e8edf2] bg-white"
              value={openingDraft}
              onChange={(e) => setOpeningDraft(e.target.value)}
            />
          </div>
          <Button type="button" size="sm" onClick={applyOpening}>
            Применить
          </Button>
          <p className="text-xs text-slate-400">
            Хранится в браузере для этого месяца. Нужен, чтобы видеть кассовые разрывы.
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Приход" value={formatMoney(totals.inSum)} tone="text-[#16a34a]" />
        <Kpi label="Расход" value={formatMoney(totals.outSum)} tone="text-[#dc2626]" />
        <Kpi
          label="Остаток на конец"
          value={formatMoney(totals.end)}
          tone={totals.end < 0 ? "text-[#dc2626]" : "text-teal-800"}
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
            totals.overdue > 0 || totals.gaps > 0 ? "text-[#dc2626]" : "text-slate-400"
          }
        />
      </div>

      {isLoading && (
        <p className="mt-8 text-sm text-slate-500">Загрузка календаря…</p>
      )}

      {!isLoading && view === "month" && (
        <div className="mt-5">
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
        <div className="mt-5 overflow-hidden rounded-xl border border-[#e8edf2] bg-white">
          <div className="hidden grid-cols-[7rem_1fr_8rem_7rem_6rem] gap-3 border-b border-[#e8edf2] bg-[#fafbfc] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:grid">
            <span>Дата</span>
            <span>Операция</span>
            <span className="text-right">Сумма</span>
            <span>Статус</span>
            <span />
          </div>
          {filtered.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              За этот месяц операций нет. Нажмите «Операция» или «+» в дне календаря.
            </p>
          )}
          {filtered.map((payment) => {
            const status = effectivePaymentStatus(payment, today);
            const propertyTitle = payment.property
              ? internalTitle(payment.property)
              : "Без проекта";
            return (
              <div
                key={payment.id}
                className="grid gap-2 border-b border-[#e8edf2] px-4 py-3 last:border-b-0 sm:grid-cols-[7rem_1fr_8rem_7rem_6rem] sm:items-center sm:gap-3"
              >
                <button
                  type="button"
                  className="text-left text-sm font-medium tabular-nums"
                  onClick={() => openEdit(payment)}
                >
                  {payment.planned_date}
                </button>
                <button type="button" className="min-w-0 text-left" onClick={() => openEdit(payment)}>
                  <p className="truncate text-sm">
                    <span className="font-medium">{kindLabel(payment.kind)}</span>
                    <span className="text-slate-500"> · {counterpartyLabel(payment)}</span>
                  </p>
                  <p className="truncate text-xs text-slate-400">{propertyTitle}</p>
                </button>
                <p
                  className={cn(
                    "text-sm font-semibold tabular-nums sm:text-right",
                    payment.direction === "in" ? "text-[#16a34a]" : "text-[#dc2626]",
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
                    <span className="text-xs text-slate-400">✓</span>
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
        defaultDirection={defaultDirection}
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[#e8edf2] bg-white px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("mt-1 text-base font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}
