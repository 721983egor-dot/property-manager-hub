import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import { PropertyPublicPage } from "@/components/site/PropertyPublicPage";
import { fetchComplex } from "@/lib/complexes";
import {
  fetchProperty,
  signedUrls,
  propertyQueryOptions,
  propertyMetaTitle,
  propertyMetaDescription,
  type Property,
} from "@/lib/properties";
import { fetchCurrentBooking } from "@/lib/bookings";
import { addDays, parseISODate, toISODate } from "@/lib/rentals";

export const Route = createFileRoute("/rent/$id")({
  loader: async ({ params, context }) => {
    const property = await context.queryClient.ensureQueryData(
      propertyQueryOptions(params.id),
    );
    if (!property.published || property.status === "archived") {
      throw notFound();
    }
    return property;
  },
  head: ({ loaderData }) => {
    const p = loaderData as Property;
    const title = propertyMetaTitle(p);
    const description = propertyMetaDescription(p);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:url", content: `/rent/${p.id}` },
      ],
      links: [{ rel: "canonical", href: `/rent/${p.id}` }],
    };
  },
  component: RentDetailPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center px-5 text-center">
      <p className="text-site-muted">{error.message || "Не удалось загрузить объект"}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center px-5 text-center">
      <div>
        <p className="text-lg text-site-navy">Объект не найден</p>
        <Link
          to="/rent"
          className="mt-4 inline-flex items-center gap-1 text-sm text-site-navy hover:text-site-gold"
        >
          <ChevronLeft className="size-4" />
          К списку объектов
        </Link>
      </div>
    </div>
  ),
});

function RentDetailPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(propertyQueryOptions(id));

  const todayIso = toISODate(new Date());
  const needsBooking =
    data.status === "rented" && (data.service_type ?? "management") === "management";
  const { data: currentBooking } = useQuery({
    queryKey: ["current-booking", id, todayIso],
    queryFn: () => fetchCurrentBooking(id, todayIso),
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

  return (
    <PropertyPublicPage
      property={data}
      complex={complex ?? null}
      photoUrls={urls}
      freeFromIso={freeFromIso}
    />
  );
}
