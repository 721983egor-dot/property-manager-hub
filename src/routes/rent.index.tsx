import { createFileRoute, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Heart } from "lucide-react";

import { PropertyCard } from "@/components/site/PropertyCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchCurrentBookingsForProperties } from "@/lib/bookings";
import {
  publicComplexesQueryOptions,
  publishedPropertiesQueryOptions,
} from "@/lib/public-catalog.functions";
import { SITE_ORIGIN } from "@/lib/site";
import {
  PROPERTY_TYPES,
  publicStatusView,
  roomsLabel,
  ROOM_OPTIONS,
  type PropertyType,
} from "@/lib/properties";
import { addDays, parseISODate, toISODate } from "@/lib/rentals";
import { complexSlug, publicPhotoUrl } from "@/lib/seo";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

const rentSearchSchema = z.object({
  type: fallback(z.string(), "").default(""),
  complex: fallback(z.string(), "").default(""),
  rooms: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "price_asc").default("price_asc"),
});

export const Route = createFileRoute("/rent/")({
  validateSearch: zodValidator(rentSearchSchema),
  search: {
    middlewares: [stripSearchParams({ type: "", complex: "", rooms: "", sort: "price_asc" })],
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(publishedPropertiesQueryOptions()),
      context.queryClient.ensureQueryData(publicComplexesQueryOptions()),
    ]);
  },
  head: () => {
    const url = `${SITE_ORIGIN}/rent`;
    const image = `${SITE_ORIGIN}/og-cover.jpg`;
    return {
      meta: [
        {
          title: "Снять квартиру долгосрочно в Сочи — Резиденция&Море",
        },
        {
          name: "description",
          content:
            "Снять квартиру, апартаменты или дом в Сочи на долгий срок. Актуальные объекты в ЖК Лазурный берег, Бревис, Гранд Карат и других комплексах — Резиденция&Море.",
        },
        {
          property: "og:title",
          content: "Снять квартиру долгосрочно в Сочи — Резиденция&Море",
        },
        {
          property: "og:description",
          content:
            "Снять квартиру, апартаменты или дом в Сочи на долгий срок. Актуальные объекты в жилых комплексах Сочи от Резиденция&Море.",
        },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: RentPage,
});

const SORT_OPTIONS = [
  { value: "price_asc", label: "Сначала дешевле" },
  { value: "price_desc", label: "Сначала дороже" },
];

function normalizeType(type: PropertyType) {
  if (type === "villa") return "house";
  if (type === "aparts") return "apartment";
  return type;
}

function RentPage() {
  const navigate = useNavigate({ from: "/rent/" });
  const { type, complex, rooms, sort } = Route.useSearch();

  const { data: allProperties = [] } = useSuspenseQuery(publishedPropertiesQueryOptions());
  const { data: complexes = [] } = useSuspenseQuery(publicComplexesQueryOptions());
  const complexLinks = complexes.filter((c) => c.show_in_site_filter);

  const todayIso = useMemo(() => toISODate(new Date()), []);
  const propertyIds = useMemo(
    () => allProperties.map((p) => p.id),
    [allProperties],
  );

  const { data: bookingsMap = {} } = useQuery({
    queryKey: ["current-bookings", propertyIds.join("|"), todayIso],
    queryFn: () => fetchCurrentBookingsForProperties(propertyIds, todayIso),
    enabled: propertyIds.length > 0,
  });

  const freeFromMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [propertyId, booking] of Object.entries(bookingsMap)) {
      map[propertyId] = toISODate(
        addDays(parseISODate(booking.end_date), 1),
      );
    }
    return map;
  }, [bookingsMap]);

  const visible = useMemo(() => {
    // Показываем только свободные объекты и те, что освободятся в ближайшие 30 дней.
    const available = allProperties.filter((p) => {
      const freeFromIso = freeFromMap[p.id] ?? null;
      const view = publicStatusView(p, freeFromIso);
      return view && (view.tone === "green" || view.tone === "gold");
    });

    const filtered = available.filter((p) => {
      if (type && normalizeType(p.type) !== type) return false;
      if (complex && p.complex_id !== complex) return false;
      if (rooms && String(p.rooms) !== rooms) return false;
      return true;
    });

    const sorted = [...filtered];
    if (sort === "price_asc" || sort === "price_desc") {
      const dir = sort === "price_asc" ? 1 : -1;
      sorted.sort((a, b) => {
        const av = a.price_month;
        const bv = b.price_month;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * dir;
      });
    }

    return sorted;
  }, [allProperties, freeFromMap, type, complex, rooms, sort]);

  const updateSearch = (key: keyof z.infer<typeof rentSearchSchema>, value: string) => {
    navigate({
      search: (prev) => ({ ...prev, [key]: value || undefined }),
    });
  };

  const resetFilters = () => {
    navigate({
      search: () => ({ sort: "price_asc" }),
    });
  };

  const hasFilters = type !== "" || complex !== "" || rooms !== "" || sort !== "price_asc";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1280px] px-5 py-10 md:px-6 lg:px-8 lg:py-14">
        <header className="mb-8 max-w-3xl">
          <h1 className="text-3xl font-bold text-site-navy md:text-4xl">
            Снять квартиру долгосрочно в Сочи
          </h1>
          <p className="mt-3 text-base leading-relaxed text-site-muted">
            Актуальные квартиры, апартаменты, дома и виллы в долгосрочную аренду. Подберём объект в нужном
            комплексе и районе, покажем и сопровождим на весь срок.
          </p>
        </header>
        {complexLinks.length > 0 ? (
          <nav aria-label="Жилые комплексы" className="mb-8 flex flex-wrap gap-2">
            {complexLinks.map((item) => (
              <Link
                key={item.id}
                to="/rent/jk/$slug"
                params={{ slug: complexSlug(item, complexes) }}
                className="rounded-full border border-site-line px-3.5 py-1.5 text-sm font-medium text-site-navy transition-colors hover:border-site-gold hover:text-site-gold"
              >
                ЖК {item.name}
              </Link>
            ))}
          </nav>
        ) : null}
        <p className="mb-6 flex items-center gap-2 text-sm text-site-muted">
          <Heart className="size-4 shrink-0 fill-site-gold text-site-gold" />
          Нажимайте на сердечко у понравившихся объектов — соберём их в вашу подборку, чтобы записаться на просмотр всех сразу или поделиться с близкими.
        </p>
        <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
            <FilterSelect
              value={type}
              onChange={(v) => updateSearch("type", v)}
              placeholder="Тип объекта"
              options={PROPERTY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            />
            <FilterSelect
              value={complex}
              onChange={(v) => updateSearch("complex", v)}
              placeholder="Комплекс"
              options={complexes
                .filter((c) => c.show_in_site_filter || c.id === complex)
                .map((c) => ({ value: c.id, label: c.name }))}
            />
            <FilterSelect
              value={rooms}
              onChange={(v) => updateSearch("rooms", v)}
              placeholder="Планировка"
              options={ROOM_OPTIONS.map((r) => ({ value: String(r), label: roomsLabel(r) }))}
            />
            <FilterSelect
              value={sort}
              onChange={(v) => updateSearch("sort", v)}
              placeholder="Сортировка"
              options={SORT_OPTIONS}
            />

            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="h-10 px-3 text-sm font-medium text-site-muted underline-offset-4 transition-colors hover:text-site-navy"
              >
                Сбросить
              </button>
            )}
          </div>
        </header>

        {visible.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-lg text-site-navy">Нет подходящих объектов</p>
            <p className="mt-2 text-sm text-site-muted">
              Попробуйте изменить фильтры — на сайте публикуются только свободные объекты.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                photoUrl={
                  property.photos[0]?.path ? publicPhotoUrl(property.photos[0].path) : undefined
                }
                freeFromIso={freeFromMap[property.id] ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11 w-full sm:w-[180px]">
        <SelectValue placeholder={placeholder}>
          {value
            ? options.find((o) => o.value === value)?.label ?? value
            : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">{placeholder}: все</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
