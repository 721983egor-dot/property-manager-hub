import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { PropertyForm } from "@/components/PropertyForm";
import { createProperty, type PropertyInput } from "@/lib/properties";
import { storedVideoPath } from "@/lib/property-video";
import { publishPropertyVideoFn } from "@/lib/video-hosts.functions";

export const Route = createFileRoute("/_authenticated/objects/new")({
  head: () => ({
    meta: [
      { title: "Новый объект — RM OS" },
      { name: "description", content: "Добавление объекта недвижимости в реестр RM OS." },
      { property: "og:title", content: "Новый объект — RM OS" },
      { property: "og:description", content: "Добавление объекта недвижимости в реестр RM OS." },
    ],
  }),
  component: () => (
    <AdminOnly>
      <NewObjectPage />
    </AdminOnly>
  ),
});

function NewObjectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const publishVideo = useServerFn(publishPropertyVideoFn);

  const mutation = useMutation({
    mutationFn: async (input: PropertyInput) => {
      const created = await createProperty(input);
      const path = storedVideoPath(input.video_url) || storedVideoPath(input.video_file_path);
      if (path && created?.id) {
        toast.message("Видео уходит на Rutube, VK и YouTube");
        void publishVideo({ data: { propertyId: created.id, filePath: path } }).catch((e: Error) =>
          toast.error(e.message),
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Объект создан");
      navigate({ to: "/objects" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить объект"),
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
      <h1 className="mb-6 mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Новый объект</h1>
      <PropertyForm
        onSubmit={async (input) => {
          await mutation.mutateAsync(input);
        }}
        submitting={mutation.isPending}
      />
    </div>
  );
}
