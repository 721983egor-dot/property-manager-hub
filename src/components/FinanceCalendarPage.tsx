import { fetchFinanceObjectAssignments } from "@/lib/finance-objects";
import { fetchOwnerSettlements } from "@/lib/finance-owner-settlements";
import { FinanceObjectFlowSelector } from "@/components/FinanceObjectFlowSelector";
import { useFinanceObjectFlow } from "@/hooks/use-finance-object-flow";
import { objectFlowPayments, objectFlowSourceId, objectFlowNotes } from "@/lib/finance-object-flow";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Heart,
  Plus,
  RotateCcw,
  Settings,
  Star,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FinanceTabs } from "@/components/FinanceTabs";
import { PaymentCalendarMonth, type CellMode } from "@/components/PaymentCalendarMonth";
import { FinanceDayCard } from "@/components/FinanceDayCard";
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
  counterpartyLabel,
  effectivePaymentStatus,
  fetchFinancePropertyOptions,
  fetchPayments,
  financePropertyLabel,
  rentalPaymentLabel,
  markPaymentPaid,
  monthBounds,
  statusLabel,
  type Payment,
  type PaymentDirection,
  type PaymentStatus,
} from "@/lib/finance";
import { formatMoney, internalTitle } from "@/lib/properties";
import { cn } from "@/lib/utils";
import { useFinanceToday } from "@/hooks/use-finance-today";
import { fetchFinanceCatalog } from "@/lib/finance-articles";
import {
  buildFinanceCalendar,
  findOpeningAnchor,
  financeOpeningScope,
  openingAnchorKey,
  type OpeningAnchor,
} from "@/lib/finance-calendar-model";
import { fetchFinanceAccounts } from "@/lib/finance-accounts";
import "./finance-calendar.css";

type ViewMode = "month" | "list";
type StatusFilter = "all" | "open" | PaymentStatus;

const STATUS_TONE: Record<PaymentStatus, string> = {
  expected: "bg-sky-500/15 text-sky-700",
  partial: "bg-amber-500/15 text-amber-800",
  paid: "bg-emerald-500/15 text-emerald-800",
  overdue: "bg-red-500/15 text-red-700",
};

