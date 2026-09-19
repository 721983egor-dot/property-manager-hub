import { createFileRoute, ClientOnly, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, LayoutGrid, Map } from "lucide-react";

import { PropertiesMap } from "@/components/site/PropertiesMap";
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
} from "@/lib/properties";
import { addDays, parseISODate, toISODate } from "@/lib/rentals";
import {
  catalogRoomOptions,
  formatPriceDigits,
  matchesRentFilters,
  priceDigits,
  RENT_SEARCH_DEFAULTS,
  rentSearchSchema,
} from "@/lib/rent-search";
import { complexSlug, publicPhotoUrl } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

export const Route = createFileRoute("/rent/")({
  validateSearch: zodValidator(rentSearchSchema),
  search: {
    middlewares: [stripSearchParams(RENT_SEARCH_DEFAULTS)],
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

function RentPage() {
  const navigate = useNavigate({ from: "/rent/" });
  const { type, complex, rooms, sort, priceFrom, priceTo, view } = Route.useSearch();
  const mapView = view === "map";
  const [selectedMapIds, setSelectedMapIds] = useState<string[]>([]);
  const [mapInteractive, setMapInteractive] = useState(true);

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

  const available = useMemo(() => {
    return allProperties.filter((p) => {
      const freeFromIso = freeFromMap[p.id] ?? null;
      const statusView = publicStatusView(p, freeFromIso);
      return statusView && (statusView.tone === "green" || statusView.tone === "gold");
    });
  }, [allProperties, freeFromMap]);

  const roomCounts = useMemo(() => {
    const values = catalogRoomOptions(available);
    if (rooms && !values.some((value) => String(value) === rooms)) {
      const extra = Number(rooms);
      if (Number.isFinite(extra)) return [...values, extra].sort((a, b) => a - b);
    }
    return values;
  }, [available, rooms]);

  const visible = useMemo(() => {
    const filtered = available.filter((p) =>
      matchesRentFilters(p, { type, complex, rooms, priceFrom, priceTo }),
    );

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
  }, [available, type, complex, rooms, sort, priceFrom, priceTo]);

  const visibleIds = useMemo(() => visible.map((property) => property.id).join("|"), [visible]);

  useEffect(() => {
    setSelectedMapIds([]);
  }, [visibleIds]);

  useEffect(() => {
    if (selectedMapIds.length === 0) return;
    if (typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches) return;
    document.getElementById("map-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedMapIds]);

  const mapCards = useMemo(() => {
    if (!mapInteractive) return visible;
    if (selectedMapIds.length === 0) return [];
    const selected = new Set(selectedMapIds);
    return visible.filter((property) => selected.has(property.id));
  }, [mapInteractive, selectedMapIds, visible]);

  const updateSearch = (key: keyof z.infer<typeof rentSearchSchema>, value: string) => {
    navigate({
      search: (prev) => ({ ...prev, [key]: value || undefined }),
    });
  };

  const resetFilters = () => {
    navigate({
      search: () => ({ sort: "price_asc", view: mapView ? "map" : "" }),
    });
  };

  const hasFilters =
    type !== "" ||
    complex !== "" ||
    rooms !== "" ||
    priceFrom !== "" ||
    priceTo !== "" ||
    sort !== "price_asc";

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
        <header className="flex flex-col gap-4">
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
              options={roomCounts.map((r) => ({ value: String(r), label: roomsLabel(r) }))}
            />
            <PriceRangeFilter
              priceFrom={priceFrom}
              priceTo={priceTo}
              onChange={(key, value) => updateSearch(key, value)}
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
          <div className="flex w-full rounded-xl border border-site-line p-1 sm:w-fit">
            <ViewToggle
              active={!mapView}
              onClick={() => updateSearch("view", "")}
              icon={<LayoutGrid className="size-4" />}
              label="Список"
            />
            <ViewToggle
              active={mapView}
              onClick={() => updateSearch("view", "map")}
              icon={<Map className="size-4" />}
              label="На карте"
            />
          </div>
        </header>

        {visible.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-lg text-site-navy">Нет подходящих объектов</p>
            <p className="mt-2 text-sm text-site-muted">
              Попробуйте изменить фильтры — на сайте публикуются только свободные объекты.
            </p>
          </div>
        ) : mapView ? (
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]">
            <ClientOnly fallback={<div className="min-h-[520px] rounded-2xl bg-site-navy-soft" />}>
              <PropertiesMap
                properties={visible}
                selectedIds={selectedMapIds}
                onSelect={setSelectedMapIds}
                onInteractiveChange={setMapInteractive}
                className="min-h-[520px] lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]"
              />
            </ClientOnly>
            <div
              id="map-results"
              className="flex min-h-0 flex-col gap-4 lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
            >
              {mapCards.length === 0 ? (
                <div className="flex min-h-[220px] flex-1 items-center justify-center rounded-2xl border border-dashed border-site-line bg-white px-6 py-10 text-center">
                  <p className="max-w-xs text-sm leading-relaxed text-site-muted">
                    Нажмите на точку на карте — здесь появятся карточки объектов в этом месте.
                    Если в одной точке несколько квартир, покажем все сразу.
                  </p>
                </div>
              ) : (
                <>
                  <p className="shrink-0 text-sm text-site-muted">
                    {mapCards.length === 1
                      ? "Объект в выбранной точке"
                      : `В этой точке: ${mapCards.length}`}
                  </p>
                  {mapCards.map((property) => (
                    <div key={property.id} className="shrink-0">
                      <PropertyCard
                        property={property}
                        photoUrl={
                          property.photos[0]?.path ? publicPhotoUrl(property.photos[0].path) : undefined
                        }
                        freeFromIso={freeFromMap[property.id] ?? null}
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
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

function ViewToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors sm:flex-none",
        active ? "bg-site-navy text-white" : "text-site-navy hover:bg-site-navy-soft",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PriceRangeFilter({
  priceFrom,
  priceTo,
  onChange,
}: {
  priceFrom: string;
  priceTo: string;
  onChange: (key: "priceFrom" | "priceTo", value: string) => void;
}) {
  const [from, setFrom] = useState(priceFrom);
  const [to, setTo] = useState(priceTo);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setFrom(priceFrom);
    setTo(priceTo);
  }, [priceFrom, priceTo]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (from !== priceFrom) onChangeRef.current("priceFrom", from);
      if (to !== priceTo) onChangeRef.current("priceTo", to);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [from, to, priceFrom, priceTo]);

  return (
    <div className="col-span-2 flex h-11 min-w-0 w-full items-stretch overflow-hidden rounded-md border border-input bg-transparent shadow-sm sm:w-[260px]">
      <div className="flex min-w-0 flex-1 items-center gap-1 px-2.5">
        <span className="shrink-0 text-xs text-muted-foreground">от</span>
        <input
          type="text"
          inputMode="numeric"
          value={formatPriceDigits(from)}
          onChange={(e) => setFrom(priceDigits(e.target.value))}
          placeholder="0 ₽"
          aria-label="Цена от"
          className="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <span className="w-px shrink-0 self-stretch bg-input" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-1 px-2.5">
        <span className="shrink-0 text-xs text-muted-foreground">до</span>
        <input
          type="text"
          inputMode="numeric"
          value={formatPriceDigits(to)}
          onChange={(e) => setTo(priceDigits(e.target.value))}
          placeholder="0 ₽"
          aria-label="Цена до"
          className="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
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
      <SelectTrigger className="h-11 min-w-0 w-full sm:w-[180px]">
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
