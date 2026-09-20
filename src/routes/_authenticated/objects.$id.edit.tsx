import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { PropertyForm } from "@/components/PropertyForm";
import { fetchProperty, updateProperty, type PropertyInput } from "@/lib/properties";
import { storedVideoPath } from "@/lib/property-video";
import { publishPropertyVideoFn } from "@/lib/video-hosts.functions";

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

  const publishVideo = useServerFn(publishPropertyVideoFn);

  const mutation = useMutation({
    mutationFn: async (input: PropertyInput) => {
      await updateProperty(id, input);
      const path =
        storedVideoPath(input.video_url) ||
        storedVideoPath(input.video_file_path) ||
        input.photos.find((photo) => photo.kind === "video")?.path;
      const sameFile = Boolean(data && path && (data.video_file_path === path || data.video_url === path));
      const already = sameFile && data?.video_publish_status === "published";
      if (path && !already) {
        toast.message("Выгружаем видео на Rutube и YouTube — не закрывайте страницу");
        try {
          const result = await publishVideo({ data: { propertyId: id, filePath: path } });
          if (result.errors.length) {
            toast.error(result.errors.join("; "), { duration: 20_000 });
          } else {
            toast.success(
              [result.rutubeUrl && `Rutube ${result.rutubeUrl}`, result.youtubeUrl && `YouTube ${result.youtubeUrl}`]
                .filter(Boolean)
                .join(" · ") || "Видео выгружено",
              { duration: 12_000 },
            );
          }
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Не удалось выгрузить видео", {
            duration: 20_000,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Изменения сохранены");
      navigate({ to: "/objects/$id", params: { id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить изменения"),
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
