import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { PropertyForm } from "@/components/PropertyForm";
import { createProperty, type PropertyInput } from "@/lib/properties";

export const Route = createFileRoute("/objects/new")({
  head: () => ({
    meta: [
      { title: "Новый объект — RM OS" },
      { name: "description", content: "Добавление объекта недвижимости в реестр RM OS." },
      { property: "og:title", content: "Новый объект — RM OS" },
      { property: "og:description", content: "Добавление объекта недвижимости в реестр RM OS." },
    ],
  }),
  component: NewObjectPage,
});

function NewObjectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: PropertyInput) => createProperty(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Объект создан");
      navigate({ to: "/objects" });
    },
    onError: () => toast.error("Не удалось сохранить объект"),
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10 lg:py-10">
      <Link
        to="/objects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Объекты
      </Link>
      <h1 className="mb-6 mt-3 text-3xl font-semibold tracking-tight">Новый объект</h1>
      <PropertyForm
        onSubmit={async (input) => {
          await mutation.mutateAsync(input);
        }}
        submitting={mutation.isPending}
      />
    </div>
  );
}
