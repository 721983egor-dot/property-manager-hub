import type { CalendarCashPoint } from "@/lib/finance-calendar-model";
import { useId, useState } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAdeskMoney, formatFinanceDate, type DayMoneyLedger } from "@/lib/finance";

export default function PaymentAccountsChart({
  ledger,
  title = "Деньги на счетах",
  chart: chartData,
  today,
  companyChart,
}: {
  companyChart?: CalendarCashPoint[];
  title?: string;
  ledger: DayMoneyLedger[];
  chart: CalendarCashPoint[];
  today: string;
}) {
  const id = useId().replace(/:/g, "");
  const [showBank, setShowBank] = useState(true);
  const [showCompany, setShowCompany] = useState(true);
  const companyByDate = new Map(companyChart?.map((point) => [point.date, point]));
  const data = chartData.map((point) => ({
    ...point,
    companyActual: companyByDate.get(point.date)?.actual,
    companyPlan: companyByDate.get(point.date)?.balance,
  }));
  const opening = ledger[0]?.opening ?? 0;
  const values = [
    ...(showBank ? [opening] : []),
    ...(showBank ? chartData.flatMap((d) => [d.balance, d.actual ?? 0]) : []),
    ...(showCompany ? (companyChart ?? []).flatMap((d) => [d.balance, d.actual ?? 0]) : []),
  ];
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const extent = max - min || 1000;
  const magnitude = 10 ** Math.floor(Math.log10(extent / 6));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= extent / 6)! * magnitude;
  const low = min < 0 ? Math.floor((min - extent * 0.08) / step) * step : 0;
  const high = Math.ceil((max + extent * 0.12) / step) * step;
  const ticks = Array.from(
    { length: Math.round((high - low) / step) + 1 },
    (_, i) => low + i * step,
  );
  const forecastMin = Math.min(...chartData.map((d) => d.balance), 0);
  const forecastMax = Math.max(...chartData.map((d) => d.balance), 0);
  const zeroFill = (forecastMax / (forecastMax - forecastMin || 1)) * 100;
  const strokeZero = (values: number[]) => {
    const lower = Math.min(...values);
    const upper = Math.max(...values);
    if (lower >= 0) return 100;
    if (upper <= 0) return 0;
    return (upper / (upper - lower)) * 100;
  };
  const zeroStroke = strokeZero(chartData.map((d) => d.balance));
  const zeroActual = strokeZero(chartData.flatMap((d) => (d.actual === null ? [] : [d.actual])));

  return (
    <section className="finance-accounts-chart" aria-label={title}>
      <h2>{title}</h2>
      {companyChart && (
        <div className="mb-3 flex flex-wrap gap-5 text-sm">
          <label>
            <input
              type="checkbox"
              checked={showBank}
              disabled={!showCompany}
              onChange={(e) => setShowBank(e.target.checked)}
            />{" "}
            Все деньги на счетах · синий
          </label>
          <label>
            <input
              type="checkbox"
              checked={showCompany}
              disabled={!showBank}
              onChange={(e) => setShowCompany(e.target.checked)}
            />{" "}
            Доходы минус расходы компании · зелёный
          </label>
        </div>
      )}
      <div
        className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"
        aria-label="Обозначения линий"
      >
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-7 border-t-[3px] border-blue-600" />
          Факт
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-7 border-t-2 border-dashed border-slate-500" />
          Прогноз с учётом доходов и расходов
        </span>
      </div>
      <div className="finance-accounts-plot">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 26, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c2eee6" stopOpacity={0.5} />
                <stop offset={`${zeroFill}%`} stopColor="#e0f5f0" stopOpacity={0.15} />
                <stop offset={`${zeroFill}%`} stopColor="#fce8e5" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#f4aea5" stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="0" y2="1">
                <stop offset={`${zeroStroke}%`} stopColor="#2786ff" />
                <stop offset={`${zeroStroke}%`} stopColor="#ff422d" />
              </linearGradient>
              <linearGradient id={`${id}-actual-stroke`} x1="0" y1="0" x2="0" y2="1">
                <stop offset={`${zeroActual}%`} stopColor="#2786ff" />
                <stop offset={`${zeroActual}%`} stopColor="#ff422d" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: "#999" }}
              tickMargin={12}
              tickLine={false}
              axisLine={false}
              minTickGap={42}
              tickFormatter={formatFinanceDate}
              height={32}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#999" }}
              tickLine={false}
              axisLine={false}
              width={48}
              domain={[low, high]}
              ticks={ticks}
              interval={0}
              tickCount={7}
              tickFormatter={(v: number) =>
                Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}K` : String(Math.round(v))
              }
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatAdeskMoney(value),
                companyChart
                  ? ((
                      {
                        actual: "Все деньги · факт",
                        balance: "Все деньги · прогноз",
                        companyActual: "Компания · факт",
                        companyPlan: "Компания · прогноз",
                      } as Record<string, string>
                    )[name] ?? name)
                  : name === "actual"
                    ? "Фактический остаток"
                    : "Плановый остаток",
              ]}
              labelFormatter={(label) => formatFinanceDate(String(label))}
              contentStyle={{ border: "1px solid #e5e5e5", borderRadius: 3, fontSize: 13 }}
            />
            <Area
              hide={!showBank}
              type="monotone"
              dataKey="balance"
              baseValue={0}
              stroke="none"
              fill={`url(#${id}-fill)`}
              isAnimationActive={false}
              tooltipType="none"
            />
            {ledger.some((row) => row.date === today) && (
              <ReferenceLine
                x={today}
                stroke="#ddd"
                strokeDasharray="4 3"
                label={{ value: "Сегодня", position: "top", fontSize: 12, fill: "#999" }}
              />
            )}
            <Line
              hide={!showBank}
              type="monotone"
              dataKey="balance"
              stroke={
                zeroStroke === 0 ? "#ff422d" : zeroStroke === 100 ? "#2786ff" : `url(#${id}-stroke)`
              }
              strokeWidth={1.8}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              hide={!companyChart || !showCompany}
              type="monotone"
              dataKey="companyPlan"
              stroke="#22845b"
              strokeWidth={1.8}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              hide={!companyChart || !showCompany}
              type="monotone"
              dataKey="companyActual"
              stroke="#22845b"
              strokeWidth={2.6}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              hide={!showBank}
              type="monotone"
              dataKey="actual"
              stroke={
                zeroActual === 0
                  ? "#ff422d"
                  : zeroActual === 100
                    ? "#2786ff"
                    : `url(#${id}-actual-stroke)`
              }
              strokeWidth={2.6}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
