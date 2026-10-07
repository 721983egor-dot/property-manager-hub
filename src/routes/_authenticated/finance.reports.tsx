import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { FinanceAnalyticsPage } from "@/components/FinanceAnalyticsPage";
export const Route = createFileRoute("/_authenticated/finance/reports")({
  head: () => ({
    meta: [{ title: "Финансы — отчёты — RM OS" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <AdminOnly>
      <FinanceReportsPage />
    </AdminOnly>
  ),
});
export function FinanceReportsPage() {
  return <FinanceAnalyticsPage />;
}
