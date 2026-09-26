import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { MaintenanceTabs } from "@/components/MaintenanceTabs";
import { PropertyForm } from "@/components/PropertyForm";
import { fetchProperty, updateProperty, type PropertyInput } from "@/lib/properties";

export const Route = createFileRoute("/_authenticated/maintenance/objects/$id/edit")({
  head: () => ({
    meta: [
      { title: "Редактирование обслуживания — RM OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditMaintenanceObjectPage,
});

function EditMaintenanceObjectPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: property, isLoading, error } = useQuery({
    queryKey: ["properties", id],
    queryFn: () => fetchProperty(id),
  });

  const mutation = useMutation({
    mutationFn: async (input: PropertyInput) =>
      updateProperty(id, {
        ...input,
        type: input.type === "villa" ? "villa" : "house",
        service_type: "management",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["properties"] });
      void queryClient.invalidateQueries({ queryKey: ["properties", id] });
      toast.success("Сохранено");
      void navigate({ to: "/maintenance/objects/$id", params: { id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Загрузка…</div>
    );
  }
  if (error || !property) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-destructive">
        {error instanceof Error ? error.message : "Объект не найден"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <Link
        to="/maintenance/objects/$id"
        params={{ id }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        К карточке
      </Link>
      <h1 className="mb-4 mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        Редактирование
      </h1>
      <MaintenanceTabs active="objects" />
      <div className="mt-6">
        <PropertyForm
          initial={property}
          maintenanceMode
          onSubmit={async (input) => {
            await mutation.mutateAsync(input);
          }}
          submitting={mutation.isPending}
        />
      </div>
    </div>
  );
}
