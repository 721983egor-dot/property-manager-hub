import { lazy, memo, Suspense, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import {
  counterpartyLabel,
  effectivePaymentStatus,
  formatAdeskMoney,
  formatGapLabel,
  kindLabel,
  type DayMoneyLedger,
  type Payment,
  type PaymentDirection,
  type PaymentStatus,
} from "@/lib/finance";
import { toISODate } from "@/lib/rentals";
import { cn } from "@/lib/utils";
import "./finance-calendar.css";

export type CellMode = "sums" | "ops";
const WEEKDAYS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];
const STATUS_DOT: Record<PaymentStatus, string> = {
  expected: "bg-sky-500",
  partial: "bg-amber-500",
  paid: "bg-emerald-500",
  overdue: "bg-red-500",
};
const PaymentAccountsChart = lazy(() => import("@/components/PaymentAccountsChart"));

type Props = {
  year: number;
  monthIndex: number;
  ledger: DayMoneyLedger[];
  today: string;
  cellMode: CellMode;
  onAdd: (date: string, direction: PaymentDirection) => void;
  onEdit: (payment: Payment) => void;
  onDay: (date: string) => void;
};

export function PaymentCalendarMonth({
  year,
  monthIndex,
  ledger,
  today,
  cellMode,
  onAdd,
  onEdit,
  onDay,
}: Props) {
  const startPad = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const cellCount = Math.ceil((startPad + ledger.length) / 7) * 7;
  const byDate = new Map(ledger.map((row) => [row.date, row]));
  const dates = Array.from(
    { length: cellCount },
    (_, i) => new Date(year, monthIndex, i - startPad + 1),
  );

  return (
    <div className="finance-month-layout">
      <Suspense fallback={<div className="finance-chart-loading">Загрузка графика…</div>}>
        <PaymentAccountsChart ledger={ledger} today={today} />
      </Suspense>
      <div className="finance-calendar-card">
        <div className="finance-calendar-scroll">
          <div className="finance-week-grid">
            {WEEKDAYS.map((day) => (
              <div key={day} className="finance-weekday">
                {day}
              </div>
            ))}
            {dates.map((date) => {
              const iso = toISODate(date);
              const cell = byDate.get(iso);
              if (!cell)
                return (
                  <div key={iso} className="finance-day finance-day-outside">
                    <button
                      type="button"
                      className="finance-outside-add"
                      aria-label={`Добавить операцию на ${iso}`}
                      onClick={() => onAdd(iso, "out")}
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      type="button"
                      className="finance-day-number"
                      aria-label={`Операции за ${iso}`}
                      onClick={() => onDay(iso)}
                    >
                      {date.getDate()}
                    </button>
                  </div>
                );
              return (
                <DayCell
                  key={iso}
                  cell={cell}
                  today={today}
                  cellMode={cellMode}
                  onAdd={onAdd}
                  onDay={onDay}
                  onEdit={onEdit}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const DayCell = memo(function DayCell({
  cell,
  today,
  cellMode,
  onAdd,
  onEdit,
  onDay,
}: {
  cell: DayMoneyLedger;
  today: string;
  cellMode: CellMode;
  onAdd: Props["onAdd"];
  onEdit: Props["onEdit"];
  onDay: Props["onDay"];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isToday = cell.date === today;
  const showGap = isToday && cell.closing < 0;
  const hasActivity = cell.payments.length > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div
      className={cn(
        "finance-day",
        showGap && "finance-day-gap",
        isToday && "finance-day-today",
        cell.date > today && "finance-day-future",
      )}
    >
      <div className="finance-day-top">
        <div className="finance-day-menu-anchor" ref={menuRef}>
          <button
            type="button"
            className={cn("finance-day-add", menuOpen && "finance-day-add-open")}
            aria-label={`Добавить операцию на ${cell.date}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Plus size={16} />
          </button>
          {menuOpen && (
            <div className="finance-day-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="finance-income"
                onClick={() => {
                  setMenuOpen(false);
                  onAdd(cell.date, "in");
                }}
              >
                Приход
              </button>
              <button
                type="button"
                role="menuitem"
                className="finance-expense"
                onClick={() => {
                  setMenuOpen(false);
                  onAdd(cell.date, "out");
                }}
              >
                Расход
              </button>
            </div>
          )}
        </div>
        {showGap && <span className="finance-gap-title">{formatGapLabel(cell.closing)}</span>}
        <button
          type="button"
          className="finance-day-number"
          aria-label={`Операции за ${cell.date}`}
          onClick={() => onDay(cell.date)}
        >
          {cell.day}
        </button>
      </div>
      {cellMode === "ops" ? (
        <div className="finance-day-operations">
          {cell.payments.map((payment) => (
            <button
              key={payment.id}
              type="button"
              onClick={() => onEdit(payment)}
              title={`${payment.article?.name ?? kindLabel(payment.kind)} · ${counterpartyLabel(payment)}`}
            >
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  STATUS_DOT[effectivePaymentStatus(payment, today)],
                )}
              />
              <span className={payment.direction === "in" ? "finance-income" : "finance-expense"}>
                {formatAdeskMoney(
                  payment.direction === "in" ? payment.amount : -payment.amount,
                  true,
                )}
              </span>
            </button>
          ))}
        </div>
      ) : hasActivity ? (
        <div className="finance-day-amounts">
          <p className="finance-day-balance">{formatAdeskMoney(cell.opening)}</p>
          <p className={cell.income > 0 ? "finance-income" : ""}>
            {formatAdeskMoney(cell.income, true)}
          </p>
          <p className={cell.expense > 0 ? "finance-expense" : ""}>
            {cell.expense === 0 ? "−0,00 ₽" : formatAdeskMoney(-cell.expense, true)}
          </p>
          <button
            type="button"
            className={cn(
              "finance-day-net",
              cell.saldo > 0
                ? "finance-net-positive"
                : cell.saldo < 0
                  ? "finance-net-negative"
                  : "finance-net-zero",
            )}
            aria-label={`Операции на ${cell.date}: ${cell.payments.length}. Открыть день`}
            onClick={() => onDay(cell.date)}
          >
            {formatAdeskMoney(cell.saldo, true)}
          </button>
          <p className="finance-day-balance">{formatAdeskMoney(cell.closing)}</p>
        </div>
      ) : null}
    </div>
  );
});
export type { Props as PaymentCalendarMonthProps };
