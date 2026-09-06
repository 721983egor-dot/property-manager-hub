import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import { PropertyPublicPage } from "@/components/site/PropertyPublicPage";
import { fetchComplex } from "@/lib/complexes";
import { fetchProperty, signedUrls } from "@/lib/properties";
import { fetchCurrentBooking } from "@/lib/bookings";
import { addDays, parseISODate, toISODate } from "@/lib/rentals";

export const Route = createFileRoute("/rent/$id")({
  head: () => ({
    meta: [
      { title: "Объект аренды — Residence More" },
      {
        name: "description",
        content: "Объект долгосрочной аренды в Сочи от Residence More.",
      },
      { property: "og:title", content: "Объект аренды — Residence More" },
      {
        property: "og:description",
        content: "Объект долгосрочной аренды в Сочи от Residence More.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
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

  const { data, isLoading, error } = useQuery({
    queryKey: ["properties", id],
    queryFn: () => fetchProperty(id),
  });

  const todayIso = toISODate(new Date());
  const needsBooking =
    data?.status === "rented" && (data?.service_type ?? "management") === "management";
  const { data: currentBooking } = useQuery({
    queryKey: ["current-booking", id, todayIso],
    queryFn: () => fetchCurrentBooking(id, todayIso),
    enabled: Boolean(needsBooking),
  });
  const freeFromIso = currentBooking
    ? toISODate(addDays(parseISODate(currentBooking.end_date), 1))
    : null;

  const complexId = data?.complex_id ?? null;
  const { data: complex } = useQuery({
    queryKey: ["complexes", complexId],
    queryFn: () => fetchComplex(complexId!),
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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-site-muted">Загрузка...</p>
      </div>
    );
  }

  if (error || !data || data.status === "archived" || !data.published) {
    return (
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
    );
  }

  return <PropertyPublicPage
      property={data}
      complex={complex ?? null}
      photoUrls={urls}
      freeFromIso={freeFromIso}
    />;
}
