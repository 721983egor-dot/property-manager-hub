import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { BarChart3, Download, Link2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLATFORMS, fetchListings, type ListingPlatform } from "@/lib/listings";
import { getPromoBoard, type PlatformTotals } from "@/lib/promo-stats.functions";
import {
  fetchProperties,
  formatMoney,
  internalTitle,
  signedUrls,
} from "@/lib/properties";
import { toISODate } from "@/lib/rentals";

export const Route = createFileRoute("/_authenticated/promo/")({
  head: () => ({
    meta: [
      { title: "Публикация и реклама — RM OS" },
      {
        name: "description",
        content:
          "Где опубликован каждый объект и сколько его смотрят на сайте, Авито, ЦИАН и Яндексе.",
      },
    ],
  }),
  component: () => (
    <AdminOnly>
      <PromoListPage />
    </AdminOnly>
  ),
});

type Filter = "all" | "published" | "unpublished";
type Period = "7" | "30";

const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: "7", label: "7 дней", days: 7 },
  { key: "30", label: "30 дней", days: 30 },
];

const EMPTY: PlatformTotals = { views: 0, contacts: 0, favorites: 0, leads: 0, hasData: false };

function periodRange(days: number) {
  const to = toISODate(new Date());
  const from = toISODate(new Date(Date.now() - (days - 1) * 86_400_000));
  return { from, to };
}

function formatCount(value: number) {
  return value.toLocaleString("ru-RU");
}

function PromoListPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [period, setPeriod] = useState<Period>("7");
  const loadBoard = useServerFn(getPromoBoard);
  const range = PERIODS.find((item) => item.key === period)!;
  const dates = periodRange(range.days);

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });
  const { data: listings = [] } = useQuery({
    queryKey: ["property-listings"],
    queryFn: fetchListings,
  });
  const { data: board = {} } = useQuery({
    queryKey: ["promo-board", dates.from, dates.to],
    queryFn: () => loadBoard({ data: dates }),
  });

  const active = properties.filter((p) => p.status !== "archived");
  const paths = active.map((p) => p.photos?.[0]?.path).filter(Boolean) as string[];
  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", paths.slice().sort().join("|")],
    queryFn: () => signedUrls(paths),
    enabled: paths.length > 0,
  });

  const listingMap = useMemo(() => {
    const map = new Map<string, Partial<Record<ListingPlatform, { published: boolean }>>>();
    for (const listing of listings) {
      const entry = map.get(listing.property_id) ?? {};
      entry[listing.platform] = { published: listing.published };
      map.set(listing.property_id, entry);
    }
    return map;
  }, [listings]);

  const filtered = active.filter((property) => {
    if (filter === "published" && !property.published) return false;
    if (filter === "unpublished" && property.published) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      internalTitle(property).toLowerCase().includes(query) ||
      property.title.toLowerCase().includes(query) ||
      property.complex_name.toLowerCase().includes(query)
    );
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Публикация и реклама</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Статистика по каждой площадке за выбранный период.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-9">
            <Link to="/promo/avito">
              <Link2 className="size-4" />
              Сопоставить Авито
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-9">
            <Link to="/promo/import">
              <Download className="size-4" />
              Фиды и сверка
            </Link>
          </Button>
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или ЖК"
            className="h-9 pl-9"
          />
        </div>
        <ChipRow
          value={period}
          onChange={setPeriod}
          items={PERIODS.map((item) => ({ key: item.key, label: item.label }))}
        />
        <ChipRow
          value={filter}
          onChange={setFilter}
          items={[
            { key: "all", label: "Все" },
            { key: "published", label: "На сайте" },
            { key: "unpublished", label: "Не на сайте" },
          ]}
        />
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Загрузка...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Объекты не найдены</p>
      ) : (
        <div className="mt-6 grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((property) => {
            const photo = property.photos?.[0]?.path;
            const entry = listingMap.get(property.id) ?? {};
            const stats = board[property.id];
            return (
              <article
                key={property.id}
                className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card"
              >
                <div className="aspect-[16/10] bg-muted">
                  {photo && urls[photo] ? (
                    <img
                      src={urls[photo]}
                      alt={property.title}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="grid size-full place-items-center text-xs text-muted-foreground">
                      Нет фото
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="min-h-[4.75rem]">
                    <h2 className="line-clamp-2 text-[15px] font-semibold leading-snug">
                      {internalTitle(property)}
                    </h2>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {property.complex_name || "Без комплекса"}
                    </p>
                    <p className="mt-1 text-sm font-medium">{formatMoney(property.price_month)}</p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {PLATFORMS.map((platform) => {
                      const published =
                        platform.value === "site"
                          ? property.published
                          : Boolean(entry[platform.value]?.published);
                      const totals = stats?.[platform.value] ?? EMPTY;
                      return (
                        <div key={platform.value} className="rounded-lg border border-border p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-medium">{platform.label}</p>
                            <span
                              className={
                                "size-2 shrink-0 rounded-full " +
                                (published ? "bg-emerald-500" : "bg-muted-foreground/30")
                              }
                            />
                          </div>
                          <p className="mt-2 text-lg font-semibold tabular-nums leading-none">
                            {totals.hasData || published ? formatCount(totals.views) : "—"}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {totals.hasData || published
                              ? `${formatCount(totals.contacts)} обр.`
                              : "нет данных"}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <Button asChild variant="outline" className="mt-4 h-9 w-full">
                    <Link to="/promo/$id" params={{ id: property.id }}>
                      <BarChart3 className="size-4" />
                      Статистика
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChipRow<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { key: T; label: string }[];
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border p-1">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={
            "h-7 rounded-md px-3 text-sm font-medium transition-colors " +
            (value === item.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
