import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import { ArrowRight, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/site/PropertyCard";
import { fetchCurrentBookingsForProperties } from "@/lib/bookings";
import {
  fetchPublishedProperties,
  signedUrls,
  type Property,
} from "@/lib/properties";
import { addDays, parseISODate, toISODate } from "@/lib/rentals";
import { fetchSelectionByCode } from "@/lib/selections";

type LoaderData = {
  code: string;
  name: string;
  comment: string;
  count: number;
  properties: Property[];
  freeFromIso: Record<string, string>;
  photoUrls: Record<string, string>;
};

const selectionQueryOptions = (code: string) =>
  queryOptions({
    queryKey: ["selection", code],
    queryFn: () => fetchSelectionByCode(code),
  });

export const Route = createFileRoute("/p/$code")({
  head: ({ loaderData }) => {
    const data = loaderData as LoaderData | undefined;
    const title = data?.name.trim()
      ? `${data.name.trim()} — Резиденция&Море`
      : data
        ? `Подборка — ${data.count} объектов — Резиденция&Море`
        : "Подборка объектов — Резиденция&Море";
    const description = data
      ? `Персональная подборка объектов долгосрочной аренды в Сочи от Резиденция&Море. ${data.count} объектов.`
      : "Персональная подборка объектов долгосрочной аренды в Сочи.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { name: "robots", content: "noindex" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  loader: async ({ params, context }) => {
    const todayIso = toISODate(new Date());
    const selection = await context.queryClient.ensureQueryData(selectionQueryOptions(params.code));
    if (!selection || selection.items.length === 0) {
      throw notFound();
    }

    const properties = await fetchPublishedProperties();
    const selectedIds = new Set(selection.items.map((i) => i.property_id));
    const selectedProperties = properties
      .filter((p) => selectedIds.has(p.id))
      .sort((a, b) => {
        const ai = selection.items.find((i) => i.property_id === a.id)?.position ?? 0;
        const bi = selection.items.find((i) => i.property_id === b.id)?.position ?? 0;
        return ai - bi;
      });

    if (selectedProperties.length === 0) {
      throw notFound();
    }

    const bookings = await fetchCurrentBookingsForProperties(
      selectedProperties.map((p) => p.id),
      todayIso,
    );

    const freeFromIso: Record<string, string> = {};
    for (const p of selectedProperties) {
      const booking = bookings[p.id];
      if (booking) {
        freeFromIso[p.id] = toISODate(addDays(parseISODate(booking.end_date), 1));
      }
    }

    const photoPaths = selectedProperties
      .map((p) => p.photos[0]?.path)
      .filter((path): path is string => Boolean(path));
    const photoUrls = await signedUrls(photoPaths);

    return {
      code: selection.code,
      name: selection.name,
      comment: selection.comment,
      count: selectedProperties.length,
      properties: selectedProperties,
      freeFromIso,
      photoUrls,
    };
  },
  component: SelectionPublicPage,
  notFoundComponent: SelectionNotFound,
});

function SelectionPublicPage() {
  const data = Route.useLoaderData() as unknown as LoaderData;

  const shareSelection = async () => {
    const url = window.location.href;
    const shareData = {
      title: "Подборка объектов — Резиденция&Море",
      text: "Подборка объектов долгосрочной аренды в Сочи",
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // пользователь отменил — ничего не делаем
        return;
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Ссылка скопирована");
  };

  return (
    <div className="bg-white text-site-navy">
      <section className="bg-site-navy py-16 text-white">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6 lg:px-8">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
            <div className="min-w-0 max-w-2xl">
              <p className="mb-3 text-sm font-medium uppercase tracking-wider text-site-gold">
                Персональная подборка
              </p>
              <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
                Подборка объектов
              </h1>
              {data.comment ? (
                <p className="mt-4 text-base leading-relaxed text-white/80">{data.comment}</p>
              ) : null}
            </div>
            <Button
              variant="outline"
              onClick={shareSelection}
              className="shrink-0 gap-2 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Share2 className="size-4" />
              Поделиться
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-5 py-10 md:px-6 lg:px-8 lg:py-14">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.properties.map((property) => (
            <PropertyCard
              key={property.id}
              property={property}
              photoUrl={
                property.photos[0]?.path ? data.photoUrls[property.photos[0].path] : undefined
              }
              freeFromIso={data.freeFromIso[property.id] ?? null}
            />
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-center gap-4 border-t border-border pt-12 text-center">
          <p className="text-lg font-medium">Хотите посмотреть больше вариантов?</p>
          <Button asChild size="lg" className="gap-2">
            <Link to="/rent">
              Все объекты
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function SelectionNotFound() {
  return (
    <div className="flex items-center justify-center bg-white px-5 py-20 text-center text-site-navy">
      <div className="max-w-md">
        <h1 className="text-2xl font-bold">Подборка не найдена</h1>
        <p className="mt-3 text-muted-foreground">
          Ссылка устарела или объекты из подборки сняты с публикации.
        </p>
        <Button asChild className="mt-6">
          <Link to="/rent">Смотреть все объекты</Link>
        </Button>
      </div>
    </div>
  );
}
