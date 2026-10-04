import { Plus } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  counterpartyLabel,
  effectivePaymentStatus,
  formatCompactMoney,
  kindLabel,
  type DayMoneyLedger,
  type Payment,
  type PaymentStatus,
} from "@/lib/finance";
import { formatMoney } from "@/lib/properties";
import { cn } from "@/lib/utils";

export type CellMode = "sums" | "ops";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

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
  cellMode: CellMode;
  onAdd: (date: string) => void;
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
  const byDate = new Map(ledger.map((row) => [row.date, row]));
  const startPad = padMondayFirst(year, monthIndex);
  const cells: Array<DayMoneyLedger | null> = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (const row of ledger) cells.push(row);
  while (cells.length % 7 !== 0) cells.push(null);

  const chartData = ledger.map((row) => ({
    day: String(row.day),
    balance: row.closing,
    gap: row.hasGap ? row.closing : null,
  }));

  const hasAnyGap = ledger.some((row) => row.hasGap);
  const endBalance = ledger.length > 0 ? ledger[ledger.length - 1]!.closing : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Деньги на счетах</h2>
            <p className="text-xs text-muted-foreground">
              План по платежам месяца. Сплошная линия — накопительный остаток.
              {hasAnyGap ? " Красные точки — кассовый разрыв." : ""}
            </p>
          </div>
          <p
            className={cn(
              "text-sm font-semibold tabular-nums",
              endBalance < 0 ? "text-red-600" : "text-emerald-700",
            )}
          >
            на конец месяца: {formatMoney(endBalance)}
          </p>
        </div>
        <div className="h-44 sm:h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="financeBalanceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d9488" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#0d9488" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) =>
                  Math.abs(v) >= 1000
                    ? `${Math.round(v / 1000)}к`
                    : String(Math.round(v))
                }
              />
              <Tooltip
                formatter={(value: number) => [formatMoney(value), "Остаток"]}
                labelFormatter={(label) => `День ${label}`}
              />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="balance"
                name="Остаток"
                stroke="#0f766e"
                strokeWidth={2}
                fill="url(#financeBalanceFill)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="grid min-w-[760px] grid-cols-7 bg-border">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="border-b border-border bg-muted/40 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {d}
            </div>
          ))}
          {cells.map((cell, idx) => {
            if (!cell) {
              return <div key={`empty-${idx}`} className="min-h-[118px] bg-muted/15" />;
            }
            const isToday = cell.date === today;
            return (
              <DayCell
                key={cell.date}
                cell={cell}
                isToday={isToday}
                today={today}
                cellMode={cellMode}
                onAdd={() => onAdd(cell.date)}
                onEdit={onEdit}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" /> Приход
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-red-500" /> Расход
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-teal-700" /> Остаток
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-red-100 ring-1 ring-red-300" /> Кассовый разрыв
        </span>
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
  cellMode: CellMode;
  onAdd: () => void;
  onEdit: (payment: Payment) => void;
}) {
  const hasMoney = cell.income > 0 || cell.expense > 0;
  return (
    <div
      className={cn(
        "group relative flex min-h-[118px] flex-col gap-1 border-b border-r border-border bg-card p-1.5",
        cell.hasGap && "bg-red-50/90",
        isToday && !cell.hasGap && "bg-teal-50/40",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold",
            isToday ? "bg-teal-700 text-white" : "text-foreground",
          )}
        >
          {cell.day}
        </span>
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground opacity-70 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
          title="Добавить операцию"
          onClick={onAdd}
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {cellMode === "sums" ? (
        <div className="mt-auto space-y-0.5 text-[11px] leading-tight tabular-nums">
          {hasMoney ? (
            <>
              {cell.income > 0 && (
                <p className="text-emerald-700">+{Math.round(cell.income).toLocaleString("ru-RU")}</p>
              )}
              {cell.expense > 0 && (
                <p className="text-red-600">−{Math.round(cell.expense).toLocaleString("ru-RU")}</p>
              )}
              <p
                className={cn(
                  "font-medium",
                  cell.saldo > 0
                    ? "text-emerald-800"
                    : cell.saldo < 0
                      ? "text-red-700"
                      : "text-muted-foreground",
                )}
              >
                Δ {formatCompactMoney(cell.saldo)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground/60">—</p>
          )}
          <p
            className={cn(
              "border-t border-border/60 pt-0.5 text-[10px]",
              cell.closing < 0 ? "font-semibold text-red-700" : "text-muted-foreground",
            )}
          >
            ост. {Math.round(cell.closing).toLocaleString("ru-RU")}
          </p>
        </div>
      ) : (
        <div className="mt-0.5 space-y-0.5">
          {cell.payments.length === 0 && (
            <p className="text-[10px] text-muted-foreground/60">Нет операций</p>
          )}
          {cell.payments.slice(0, 4).map((payment) => {
            const status = effectivePaymentStatus(payment, today);
            return (
              <button
                key={payment.id}
                type="button"
                className="flex w-full items-center gap-1 rounded px-0.5 py-0.5 text-left text-[10px] hover:bg-muted/70"
                onClick={() => onEdit(payment)}
                title={`${kindLabel(payment.kind)} · ${counterpartyLabel(payment)}`}
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[status])} />
                <span
                  className={cn(
                    "truncate tabular-nums font-medium",
                    payment.direction === "in" ? "text-emerald-700" : "text-red-600",
                  )}
                >
                  {payment.direction === "in" ? "+" : "−"}
                  {Math.round(payment.amount).toLocaleString("ru-RU")}
                </span>
              </button>
            );
          })}
          {cell.payments.length > 4 && (
            <p className="px-0.5 text-[10px] text-muted-foreground">
              +{cell.payments.length - 4}
            </p>
          )}
          <p
            className={cn(
              "border-t border-border/60 pt-0.5 text-[10px] tabular-nums",
              cell.closing < 0 ? "font-semibold text-red-700" : "text-muted-foreground",
            )}
          >
            ост. {Math.round(cell.closing).toLocaleString("ru-RU")}
          </p>
        </div>
      )}
    </div>
  );
}
