import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { ComplexForm } from "@/components/ComplexForm";
import { fetchComplex, updateComplex, type ComplexInput } from "@/lib/complexes";

export const Route = createFileRoute("/_authenticated/complexes/$id/edit")({
  head: () => ({
    meta: [
      { title: "Редактирование комплекса — RM OS" },
      {
        name: "description",
        content: "Изменение названия, описания, фотографий и инфраструктуры жилого комплекса.",
      },
      { property: "og:title", content: "Редактирование комплекса — RM OS" },
      {
        property: "og:description",
        content: "Изменение данных жилого комплекса в RM OS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <EditComplexPage />
    </AdminOnly>
  ),
});

function EditComplexPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["complexes", id],
    queryFn: () => fetchComplex(id),
  });

  const mutation = useMutation({
    mutationFn: (input: ComplexInput) => updateComplex(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complexes"] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Комплекс сохранён");
      navigate({ to: "/complexes" });
    },
    onError: () => toast.error("Не удалось сохранить комплекс"),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link
        to="/complexes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Комплексы
      </Link>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Загрузка...</p>
      ) : error || !data ? (
        <p className="mt-6 text-sm text-muted-foreground">Комплекс не найден</p>
      ) : (
        <>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{data.name}</h1>
          <div className="mt-6">
            <ComplexForm
              initial={data}
              onSubmit={async (input) => {
                await mutation.mutateAsync(input);
              }}
              onCancel={() => navigate({ to: "/complexes" })}
              submitting={mutation.isPending}
            />
          </div>
        </>
      )}
    </div>
  );
}
