import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { PropertyCard } from "@/components/site/PropertyCard";
import { fetchComplexes } from "@/lib/complexes";
import { fetchPublishedProperties, signedUrls } from "@/lib/properties";

export const Route = createFileRoute("/rent/")({
  head: () => ({
    meta: [
      { title: "Долгосрочная аренда недвижимости в Сочи — Residence More" },
      {
        name: "description",
        content:
          "Актуальные объекты долгосрочной аренды в Сочи от Residence More: квартиры, апартаменты, дома и виллы.",
      },
      {
        property: "og:title",
        content: "Долгосрочная аренда недвижимости в Сочи — Residence More",
      },
      {
        property: "og:description",
        content:
          "Актуальные объекты долгосрочной аренды в Сочи от Residence More: квартиры, апартаменты, дома и виллы.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RentPage,
});

function RentPage() {
  const { data: allProperties = [], isLoading } = useQuery({
    queryKey: ["published-properties"],
    queryFn: fetchPublishedProperties,
  });

  // На сайте показываем только свободные объекты.
  const properties = useMemo(
    () => allProperties.filter((p) => p.status === "free"),
    [allProperties],
  );

  const { data: complexes = [] } = useQuery({
    queryKey: ["complexes"],
    queryFn: fetchComplexes,
  });

  const complexMap = useMemo(
    () => new Map(complexes.map((c) => [c.id, c.name])),
    [complexes],
  );

  const photoPaths = properties
    .map((p) => p.photos[0]?.path)
    .filter((path): path is string => Boolean(path));

  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", photoPaths.slice().sort().join("|")],
    queryFn: () => signedUrls(photoPaths),
    enabled: photoPaths.length > 0,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1280px] px-5 py-12 md:px-6 lg:px-8 lg:py-16">
        <header className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-site-navy md:text-4xl lg:text-[42px]">
            Долгосрочная аренда недвижимости в Сочи
          </h1>
          <p className="mt-4 text-base text-site-muted">
            {isLoading ? (
              "Загрузка объектов..."
            ) : (
              <>Найдено объектов: <span className="font-semibold text-site-navy">{properties.length}</span></>
            )}
          </p>
        </header>

        {isLoading ? (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] animate-pulse rounded-xl bg-site-navy-soft"
              />
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-lg text-site-navy">Пока нет объектов для публикации</p>
            <p className="mt-2 text-sm text-site-muted">
              Объекты появятся здесь, как только будут опубликованы в RM OS.
            </p>
          </div>
        ) : (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                complexName={
                  property.complex_name ||
                  (property.complex_id ? complexMap.get(property.complex_id) : null)
                }
                photoUrl={
                  property.photos[0]?.path ? urls[property.photos[0].path] : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
