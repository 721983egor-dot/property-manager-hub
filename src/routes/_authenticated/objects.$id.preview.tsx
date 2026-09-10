import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import { PropertyPublicPage } from "@/components/site/PropertyPublicPage";
import { fetchStaffComplex } from "@/lib/complexes";
import { fetchProperty, signedUrls } from "@/lib/properties";

export const Route = createFileRoute("/_authenticated/objects/$id/preview")({
  head: () => ({
    meta: [
      { title: "Предпросмотр объекта на сайте — RM OS" },
      {
        name: "description",
        content: "Предпросмотр публичной страницы объекта в дизайне сайта Residence More.",
      },
      { property: "og:title", content: "Предпросмотр объекта на сайте — RM OS" },
      {
        property: "og:description",
        content: "Предпросмотр публичной страницы объекта в дизайне сайта Residence More.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreviewPage,
});

function PreviewPage() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["properties", id],
    queryFn: () => fetchProperty(id),
  });

  const complexId = data?.complex_id ?? null;
  const { data: complex } = useQuery({
    queryKey: ["complexes", complexId],
    queryFn: () => {
      if (!complexId) throw new Error("Комплекс не выбран");
      return fetchStaffComplex(complexId);
    },
    enabled: Boolean(complexId),
  });

  const paths = [
    ...(data?.photos ?? []).map((p) => p.path),
    ...(complex?.photos ?? []).map((p) => p.path),
    ...(complex?.main_photo ? [complex.main_photo] : []),
  ];
  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", paths.slice().sort().join("|")],
    queryFn: () => signedUrls(paths),
    enabled: paths.length > 0,
  });

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-5 py-3 lg:px-6">
          <Link
            to="/objects/$id"
            params={{ id }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Вернуться к объекту
          </Link>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Предпросмотр на сайте
          </span>
        </div>
      </div>

      {isLoading ? (
        <p className="mx-auto max-w-[1200px] px-5 py-10 text-sm text-muted-foreground">
          Загрузка...
        </p>
      ) : error || !data ? (
        <p className="mx-auto max-w-[1200px] px-5 py-10 text-sm text-muted-foreground">
          Объект не найден
        </p>
      ) : (
        <>
          {data.status === "archived" ? (
            <p className="mx-auto max-w-[1200px] px-5 pt-6 text-sm text-muted-foreground lg:px-6">
              Объект в архиве и не предназначен для публикации на сайте.
            </p>
          ) : null}
          <PropertyPublicPage property={data} complex={complex ?? null} photoUrls={urls} />
        </>
      )}
    </div>
  );
}
