import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { FinanceTabs } from "@/components/FinanceTabs";
import { Button } from "@/components/ui/button";
import { fetchPayments, monthBounds, summarizeMonth } from "@/lib/finance";
import { formatMoney } from "@/lib/properties";

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

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Финансы</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Простой отчёт план/факт за месяц. Полный ДДС и банк — позже.
        </p>
      </header>

      <FinanceTabs active="reports" />

      <div className="mt-6 flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <p className="min-w-[10rem] text-center text-sm font-medium capitalize">{monthTitle}</p>
        <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <ReportCard title="План приход" value={formatMoney(summary.planIn)} />
          <ReportCard title="План расход" value={formatMoney(summary.planOut)} />
          <ReportCard title="Факт приход" value={formatMoney(summary.factIn)} />
          <ReportCard title="Факт расход" value={formatMoney(summary.factOut)} />
          <ReportCard
            title="Остаток плана (приход − расход)"
            value={formatMoney(netPlan)}
            emphasize
          />
          <ReportCard
            title="Остаток факта (приход − расход)"
            value={formatMoney(netFact)}
            emphasize
          />
          <ReportCard
            title="Просрочено"
            value={`${summary.overdueCount} · ${formatMoney(summary.overdueAmount)}`}
            danger={summary.overdueCount > 0}
          />
          <ReportCard title="Строк в месяце" value={String(payments.length)} />
        </div>
      )}
    </div>
  );
}

function ReportCard({
  title,
  value,
  emphasize,
  danger,
}: {
  title: string;
  value: string;
  emphasize?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p
        className={
          "mt-2 text-xl font-semibold tracking-tight " +
          (danger ? "text-destructive" : emphasize ? "text-foreground" : "text-foreground")
        }
      >
        {value}
      </p>
    </div>
  );
}
