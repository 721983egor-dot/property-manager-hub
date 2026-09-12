import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { ComplexPublicPage } from "@/components/site/ComplexPublicPage";
import { fetchCurrentBookingsForProperties } from "@/lib/bookings";
import {
  publicComplexBySlugQueryOptions,
  publishedPropertiesQueryOptions,
} from "@/lib/public-catalog.functions";
import { publicStatusView } from "@/lib/properties";
import { addDays, parseISODate, toISODate } from "@/lib/rentals";
import {
  complexJsonLd,
  complexMetaDescription,
  complexMetaTitle,
  complexSlug,
  complexUrl,
  jsonLdScript,
  propertyUrl,
  publicPhotoUrl,
} from "@/lib/seo";

export const Route = createFileRoute("/rent/jk/$slug")({
  loader: async ({ params, context }) => {
    const payload = await context.queryClient
      .ensureQueryData(publicComplexBySlugQueryOptions(params.slug))
      .catch(() => null);
    if (!payload) throw notFound();
    const properties = await context.queryClient.ensureQueryData(publishedPropertiesQueryOptions());
    const count = properties.filter((p) => p.complex_id === payload.complex.id).length;
    return { complex: payload.complex, count };
  },
  head: ({ loaderData, params }) => {
    const data = loaderData;
    if (!data) return {};
    const { complex, count } = data;
    const title = complexMetaTitle(complex.name);
    const description = complexMetaDescription(complex.name, complex.description, count);
    const url = complexUrl(params.slug);
    const photo = complex.main_photo || complex.photos?.[0]?.path;
    const ogImage = photo ? publicPhotoUrl(photo) : "https://residence-more.ru/og-cover.jpg";
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
    };
  },
  component: ComplexLandingPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Комплекс не найден</h1>
    </div>
  ),
});

function ComplexLandingPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(publicComplexBySlugQueryOptions(slug));
  const { data: allProperties = [] } = useSuspenseQuery(publishedPropertiesQueryOptions());
  const { complex, complexes } = data;
  const canonicalSlug = complexSlug(complex, complexes);

  const todayIso = useMemo(() => toISODate(new Date()), []);
  const inComplex = useMemo(
    () => allProperties.filter((p) => p.complex_id === complex.id),
    [allProperties, complex.id],
  );
  const propertyIds = useMemo(() => inComplex.map((p) => p.id), [inComplex]);

  const { data: bookingsMap = {} } = useQuery({
    queryKey: ["current-bookings", propertyIds.join("|"), todayIso],
    queryFn: () => fetchCurrentBookingsForProperties(propertyIds, todayIso),
    enabled: propertyIds.length > 0,
  });

  const freeFromMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const [propertyId, booking] of Object.entries(bookingsMap)) {
      map[propertyId] = toISODate(addDays(parseISODate(booking.end_date), 1));
    }
    return map;
  }, [bookingsMap]);

  const visible = useMemo(
    () =>
      inComplex.filter((p) => {
        const view = publicStatusView(p, freeFromMap[p.id] ?? null);
        return view && (view.tone === "green" || view.tone === "gold");
      }),
    [inComplex, freeFromMap],
  );

  const jsonLd = complexJsonLd({
    name: complex.name,
    description: complex.description,
    url: complexUrl(canonicalSlug),
    image: complex.main_photo
      ? publicPhotoUrl(complex.main_photo)
      : complex.photos?.[0]?.path
        ? publicPhotoUrl(complex.photos[0].path)
        : undefined,
    itemUrls: visible.map((p) => propertyUrl(p)),
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <ComplexPublicPage complex={complex} properties={visible} freeFromMap={freeFromMap} />
    </>
  );
}
