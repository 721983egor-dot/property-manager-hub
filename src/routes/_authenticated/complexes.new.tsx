import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { ComplexForm } from "@/components/ComplexForm";
import { createComplex, type ComplexInput } from "@/lib/complexes";

export const Route = createFileRoute("/_authenticated/complexes/new")({
  head: () => ({
    meta: [
      { title: "Новый комплекс — RM OS" },
      {
        name: "description",
        content: "Создание жилого комплекса: название, описание, фотографии и инфраструктура.",
      },
      { property: "og:title", content: "Новый комплекс — RM OS" },
      {
        property: "og:description",
        content: "Создание жилого комплекса в RM OS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <NewComplexPage />
    </AdminOnly>
  ),
});

function NewComplexPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: ComplexInput) => createComplex(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complexes"] });
      toast.success("Комплекс создан");
      navigate({ to: "/complexes" });
    },
    onError: () => toast.error("Не удалось создать комплекс"),
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
      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Новый комплекс</h1>
      <div className="mt-6">
        <ComplexForm
          onSubmit={async (input) => {
            await mutation.mutateAsync(input);
          }}
          onCancel={() => navigate({ to: "/complexes" })}
          submitting={mutation.isPending}
        />
      </div>
    </div>
  );
}
