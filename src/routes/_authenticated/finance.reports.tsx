import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FinanceTabs } from "@/components/FinanceTabs";
import { Button } from "@/components/ui/button";
import { fetchPayments, monthBounds, summarizeMonth } from "@/lib/finance";
import { formatMoney } from "@/lib/properties";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/finance/reports")({
  head: () => ({
    meta: [
      { title: "Финансы — отчёты — RM OS" },
      {
        name: "description",
        content: "План и факт оплат за месяц.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FinanceReportsPage,
});

function FinanceReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const bounds = useMemo(() => monthBounds(year, monthIndex), [year, monthIndex]);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments", "report", bounds.from, bounds.to],
    queryFn: () => fetchPayments({ from: bounds.from, to: bounds.to }),
  });

  const summary = useMemo(
    () => summarizeMonth(payments, bounds.monthKey),
    [payments, bounds.monthKey],
  );

  const monthTitle = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));

  const shiftMonth = (delta: number) => {
    const next = new Date(year, monthIndex + delta, 1);
    setYear(next.getFullYear());
    setMonthIndex(next.getMonth());
  };

  const netPlan = summary.planIn - summary.planOut;
  const netFact = summary.factIn - summary.factOut;

  const chart = [
    { name: "Приход", plan: summary.planIn, fact: summary.factIn },
    { name: "Расход", plan: summary.planOut, fact: summary.factOut },
  ];

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Отчёты</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          План и факт за месяц. Полный ДДС и банк — позже.
        </p>
      </header>

      <FinanceTabs active="reports" />

      <div className="mt-6 flex items-center gap-1 rounded-md border border-border bg-card p-0.5 w-fit">
        <Button type="button" variant="ghost" size="icon" onClick={() => shiftMonth(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <p className="min-w-[10rem] text-center text-sm font-semibold capitalize">{monthTitle}</p>
        <Button type="button" variant="ghost" size="icon" onClick={() => shiftMonth(1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ReportCard title="План приход" value={formatMoney(summary.planIn)} tone="text-emerald-700" />
            <ReportCard title="План расход" value={formatMoney(summary.planOut)} tone="text-red-600" />
            <ReportCard title="Факт приход" value={formatMoney(summary.factIn)} tone="text-emerald-700" />
            <ReportCard title="Факт расход" value={formatMoney(summary.factOut)} tone="text-red-600" />
            <ReportCard
              title="Сальдо плана"
              value={formatMoney(netPlan)}
              tone={netPlan < 0 ? "text-red-700" : "text-teal-800"}
            />
            <ReportCard
              title="Сальдо факта"
              value={formatMoney(netFact)}
              tone={netFact < 0 ? "text-red-700" : "text-teal-800"}
            />
            <ReportCard
              title="Просрочено"
              value={`${summary.overdueCount} · ${formatMoney(summary.overdueAmount)}`}
              {...(summary.overdueCount > 0 ? { tone: "text-red-700" } : {})}
            />
            <ReportCard title="Операций" value={String(payments.length)} />
          </div>

          <div className="mt-6 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">План / факт</h2>
            <p className="mb-3 text-xs text-muted-foreground">Сравнение сумм прихода и расхода.</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} barGap={8}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v: number) =>
                      Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}к` : String(Math.round(v))
                    }
                  />
                  <Tooltip formatter={(value: number) => formatMoney(value)} />
                  <Bar dataKey="plan" name="План" fill="#99f6e4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="fact" name="Факт" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ReportCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className={cn("mt-2 text-xl font-semibold tracking-tight tabular-nums", tone)}>
        {value}
      </p>
    </div>
  );
}
