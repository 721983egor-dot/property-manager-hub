import { Plus } from "lucide-react";
import { useState } from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

const STATUS_DOT: Record<PaymentStatus, string> = {
  expected: "bg-sky-500",
  partial: "bg-amber-500",
  paid: "bg-emerald-500",
  overdue: "bg-red-500",
};

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

  const chartData = ledger.map((row) => ({
    day: row.date.slice(8),
    date: row.date,
    balance: row.closing,
    negative: row.closing < 0 ? row.closing : null,
    positive: row.closing >= 0 ? row.closing : null,
  }));
  const todayRow = ledger.find((row) => row.date === today);
  const endBalance = ledger.length > 0 ? ledger[ledger.length - 1]!.closing : 0;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Деньги на счетах
        </p>
        <div className="h-48 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="financeGapFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tickFormatter={(value: string) => {
                  const [y, m, d] = String(value).split("-");
                  if (!d) return String(value);
                  return `${d}.${m}.${y?.slice(2) ?? ""}`;
                }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) =>
                  Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}K` : String(Math.round(v))
                }
              />
              <Tooltip
                formatter={(value: number) => [formatAdeskMoney(value), "Остаток"]}
                labelFormatter={(label) => String(label)}
              />
              <ReferenceLine y={0} stroke="#e2e8f0" />
              {todayRow && (
                <ReferenceLine
                  x={today}
                  stroke="#cbd5e1"
                  strokeDasharray="3 3"
                  label={{ value: "Сегодня", position: "top", fontSize: 11, fill: "#94a3b8" }}
                />
              )}
              <Area
                type="monotone"
                dataKey="negative"
                stroke="none"
                fill="url(#financeGapFill)"
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="balance"
                name="Остаток"
                stroke={endBalance < 0 ? "#ef4444" : "#0f766e"}
                strokeWidth={2}
                strokeDasharray={endBalance < 0 ? "4 4" : undefined}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <div className="grid min-w-[860px] grid-cols-7">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {d}
            </div>
          ))}
          {cells.map((cell, idx) => {
            if (!cell) {
              return (
                <div key={`empty-${idx}`} className="min-h-[148px] border-b border-r border-border bg-muted/10" />
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

function DayCell({
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
  const net = cell.saldo;

  return (
    <div
      className={cn(
        "group relative flex min-h-[148px] flex-col border-b border-r border-border bg-white p-2",
        cell.hasGap && "bg-red-50",
        isToday && !cell.hasGap && "bg-slate-50/80",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="relative">
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
            title="Добавить операцию"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Plus className="size-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-7 z-20 w-36 overflow-hidden rounded-md border border-border bg-white py-1 shadow-md">
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm text-emerald-700 hover:bg-emerald-50"
                onClick={() => {
                  setMenuOpen(false);
                  onAdd(cell.date, "in");
                }}
              >
                Приход
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
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
            "text-sm tabular-nums",
            isToday ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {cell.day}
        </span>
      </div>

      {cell.hasGap ? (
        <div className="mt-3 flex flex-1 items-center justify-center rounded-md border border-dashed border-red-400 bg-red-50 px-2 py-4 text-center text-sm font-medium text-red-600">
          {formatGapLabel(cell.closing)}
        </div>
      ) : cellMode === "ops" ? (
        <div className="mt-1 space-y-0.5">
          {cell.payments.slice(0, 4).map((payment) => {
            const status = effectivePaymentStatus(payment, today);
            return (
              <button
                key={payment.id}
                type="button"
                className="flex w-full items-center gap-1 rounded px-0.5 py-0.5 text-left text-[11px] hover:bg-muted/70"
                onClick={() => onEdit(payment)}
                title={`${kindLabel(payment.kind)} · ${counterpartyLabel(payment)}`}
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[status])} />
                <span
                  className={cn(
                    "truncate tabular-nums",
                    payment.direction === "in" ? "text-emerald-600" : "text-red-500",
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
            <p className="px-0.5 text-[10px] text-muted-foreground">+{cell.payments.length - 4}</p>
          )}
        </div>
      ) : (
        <div className="mt-1 flex flex-1 flex-col gap-0.5 text-[12px] leading-tight tabular-nums">
          <p className="text-muted-foreground">{formatAdeskMoney(cell.opening)}</p>
          <p className="text-emerald-600">{formatAdeskMoney(cell.income, true)}</p>
          <button
            type="button"
            className={cn(
              "mt-0.5 rounded px-1.5 py-1 text-left text-[13px] font-semibold",
              net > 0
                ? "bg-teal-200/80 text-teal-900"
                : net < 0
                  ? "bg-red-300/80 text-red-900"
                  : "bg-muted text-muted-foreground",
            )}
            onClick={() => {
              if (cell.payments[0]) onEdit(cell.payments[0]!);
            }}
          >
            {formatAdeskMoney(net, true)}
          </button>
          <p className="mt-auto pt-1 text-muted-foreground">{formatAdeskMoney(cell.closing)}</p>
        </div>
      )}
    </div>
  );
}

export type { Props as PaymentCalendarMonthProps };