export function FinanceCalendarPage() {
  const queryClient = useQueryClient();
  const today = useFinanceToday();
  const [flow, setFlow] = useFinanceObjectFlow("total", "rm-os-finance-calendar-flow");
  const now = new Date(`${today}T12:00:00`);
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [view, setView] = useState<ViewMode>("month");
  const [cellMode, setCellMode] = useState<CellMode>("sums");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [propertyId, setPropertyId] = useState<string>("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>("");
  const [defaultDirection, setDefaultDirection] = useState<PaymentDirection>("out");
  const [openingDraft, setOpeningDraft] = useState<string | null>(null);
  const [openingAnchor, setOpeningAnchor] = useState<OpeningAnchor | null>(null);
  const [actualOpeningAnchor, setActualOpeningAnchor] = useState<OpeningAnchor | null>(null);
  const [showOpening, setShowOpening] = useState(false);
  const [account, setAccount] = useState("all");
  const [articleId, setArticleId] = useState("all");
  const [favorite, setFavorite] = useState(false);

  const bounds = useMemo(() => monthBounds(year, monthIndex), [year, monthIndex]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("rm-os-finance-filters");
      if (!saved) return;
      const value = JSON.parse(saved) as Record<string, unknown>;
      if (typeof value["propertyId"] === "string") setPropertyId(value["propertyId"]);
      if (typeof value["account"] === "string") setAccount(value["account"]);
      if (typeof value["articleId"] === "string") setArticleId(value["articleId"]);
      if (
        ["all", "open", "expected", "partial", "paid", "overdue"].includes(
          String(value["statusFilter"]),
        )
      )
        setStatusFilter(
          value["statusFilter"] === "overdue" ? "paid" : (value["statusFilter"] as StatusFilter),
        );
      setFavorite(true);
    } catch {
      /* unavailable or invalid saved preferences */
    }
  }, []);

  const { data: accounts = [], isSuccess: accountsReady } = useQuery({
    queryKey: ["finance-accounts"],
    queryFn: fetchFinanceAccounts,
  });
  useEffect(() => {
    if (
      accountsReady &&
      account !== "all" &&
      !accounts.some((a) => a.name === account && !a.archived)
    )
      setAccount("all");
  }, [accountsReady, accounts, account]);
  const accountScope = accounts.find((a) => a.name === account)?.id ?? account;
  const scope = financeOpeningScope(propertyId, accountScope, articleId, flow);
  useEffect(() => {
    setOpeningDraft(null);
    try {
      setOpeningAnchor(findOpeningAnchor(localStorage, bounds.monthKey, scope));
      setActualOpeningAnchor(
        findOpeningAnchor(
          localStorage,
          bounds.monthKey < today.slice(0, 7) ? bounds.monthKey : today.slice(0, 7),
          scope,
        ),
      );
    } catch {
      setOpeningAnchor(null);
      setActualOpeningAnchor(null);
    }
  }, [bounds.monthKey, scope, today]);

  // Лёгкий список объектов (не select(*) через server fn) — не блокирует календарь.
  const { data: propertyOptions = [] } = useQuery({
    queryKey: ["finance-property-options"],
    queryFn: fetchFinancePropertyOptions,
    staleTime: 5 * 60 * 1000,
  });

  const { data: catalog } = useQuery({
    queryKey: ["finance-catalog"],
    queryFn: fetchFinanceCatalog,
    staleTime: 60 * 1000,
  });

  const {
    data: payments = [],
    isLoading,
    isFetching,
    error: paymentsError,
  } = useQuery({
    queryKey: ["payments", "calendar-history"],
    queryFn: () => fetchPayments(),
    staleTime: 30 * 1000,
  });

  const rentalSettings = useQuery({
    queryKey: ["finance-object-settings"],
    queryFn: fetchFinanceObjectAssignments,
  });
  const ownerSettlements = useQuery({
    queryKey: ["finance-owner-settlements", "calendar"],
    queryFn: () => fetchOwnerSettlements(),
  });
  const scoped = useMemo(
    () =>
      objectFlowPayments(
        propertyId === "all" ? null : propertyId,
        payments,
        catalog ?? { articles: [], categories: [] },
        flow,
        rentalSettings.data ?? [],
        ownerSettlements.data ?? [],
      ).filter(
        (payment) =>
          (account === "all" || payment.account === account) &&
          (articleId === "all" || payment.article_id === articleId),
      ),
    [
      payments,
      catalog,
      flow,
      rentalSettings.data,
      ownerSettlements.data,
      propertyId,
      account,
      articleId,
    ],
  );
  const calendar = useMemo(
    () => buildFinanceCalendar(scoped, year, monthIndex, today, openingAnchor, actualOpeningAnchor),
    [scoped, year, monthIndex, today, openingAnchor, actualOpeningAnchor],
  );
  const openingBalance = calendar.opening;
  const filtered = useMemo(
    () =>
      scoped.filter((payment) => {
        if (payment.planned_date < bounds.from || payment.planned_date > bounds.to) return false;
        const status = effectivePaymentStatus(payment, today);
        return (
          statusFilter === "all" ||
          (statusFilter === "open" ? status !== "paid" : status === statusFilter)
        );
      }),
    [scoped, bounds.from, bounds.to, statusFilter, today],
  );
  // Display filters hide operations, but never erase money already received from the balance.
  const ledger = useMemo(() => {
    const ids = new Set(filtered.map((p) => p.id));
    return calendar.ledger.map((row) => ({
      ...row,
      payments: row.payments.filter((p) => ids.has(p.id)),
    }));
  }, [calendar, filtered]);

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => markPaymentPaid(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Операция проведена");
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
    if (payment.id.startsWith("owner-forecast:")) {
      toast.info(
        "Это прогноз. Начисление появится после поступления аренды; условия — в разделе Собственники.",
      );
      return;
    }
    const source = payments.find((p) => p.id === objectFlowSourceId(payment.id));
    if (!source) {
      toast.error("Исходная операция не найдена");
      return;
    }
    if (source.id !== payment.id)
      toast.info("Открыт полный исходный платёж. Доля потока рассчитывается автоматически.");
    setEditing(source);
    setDefaultDate("");
    setDialogOpen(true);
  };

  const monthTitle = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  })
    .format(new Date(year, monthIndex, 1))
    .replace(/\s*г\.?$/, "");

  const applyOpening = (): void => {
    const value = Number(openingDraft ?? openingBalance);
    if (!Number.isFinite(value)) {
      toast.error("Укажите корректный остаток");
      return;
    }
    try {
      localStorage.setItem(openingAnchorKey(bounds.monthKey, scope), String(value));
    } catch {
      toast.error("Не удалось сохранить начальный остаток");
      return;
    }
    setOpeningAnchor({ date: bounds.from, amount: value });
    if (bounds.from <= today) setActualOpeningAnchor({ date: bounds.from, amount: value });
    setOpeningDraft(null);
    toast.success("Начальный остаток сохранён и будет перенесён в следующие месяцы");
  };

  return (
    <div className="finance-ui finance-calendar-page">
      <header className="finance-page-header">
        <h1>Платежный календарь</h1>
        <FinanceTabs active="calendar" />
      </header>

      <div className="finance-calendar-body">
        <div className="mb-5 space-y-2">
          <FinanceObjectFlowSelector value={flow} onChange={setFlow} label="Поток денег" />
          <p className="text-sm text-slate-500">
            {flow === "total"
              ? "Все поступления и расходы, включая деньги компании, собственников и страховые депозиты. Комиссия внутри аренды не дублируется."
              : objectFlowNotes[flow]}
          </p>
        </div>
        <div className="finance-toolbar">
          <button
            type="button"
            className="finance-toolbar-button finance-arrow"
            aria-label="Предыдущий месяц"
            onClick={() => shiftMonth(-1)}
          >
            <ArrowLeft size={21} />
          </button>
          <label className="finance-month-picker">
            <span>{monthTitle}</span>
            <CalendarDays size={19} />
            <input
              aria-label="Выбрать месяц"
              type="month"
              value={bounds.monthKey}
              onChange={(event) => {
                const [y, m] = event.target.value.split("-").map(Number);
                if (y && m) {
                  setYear(y);
                  setMonthIndex(m - 1);
                }
              }}
            />
          </label>
          <button
            type="button"
            className="finance-toolbar-button finance-arrow"
            aria-label="Следующий месяц"
            onClick={() => shiftMonth(1)}
          >
            <ArrowRight size={21} />
          </button>
          <button
            type="button"
            className="finance-toolbar-button finance-settings-button"
            aria-expanded={showOpening}
            onClick={() => setShowOpening((v) => !v)}
          >
            <Settings size={17} fill="currentColor" strokeWidth={1.5} /> Настройки
          </button>
          {isFetching && !isLoading && (
            <span className="finance-updating" role="status">
              Обновление…
            </span>
          )}
        </div>

        <div className="finance-project-row">
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger
              className="finance-filter-pill finance-project-pill"
              aria-label="Фильтр объектов"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {propertyOptions.length
                  ? `${propertyOptions.length} ${propertyOptions.length % 100 >= 11 && propertyOptions.length % 100 <= 14 ? "объектов" : propertyOptions.length % 10 === 1 ? "объект" : propertyOptions.length % 10 >= 2 && propertyOptions.length % 10 <= 4 ? "объекта" : "объектов"} + без объекта`
                  : "Все объекты + без объекта"}
              </SelectItem>
              {propertyOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {financePropertyLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            className="finance-filter-icon"
            aria-label="Сбросить фильтры"
            title="Сбросить фильтры"
            onClick={() => {
              setPropertyId("all");
              setAccount("all");
              setArticleId("all");
              setStatusFilter("all");
            }}
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            className="finance-filter-icon"
            aria-label="Добавить операцию"
            title="Добавить операцию"
            onClick={() => openCreate()}
          >
            <Plus size={21} />
          </button>
          <button
            type="button"
            className={cn("finance-filter-icon", favorite && "finance-favorite-active")}
            aria-label="Закрепить текущие фильтры"
            aria-pressed={favorite}
            title="Закрепить текущие фильтры в этом браузере"
            onClick={() => {
              const next = !favorite;
              setFavorite(next);
              try {
                if (next)
                  localStorage.setItem(
                    "rm-os-finance-filters",
                    JSON.stringify({ propertyId, account, articleId, statusFilter }),
                  );
                else localStorage.removeItem("rm-os-finance-filters");
              } catch {
                /* unavailable storage */
              }
            }}
          >
            <Star size={20} fill={favorite ? "currentColor" : "none"} />
          </button>
        </div>

        <div className="finance-scope-row">
          <Heart size={16} className="finance-scope-heart" />
          <Select value={account} onValueChange={setAccount}>
            <SelectTrigger
              className="finance-filter-pill finance-account-pill"
              aria-label="Фильтр счетов"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все счета</SelectItem>
              {Array.from(new Set([...accounts.filter((a) => !a.archived).map((a) => a.name)]))
                .filter(Boolean)
                .map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={articleId} onValueChange={setArticleId}>
            <SelectTrigger
              className="finance-filter-pill finance-article-pill"
              aria-label="Фильтр статей"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статьи</SelectItem>
              {(catalog?.articles ?? []).map((article) => (
                <SelectItem key={article.id} value={article.id}>
                  {article.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showOpening && (
          <section className="finance-view-settings" aria-label="Настройки календаря">
            <label>
              Начальный остаток
              <Input
                type="number"
                value={openingDraft ?? openingBalance.toFixed(2)}
                onChange={(e) => setOpeningDraft(e.target.value)}
              />
            </label>
            <Button type="button" onClick={applyOpening} disabled={isLoading || !!paymentsError}>
              Применить
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                try {
                  localStorage.removeItem(openingAnchorKey(bounds.monthKey, scope));
                  setOpeningAnchor(findOpeningAnchor(localStorage, bounds.monthKey, scope));
                  setActualOpeningAnchor(
                    findOpeningAnchor(
                      localStorage,
                      bounds.monthKey < today.slice(0, 7) ? bounds.monthKey : today.slice(0, 7),
                      scope,
                    ),
                  );
                  setOpeningDraft(null);
                  toast.success("Остаток рассчитывается по истории операций");
                } catch {
                  toast.error("Не удалось изменить настройку остатка");
                }
              }}
            >
              Считать автоматически
            </Button>
            <label>
              Вид
              <select
                aria-label="Вид календаря"
                value={view}
                onChange={(e) => setView(e.target.value as ViewMode)}
              >
                <option value="month">Календарь</option>
                <option value="list">Список</option>
              </select>
            </label>
            <label>
              В ячейках
              <select
                aria-label="Содержимое ячеек"
                value={cellMode}
                onChange={(e) => setCellMode(e.target.value as CellMode)}
              >
                <option value="sums">Суммы</option>
                <option value="ops">Операции</option>
              </select>
            </label>
            <label>
              Статус
              <select
                aria-label="Статус платежей"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="all">Все статусы</option>
                <option value="open">Не проведено полностью</option>
                <option value="expected">Планируемые</option>
                <option value="partial">Частично</option>
                <option value="paid">Проведённые</option>
              </select>
            </label>
            <p>
              Остаток переносится из предыдущих месяцев автоматически. Ручной остаток сохраняется в
              этом браузере для выбранных фильтров и переносится дальше.
            </p>
          </section>
        )}
        {paymentsError && (
          <p role="alert" className="finance-load-error">
            Не удалось загрузить операции.{" "}
            {paymentsError instanceof Error
              ? paymentsError.message
              : "Попробуйте обновить страницу."}
          </p>
        )}

        {isLoading && <p className="mt-8 text-sm text-slate-500">Загрузка календаря…</p>}

        {!isLoading && view === "month" && (
          <div className="finance-month-content">
            <PaymentCalendarMonth
              chartTitle={
                flow === "company"
                  ? "Деньги компании"
                  : flow === "owner"
                    ? "Деньги собственников у компании"
                    : "Все деньги на счетах"
              }
              year={year}
              monthIndex={monthIndex}
              ledger={ledger}
              chart={calendar.chart}
              today={today}
              cellMode={cellMode}
              onAdd={openCreate}
              onDay={setSelectedDay}
              onEdit={openEdit}
            />
          </div>
        )}

        {(rentalSettings.error || ownerSettlements.error) && (
          <p role="alert" className="text-red-600">
            Не удалось загрузить условия выплат собственникам. Их прогноз может быть неполным.
          </p>
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
                : "Без объекта";
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
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() => openEdit(payment)}
                  >
                    <p className="truncate text-sm">
                      <span className="font-medium">{rentalPaymentLabel(payment)}</span>
                      {payment.expense_bearer && (
                        <span className="text-xs text-slate-500">
                          {" "}
                          · За счёт{" "}
                          {payment.expense_bearer === "owner" ? "собственника" : "компании"}
                        </span>
                      )}
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
                        disabled={
                          markPaidMutation.isPending || payment.id.startsWith("owner-forecast:")
                        }
                        onClick={() =>
                          /^(company|owner):/.test(payment.id)
                            ? openEdit(payment)
                            : markPaidMutation.mutate(payment.id)
                        }
                      >
                        <Check size={16} />{" "}
                        {/^(company|owner):/.test(payment.id) ? "Открыть платёж" : "Провести"}
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
      </div>
      <FinanceDayCard
        rows={scoped}
        flowLabel={flow === "company" ? "Компания" : flow === "owner" ? "Собственник" : "Всего"}
        date={selectedDay}
        onClose={() => setSelectedDay(null)}
        onEdit={(payment) => {
          setSelectedDay(null);
          openEdit(payment);
        }}
        onAdd={(date, direction) => {
          setSelectedDay(null);
          openCreate(date, direction);
        }}
      />
      <PaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        payment={editing}
        defaultPropertyId={propertyId === "all" ? undefined : propertyId}
        defaultDate={defaultDate}
        defaultDirection={defaultDirection}
        defaultCompany={flow === "company"}
      />
    </div>
  );
}
