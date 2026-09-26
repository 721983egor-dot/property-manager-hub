import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { MaintenanceTabs } from "@/components/MaintenanceTabs";
import { PropertyForm } from "@/components/PropertyForm";
import { createProperty, type PropertyInput } from "@/lib/properties";

export const Route = createFileRoute("/_authenticated/maintenance/objects/new")({
  head: () => ({
    meta: [
      { title: "Новый объект обслуживания — RM OS" },
      { name: "description", content: "Добавление дома или виллы в блок обслуживания." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewMaintenanceObjectPage,
});

function NewMaintenanceObjectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: PropertyInput) =>
      createProperty({
        ...input,
        type: input.type === "villa" ? "villa" : "house",
        service_type: "management",
        // Не публикуем на сайт автоматически.
        published: input.published,
        for_rent: input.for_rent,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Объект добавлен в обслуживание");
      if (created?.id) {
        void navigate({ to: "/maintenance/objects/$id", params: { id: created.id } });
      } else {
        void navigate({ to: "/maintenance/objects" });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <Link
        to="/maintenance/objects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Обслуживание
      </Link>
      <h1 className="mb-2 mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        Новый объект обслуживания
      </h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Дом или вилла на управлении. На сайт не публикуется, пока не отметите публикацию. В аренду —
        отдельная галочка.
      </p>
      <MaintenanceTabs active="objects" />
      <div className="mt-6">
        <PropertyForm
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
