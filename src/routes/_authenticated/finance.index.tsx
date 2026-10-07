import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { FinanceAnalyticsPage } from "@/components/FinanceAnalyticsPage";
export const Route = createFileRoute("/_authenticated/finance/")({
  head: () => ({
    meta: [{ title: "Финансовый дашборд — RM OS" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <AdminOnly>
      <FinanceAnalyticsPage dashboard />
    </AdminOnly>
  ),
});
