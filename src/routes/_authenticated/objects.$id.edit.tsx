import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { PropertyForm } from "@/components/PropertyForm";
import { fetchProperty, updateProperty, type PropertyInput } from "@/lib/properties";

export const Route = createFileRoute("/_authenticated/objects/$id/edit")({
  head: () => ({
    meta: [
      { title: "Редактирование объекта — RM OS" },
      { name: "description", content: "Редактирование карточки объекта недвижимости в RM OS." },
      { property: "og:title", content: "Редактирование объекта — RM OS" },
      {
        property: "og:description",
        content: "Редактирование карточки объекта недвижимости в RM OS.",
      },
    ],
  }),
  component: () => (
    <AdminOnly>
      <EditObjectPage />
    </AdminOnly>
  ),
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-muted-foreground" role="alert">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-sm text-muted-foreground">Объект не найден</div>,
});

function EditObjectPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["properties", id],
    queryFn: () => fetchProperty(id),
  });

  const mutation = useMutation({
    mutationFn: (input: PropertyInput) => updateProperty(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Изменения сохранены");
      navigate({ to: "/objects" });
    },
    onError: () => toast.error("Не удалось сохранить изменения"),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link
        to="/objects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Объекты
      </Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Редактирование объекта</h1>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : error || !data ? (
        <p className="text-sm text-muted-foreground">Объект не найден</p>
      ) : (
        <PropertyForm
          initial={data}
          submitting={mutation.isPending}
          onSubmit={async (input) => {
            await mutation.mutateAsync(input);
          }}
        />
      )}
    </div>
  );
}
