import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useAccess } from "@/hooks/useAccess";
import { LeaseWorkspace } from "@/components/LeaseDocuments";
export const Route = createFileRoute("/_authenticated/leases")({
  validateSearch: z.object({
    bookingId: z.string().uuid().optional(),
    dealId: z.string().uuid().optional(),
    propertyId: z.string().uuid().optional(),
  }),
  component: LeasePage,
});
function LeasePage() {
  const scope = Route.useSearch(),
    navigate = useNavigate(),
    { isAdmin, loading } = useAccess();
  if (loading) return <p>Проверка доступа…</p>;
  if (!isAdmin) return <p>Договоры доступны только администратору.</p>;
  return (
    <LeaseWorkspace
      {...scope}
      open
      onOpenChange={() =>
        navigate({ to: "/crm/deals", search: { deal: undefined, funnel: undefined } })
      }
    />
  );
}
