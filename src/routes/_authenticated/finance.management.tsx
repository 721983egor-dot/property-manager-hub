import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { FinanceManagementPage } from "@/components/FinanceManagementPage";

export const Route = createFileRoute("/_authenticated/finance/management")({
  head: () => ({
    meta: [{ title: "Доход от управления — RM OS" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <AdminOnly>
      <FinanceManagementPage />
    </AdminOnly>
  ),
});
