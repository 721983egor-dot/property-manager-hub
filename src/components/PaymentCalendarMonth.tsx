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
import { cn } from "@/lib/utils";

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
  cellMode: "sums" | "ops";
  onAdd: (date: string, direction: PaymentDirection) => void;
  onEdit: (payment: Payment) => void;
};

function padMondayFirst(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1);
  return (first.getDay() + 6) % 7;
}

export function PaymentCalendarMonth({
  year,
  monthIndex,
  ledger,
  today,
  cellMode,
  onAdd,
  onEdit,
}: Props) {
  const startPad = padMondayFirst(year, monthIndex);
  const cells: Array<DayMoneyLedger | null> = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (const row of ledger) cells.push(row);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-0 overflow-hidden rounded-xl border border-[#e8edf2] bg-white">
      <Suspense
        fallback={
          <div className="flex h-[200px] items-center px-4 text-sm text-muted-foreground sm:h-[220px]">
            График…
          </div>
        }
      >
        <PaymentAccountsChart ledger={ledger} today={today} />
      </Suspense>

      <div className="overflow-x-auto border-t border-[#e8edf2]">
        <div className="grid min-w-[920px] grid-cols-7">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="border-b border-[#e8edf2] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-400"
            >
              {d}
            </div>
          ))}
          {cells.map((cell, idx) => {
            if (!cell) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="min-h-[156px] border-b border-r border-[#e8edf2] bg-[#fafbfc]"
                />
              );
            }
            return (
              <DayCell
                key={cell.date}
                cell={cell}
                isToday={cell.date === today}
                today={today}
                cellMode={cellMode}
                onAdd={onAdd}
                onEdit={onEdit}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

const DayCell = memo(function DayCell({
  cell,
  isToday,
  today,
  cellMode,
  onAdd,
  onEdit,
}: {
  cell: DayMoneyLedger;
  isToday: boolean;
  today: string;
  cellMode: "sums" | "ops";
  onAdd: (date: string, direction: PaymentDirection) => void;
  onEdit: (payment: Payment) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const net = cell.saldo;
  const hasActivity = cell.income > 0 || cell.expense > 0 || cell.payments.length > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div
      className={cn(
        "group relative flex min-h-[156px] flex-col border-b border-r border-[#e8edf2] bg-white p-2",
        cell.hasGap && "bg-[#fff1f1]",
        isToday && !cell.hasGap && "bg-[#f8fafc]",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className={cn(
              "inline-flex size-6 items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700",
              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
            )}
            title="Добавить операцию"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-7 z-30 w-36 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm text-[#16a34a] hover:bg-emerald-50"
                onClick={() => {
                  setMenuOpen(false);
                  onAdd(cell.date, "in");
                }}
              >
                Приход
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm text-[#dc2626] hover:bg-red-50"
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
        <span
          className={cn(
            "text-[13px] tabular-nums",
            isToday ? "font-semibold text-slate-900" : "text-slate-500",
          )}
        >
          {cell.day}
        </span>
      </div>

      {cell.hasGap ? (
        <div className="mt-2 flex flex-1 items-center justify-center rounded-md border border-dashed border-[#f87171] bg-[#fff1f1] px-2 py-5 text-center">
          <p className="text-[15px] font-semibold leading-snug text-[#ef4444]">
            {formatGapLabel(cell.closing)}
          </p>
        </div>
      ) : cellMode === "ops" ? (
        <div className="mt-1 space-y-0.5">
          {cell.payments.slice(0, 4).map((payment) => {
            const status = effectivePaymentStatus(payment, today);
            return (
              <button
                key={payment.id}
                type="button"
                className="flex w-full items-center gap-1 rounded px-0.5 py-0.5 text-left text-[11px] hover:bg-slate-50"
                onClick={() => onEdit(payment)}
                title={`${kindLabel(payment.kind)} · ${counterpartyLabel(payment)}`}
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[status])} />
                <span
                  className={cn(
                    "truncate tabular-nums",
                    payment.direction === "in" ? "text-[#16a34a]" : "text-[#dc2626]",
                  )}
                >
                  {formatAdeskMoney(
                    payment.direction === "in" ? payment.amount : -payment.amount,
                    true,
                  )}
                </span>
              </button>
            );
          })}
          {cell.payments.length > 4 && (
            <p className="px-0.5 text-[10px] text-slate-400">+{cell.payments.length - 4}</p>
          )}
        </div>
      ) : (
        <div className="mt-0.5 flex flex-1 flex-col gap-0.5 text-[12px] leading-tight tabular-nums">
          {hasActivity ? (
            <>
              <p className="text-slate-400">{formatAdeskMoney(cell.opening)}</p>
              {cell.income > 0 && (
                <p className="font-medium text-[#16a34a]">{formatAdeskMoney(cell.income, true)}</p>
              )}
              {cell.expense > 0 && (
                <p className="font-medium text-[#b91c1c]">
                  {formatAdeskMoney(-cell.expense, true)}
                </p>
              )}
              {(cell.income > 0 || cell.expense > 0) && (
                <button
                  type="button"
                  className={cn(
                    "mt-0.5 rounded px-1.5 py-1 text-left text-[13px] font-semibold",
                    net > 0
                      ? "bg-[#9fd0d0] text-[#0f4f4f]"
                      : net < 0
                        ? "bg-[#e8a0a0] text-[#7f1d1d]"
                        : "bg-slate-100 text-slate-500",
                  )}
                  onClick={() => {
                    if (cell.payments[0]) onEdit(cell.payments[0]!);
                  }}
                >
                  {formatAdeskMoney(net, true)}
                </button>
              )}
              <p className="mt-auto pt-1 text-slate-400">{formatAdeskMoney(cell.closing)}</p>
            </>
          ) : (
            <div className="flex-1" />
          )}
        </div>
      )}
    </div>
  );
});

export type { Props as PaymentCalendarMonthProps };
