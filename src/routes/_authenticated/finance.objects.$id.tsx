import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { FinanceObjectCard } from "@/components/FinanceObjectCard";
export const Route = createFileRoute("/_authenticated/finance/objects/$id")({
  head: () => ({
    meta: [{ title: "Финансы объекта — RM OS" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
function Page() {
  const { id } = Route.useParams();
  return (
    <AdminOnly>
      <FinanceObjectCard id={id} />
    </AdminOnly>
  );
}
