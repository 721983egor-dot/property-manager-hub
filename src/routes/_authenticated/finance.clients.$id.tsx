import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { FinanceWorkspacePage } from "@/components/FinanceWorkspacePage";
export const Route = createFileRoute("/_authenticated/finance/clients/$id")({
  head: () => ({ meta: [{ title: "Финансы — РМ ОС" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});
function Page() {
  return (
    <AdminOnly>
      <FinanceWorkspacePage mode="clients" clientId={Route.useParams().id} />
    </AdminOnly>
  );
}
