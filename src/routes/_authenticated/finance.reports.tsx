import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, Fragment } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AdminOnly } from "@/components/AdminOnly";
import { FinanceTabs } from "@/components/FinanceTabs";
import { Button } from "@/components/ui/button";
import { fetchPayments, monthBounds, summarizeMonth } from "@/lib/finance";
import { fetchFinanceCatalog, summarizeByArticleCategory } from "@/lib/finance-articles";
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
  component: () => (
    <AdminOnly>
      <FinanceReportsPage />
    </AdminOnly>
  ),
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
  const { data: catalog } = useQuery({
    queryKey: ["finance-catalog"],
    queryFn: fetchFinanceCatalog,
    staleTime: 60 * 1000,
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
  const byIncome = useMemo(
    () =>
      summarizeByArticleCategory(payments, catalog ?? { categories: [], articles: [] }, "in"),
    [payments, catalog],
  );
  const byExpense = useMemo(
    () =>
      summarizeByArticleCategory(payments, catalog ?? { categories: [], articles: [] }, "out"),
    [payments, catalog],
  );

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

          <CategoryReport title="Приход по категориям" rows={byIncome} />
          <CategoryReport title="Расход по категориям" rows={byExpense} />
        </>
      )}
    </div>
  );
}

function CategoryReport({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; categoryName: string; plan: number; fact: number; articles: { key: string; name: string; plan: number; fact: number }[] }[];
}) {
  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-muted-foreground">Группы статей из настроек финансов.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">За месяц нет операций этого типа.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Статья</th>
                <th className="py-2 pr-3 text-right font-medium">План</th>
                <th className="py-2 text-right font-medium">Факт</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.key}>
                  <tr className="border-b border-border bg-muted/40">
                    <td className="py-2 pr-3 font-medium">{row.categoryName}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(row.plan)}</td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(row.fact)}</td>
                  </tr>
                  {row.articles.map((article) => (
                    <tr key={article.key} className="border-b border-border/60">
                      <td className="py-1.5 pl-4 pr-3 text-muted-foreground">{article.name}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                        {formatMoney(article.plan)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatMoney(article.fact)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
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
