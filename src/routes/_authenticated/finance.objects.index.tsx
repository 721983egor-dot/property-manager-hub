import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { FinanceObjectsPage } from "@/components/FinanceObjectsPage";
export const Route = createFileRoute("/_authenticated/finance/objects/")({
  head: () => ({
    meta: [{ title: "Финансы — объекты — RM OS" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <AdminOnly>
      <FinanceObjectsPage />
    </AdminOnly>
  ),
});
