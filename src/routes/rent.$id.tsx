import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { trackEvent } from "@/lib/analytics";
import { SITE_ORIGIN } from "@/lib/site";
import { PropertyPublicPage } from "@/components/site/PropertyPublicPage";
import { fetchComplex } from "@/lib/complexes";
import { signedUrls, type Property } from "@/lib/properties";
import { propertyJsonLd, propertyMetaDescription, propertyMetaTitle, propertySlug, propertyUrl, jsonLdScript } from "@/lib/seo";
import { fetchCurrentBooking } from "@/lib/bookings";
import { publicPropertyQueryOptions } from "@/lib/public-property.functions";
import { addDays, parseISODate, toISODate } from "@/lib/rentals";

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
    return property as Property;
  },
  head: ({ loaderData }) => {
    const p = loaderData as Property;
    const title = propertyMetaTitle(p);
    const description = propertyMetaDescription(p);
    const url = propertyUrl(p);
    const photoPath = p.photos?.[0]?.path;
    const ogImage = photoPath
      ? `${SITE_ORIGIN}/api/public/feed-photo/${encodeURIComponent(photoPath)}`
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

  const todayIso = toISODate(new Date());
  const needsBooking =
    (data.status === "rented" || data.status === "soon_free") &&
    (data.service_type ?? "management") === "management";
  const { data: currentBooking } = useQuery({
    queryKey: ["current-booking", data.id, todayIso],
    queryFn: () => fetchCurrentBooking(data.id, todayIso),
    enabled: Boolean(needsBooking),
  });
  const freeFromIso = currentBooking
    ? toISODate(addDays(parseISODate(currentBooking.end_date), 1))
    : null;

  const complexId = data.complex_id ?? null;
  const { data: complex } = useQuery({
    queryKey: ["complexes", complexId],
    queryFn: () => fetchComplex(complexId!),
    enabled: Boolean(complexId),
  });

  const paths = [
    ...(data.photos ?? []).map((p) => p.path),
    ...(complex?.photos ?? []).map((p) => p.path),
    ...(complex?.main_photo ? [complex.main_photo] : []),
  ];

  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", paths.slice().sort().join("|")],
    queryFn: () => signedUrls(paths),
    enabled: paths.length > 0,
  });

  useEffect(() => {
    trackEvent(data.id, "page_view");
  }, [data.id]);

  return (
    <PropertyPublicPage
      property={data}
      complex={complex}
      photoUrls={urls}
      freeFromIso={freeFromIso}
      onContact={() => trackEvent(data.id, "contact_click")}
    />
  );
}
