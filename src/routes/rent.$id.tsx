import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { trackEvent } from "@/lib/analytics";
import { SITE_ORIGIN } from "@/lib/site";
import { PropertyPublicPage } from "@/components/site/PropertyPublicPage";
import { type Property, isPublicListingStatus, publicStatusView } from "@/lib/properties";
import { propertyJsonLd, propertyMetaDescription, propertyMetaTitle, propertySlug, propertyUrl, jsonLdScript, publicPhotoUrl } from "@/lib/seo";
import { publicPropertyQueryOptions } from "@/lib/public-property.functions";
import {
  publicComplexQueryOptions,
  publicFreeFromQueryOptions,
  publishedPropertiesQueryOptions,
} from "@/lib/public-catalog.functions";
import { pickSimilarProperties } from "@/lib/rent-search";

export const Route = createFileRoute("/rent/$id")({
  loader: async ({ params, context }) => {
    const property = await context.queryClient
      .ensureQueryData(publicPropertyQueryOptions(params.id))
      .catch(() => null);
    if (!property || !property.published || property.status === "archived") {
      throw notFound();
    }
    const canonical = propertySlug(property as { title: string; ref_id: number });
    if (params.id !== canonical) {
      context.queryClient.setQueryData(publicPropertyQueryOptions(canonical).queryKey, property);
      throw redirect({
        to: "/rent/$id",
        params: { id: canonical },
        replace: true,
        statusCode: 301,
      });
    }
    const typed = property as Property;
    await Promise.all([
      typed.complex_id
        ? context.queryClient.ensureQueryData(publicComplexQueryOptions(typed.complex_id)).catch(() => null)
        : Promise.resolve(null),
      context.queryClient.ensureQueryData(publishedPropertiesQueryOptions()),
      context.queryClient.ensureQueryData(publicFreeFromQueryOptions()),
    ]);
    return typed;
  },
  head: ({ loaderData }) => {
    const p = loaderData as Property;
    const title = propertyMetaTitle(p);
    const description = propertyMetaDescription(p);
    const url = propertyUrl(p);
    const photoPath = p.photos?.[0]?.path;
    const ogImage = photoPath
      ? publicPhotoUrl(photoPath)
      : `${SITE_ORIGIN}/og-cover.jpg`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:url", content: url },
        { property: "og:image", content: ogImage },
        { name: "twitter:image", content: ogImage },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: jsonLdScript(propertyJsonLd(p, url, ogImage)),
        },
      ],
    };
  },
  component: RentDetailPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <p>{error.message || "Не удалось загрузить объект"}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Объект не найден</h1>
      <Link to="/rent" className="mt-4 inline-block text-site-gold">
        К списку объектов
      </Link>
    </div>
  ),
});

function RentDetailPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(publicPropertyQueryOptions(id));
  const { data: availability } = useSuspenseQuery(publicFreeFromQueryOptions());
  const freeFromMap = availability?.freeFrom ?? {};
  const nextStartMap = availability?.nextStart ?? {};
  const freeFromIso = freeFromMap[data.id] ?? null;
  const nextStartIso = nextStartMap[data.id] ?? null;

  const complexId = data.complex_id ?? null;
  const { data: complex } = useQuery({
    ...publicComplexQueryOptions(complexId ?? ""),
    enabled: Boolean(complexId),
  });

  const { data: catalog = [] } = useSuspenseQuery(publishedPropertiesQueryOptions());
  const similar = useMemo(() => {
    const candidates = pickSimilarProperties(data, catalog, 8);
    return candidates
      .filter((item) =>
        isPublicListingStatus(
          publicStatusView(
            item,
            freeFromMap[item.id] ?? null,
            nextStartMap[item.id] ?? null,
          ),
        ),
      )
      .slice(0, 3);
  }, [data, catalog, freeFromMap, nextStartMap]);
  const similarFreeFrom = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const item of similar) {
      map[item.id] = freeFromMap[item.id] ?? null;
    }
    return map;
  }, [similar, freeFromMap]);
  const similarNextStart = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const item of similar) {
      map[item.id] = nextStartMap[item.id] ?? null;
    }
    return map;
  }, [similar, nextStartMap]);

  const paths = [
    ...(data.photos ?? []).map((p) => p.path),
    ...(complex?.photos ?? []).map((p) => p.path),
    ...(complex?.main_photo ? [complex.main_photo] : []),
    ...similar.flatMap((item) => (item.photos[0]?.path ? [item.photos[0].path] : [])),
  ];
  const urls = Object.fromEntries(paths.map((path) => [path, publicPhotoUrl(path)]));

  useEffect(() => {
    trackEvent(data.id, "page_view");
  }, [data.id]);

  return (
    <PropertyPublicPage
      property={data}
      complex={complex}
      photoUrls={urls}
      freeFromIso={freeFromIso}
      nextStartIso={nextStartIso}
      similar={similar}
      similarFreeFrom={similarFreeFrom}
      similarNextStart={similarNextStart}
      onContact={() => trackEvent(data.id, "contact_click")}
    />
  );
}
