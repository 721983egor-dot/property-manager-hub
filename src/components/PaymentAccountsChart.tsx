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

import { formatAdeskMoney, type DayMoneyLedger } from "@/lib/finance";

type Props = {
  ledger: DayMoneyLedger[];
  today: string;
};

export default function PaymentAccountsChart({ ledger, today }: Props) {
  const chartData = ledger.map((row) => ({
    date: row.date,
    balance: row.closing,
    negative: row.closing < 0 ? row.closing : null,
  }));
  const todayInMonth = ledger.some((row) => row.date === today);
  const endBalance = ledger.length > 0 ? ledger[ledger.length - 1]!.closing : 0;
  const lineNegative = endBalance < 0;

  return (
    <div className="bg-white px-1 pb-1 pt-3">
      <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-800">
        Деньги на счетах
      </p>
      <div className="h-[200px] sm:h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 18, right: 12, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="financeGapFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f87171" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#f87171" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              minTickGap={36}
              tickFormatter={(value: string) => {
                const [y, m, d] = String(value).split("-");
                if (!d) return String(value);
                return `${d}.${m}.${y ?? ""}`;
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v: number) =>
                Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}K` : String(Math.round(v))
              }
            />
            <Tooltip
              formatter={(value: number) => [formatAdeskMoney(value), "Остаток"]}
              labelFormatter={(label) => String(label)}
            />
            <ReferenceLine y={0} stroke="#e2e8f0" />
            {todayInMonth && (
              <ReferenceLine
                x={today}
                stroke="#cbd5e1"
                strokeDasharray="4 4"
                label={{ value: "Сегодня", position: "top", fontSize: 11, fill: "#94a3b8" }}
              />
            )}
            <Area
              type="monotone"
              dataKey="negative"
              stroke="none"
              fill="url(#financeGapFill)"
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="balance"
              name="Остаток"
              stroke={lineNegative ? "#ef4444" : "#0f766e"}
              strokeWidth={2}
              strokeDasharray={lineNegative ? "5 4" : undefined}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
