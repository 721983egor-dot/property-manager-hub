import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { FinanceTabs } from "@/components/FinanceTabs";
import { PaymentDialog } from "@/components/PaymentDialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  counterpartyLabel,
  effectivePaymentStatus,
  fetchPayments,
  kindLabel,
  markPaymentPaid,
  monthBounds,
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
      { title: "Финансы — календарь оплат — RM OS" },
      {
        name: "description",
        content: "Календарь ожидаемых и фактических оплат по объектам.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FinanceCalendarPage,
});

type ViewMode = "list" | "month";
type StatusFilter = "all" | "open" | PaymentStatus;

const STATUS_TONE: Record<PaymentStatus, string> = {
  expected: "bg-sky-500/15 text-sky-700",
  partial: "bg-amber-500/15 text-amber-800",
  paid: "bg-emerald-500/15 text-emerald-800",
  overdue: "bg-destructive/15 text-destructive",
};

function FinanceCalendarPage() {
  const queryClient = useQueryClient();
  const today = toISODate(new Date());
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [view, setView] = useState<ViewMode>("list");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [propertyId, setPropertyId] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>("");

  const bounds = useMemo(() => monthBounds(year, monthIndex), [year, monthIndex]);

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

  const totals = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    let overdue = 0;
    for (const payment of filtered) {
      if (payment.direction === "in") inSum += payment.amount;
      else outSum += payment.amount;
      if (effectivePaymentStatus(payment, today) === "overdue") overdue += 1;
    }
    return { inSum, outSum, overdue };
  }, [filtered, today]);

  const byDay = useMemo(() => {
    const map = new Map<string, Payment[]>();
    for (const payment of filtered) {
      const list = map.get(payment.planned_date) ?? [];
      list.push(payment);
      map.set(payment.planned_date, list);
    }
    return map;
  }, [filtered]);

  const calendarDays = useMemo(() => {
    const first = new Date(year, monthIndex, 1);
    const startPad = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells: Array<{ date: string | null; day: number | null }> = [];
    for (let i = 0; i < startPad; i += 1) cells.push({ date: null, day: null });
    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push({ date: toISODate(new Date(year, monthIndex, d)), day: d });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
    return cells;
  }, [year, monthIndex]);

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

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Финансы</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Календарь оплат: аренда, депозиты, выплаты собственникам и расходы.
          </p>
        </div>
        <Button type="button" onClick={() => openCreate()}>
          <Plus className="size-4" />
          Платёж
        </Button>
      </header>

      <FinanceTabs active="calendar" />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-[10rem] text-center text-sm font-medium capitalize">{monthTitle}</p>
          <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex rounded-md border border-border p-0.5">
          <button
            type="button"
            className={cn(
              "rounded px-3 py-1.5 text-sm",
              view === "list" ? "bg-muted font-medium" : "text-muted-foreground",
            )}
            onClick={() => setView("list")}
          >
            Список
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-3 py-1.5 text-sm",
              view === "month" ? "bg-muted font-medium" : "text-muted-foreground",
            )}
            onClick={() => setView("month")}
          >
            Месяц
          </button>
        </div>

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
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>
          Приход: <span className="font-medium text-foreground">{formatMoney(totals.inSum)}</span>
        </span>
        <span>
          Расход: <span className="font-medium text-foreground">{formatMoney(totals.outSum)}</span>
        </span>
        {totals.overdue > 0 && (
          <span className="text-destructive">Просрочено: {totals.overdue}</span>
        )}
      </div>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Загрузка…</p>}

      {!isLoading && view === "list" && (
        <div className="mt-6 space-y-2">
          {filtered.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              За этот месяц платежей нет. Добавьте аренду, депозит или выплату собственнику.
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
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => openEdit(payment)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{payment.planned_date}</span>
                    <span
                      className={cn("rounded px-2 py-0.5 text-xs font-medium", STATUS_TONE[status])}
                    >
                      {statusLabel(status)}
                    </span>
                    <span className="text-xs text-muted-foreground">{kindLabel(payment.kind)}</span>
                  </div>
                  <p className="mt-1 text-sm">
                    <span
                      className={
                        payment.direction === "in" ? "text-emerald-700" : "text-destructive"
                      }
                    >
                      {payment.direction === "in" ? "+" : "−"}
                      {formatMoney(payment.amount)}
                    </span>
                    <span className="text-muted-foreground"> · {counterpartyLabel(payment)}</span>
                    <span className="text-muted-foreground"> · {propertyTitle}</span>
                  </p>
                  {payment.comment && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {payment.comment}
                    </p>
                  )}
                </button>
                {status !== "paid" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={markPaidMutation.isPending}
                    onClick={() => markPaidMutation.mutate(payment.id)}
                  >
                    Оплачено
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && view === "month" && (
        <div className="mt-6 overflow-x-auto">
          <div className="grid min-w-[640px] grid-cols-7 gap-px rounded-xl border border-border bg-border">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
              <div
                key={d}
                className="bg-muted/50 px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
            {calendarDays.map((cell, idx) => {
              const dayPayments = cell.date ? (byDay.get(cell.date) ?? []) : [];
              const isToday = cell.date === today;
              return (
                <div
                  key={idx}
                  className={cn(
                    "min-h-[96px] bg-card p-1.5",
                    cell.date ? "cursor-pointer hover:bg-muted/40" : "bg-muted/20",
                  )}
                  onClick={() => {
                    if (cell.date) openCreate(cell.date);
                  }}
                >
                  {cell.day != null && (
                    <p className={cn("mb-1 text-xs font-medium", isToday && "text-primary")}>
                      {cell.day}
                    </p>
                  )}
                  <div className="space-y-1">
                    {dayPayments.slice(0, 3).map((payment) => {
                      const status = effectivePaymentStatus(payment, today);
                      return (
                        <button
                          key={payment.id}
                          type="button"
                          className={cn(
                            "block w-full truncate rounded px-1 py-0.5 text-left text-[11px]",
                            STATUS_TONE[status],
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(payment);
                          }}
                        >
                          {payment.direction === "in" ? "+" : "−"}
                          {Math.round(payment.amount).toLocaleString("ru-RU")}
                        </button>
                      );
                    })}
                    {dayPayments.length > 3 && (
                      <p className="px-1 text-[10px] text-muted-foreground">
                        +{dayPayments.length - 3}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
