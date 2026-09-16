import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { BarChart3, Download, Link2, Search } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLATFORMS, fetchListings, isPlatformPublished, type ListingPlatform, type PropertyListing } from "@/lib/listings";
import { getPromoBoard, getPromoFeedFlags, getPromoOverview, type PlatformTotals } from "@/lib/promo-stats.functions";
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

type PublishFilter = "all" | ListingPlatform;
type Period = "7" | "30" | "90";
type ChartSeries = "total" | "platforms" | ListingPlatform;
type ViewSort = "views_desc" | "views_asc";

const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: "7", label: "7 дней", days: 7 },
  { key: "30", label: "30 дней", days: 30 },
  { key: "90", label: "90 дней", days: 90 },
];

const PUBLISH_FILTERS: { key: PublishFilter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "site", label: "Сайт" },
  { key: "avito", label: "Авито" },
  { key: "cian", label: "ЦИАН" },
  { key: "yandex", label: "Яндекс" },
];

const LINE_COLOR: Record<ListingPlatform, string> = {
  site: "#4f46e5",
  avito: "#2563eb",
  cian: "#0284c7",
  yandex: "#d97706",
};
const TOTAL_LINE_COLOR = "#0f172a";

const PLATFORM_ORDER: ListingPlatform[] = ["site", "avito", "cian", "yandex"];
const PLATFORM_CARDS = [...PLATFORMS].sort(
  (a, b) => PLATFORM_ORDER.indexOf(a.value) - PLATFORM_ORDER.indexOf(b.value),
);

const EMPTY: PlatformTotals = {
  views: 0,
  contacts: 0,
  favorites: 0,
  leads: 0,
  messages: 0,
  hasData: false,
};

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
  const [filter, setFilter] = useState<PublishFilter>("all");
  const [period, setPeriod] = useState<Period>("7");
  const [chartSeries, setChartSeries] = useState<ChartSeries>("total");
  const [viewSort, setViewSort] = useState<ViewSort>("views_desc");
  const loadBoard = useServerFn(getPromoBoard);
  const loadOverview = useServerFn(getPromoOverview);
  const loadFeedFlags = useServerFn(getPromoFeedFlags);
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
  const { data: feedFlags } = useQuery({
    queryKey: ["promo-feed-flags"],
    queryFn: () => loadFeedFlags(),
  });
  const { data: board = {} } = useQuery({
    queryKey: ["promo-board", dates.from, dates.to],
    queryFn: () => loadBoard({ data: dates }),
  });
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["promo-overview", dates.from, dates.to],
    queryFn: () => loadOverview({ data: dates }),
  });

  const listingMap = useMemo(() => {
    const map = new Map<string, Partial<Record<ListingPlatform, PropertyListing>>>();
    for (const listing of listings) {
      const entry = map.get(listing.property_id) ?? {};
      entry[listing.platform] = listing;
      map.set(listing.property_id, entry);
    }
    return map;
  }, [listings]);

  const active = useMemo(
    () => properties.filter((property) => property.status !== "archived" && property.portfolio !== "n11"),
    [properties],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = active.filter((property) => {
      const entry = listingMap.get(property.id) ?? {};
      if (filter === "site" && !property.published) return false;
      if (filter !== "all" && filter !== "site" && !isPlatformPublished(property, filter, entry[filter], feedFlags)) {
        return false;
      }
      if (!query) return true;
      return (
        internalTitle(property).toLowerCase().includes(query) ||
        property.title.toLowerCase().includes(query) ||
        property.complex_name.toLowerCase().includes(query)
      );
    });
    const dir = viewSort === "views_asc" ? 1 : -1;
    rows.sort((left, right) => {
      const delta = propertyViews(board[left.id], filter) - propertyViews(board[right.id], filter);
      if (delta !== 0) return delta * dir;
      return internalTitle(left).localeCompare(internalTitle(right), "ru");
    });
    return rows;
  }, [active, board, feedFlags, filter, listingMap, search, viewSort]);

  const paths = active.map((property) => property.photos?.[0]?.path).filter(Boolean) as string[];
  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", paths.slice().sort().join("|")],
    queryFn: () => signedUrls(paths),
    enabled: paths.length > 0,
  });

  const chartLines = chartLinesFor(chartSeries);
  const totals = overview?.totals;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Публикация и реклама</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Статистика Резиденции Море по площадкам за выбранный период.
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

      <section className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-base font-semibold">Просмотры</h2>
          <ChipRow
            value={period}
            onChange={(value) => setPeriod(value)}
            items={PERIODS.map((item) => ({ key: item.key, label: item.label }))}
          />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <OverviewStat
            label="Всего просмотров"
            value={totals?.all.views ?? 0}
            active={chartSeries === "total"}
            onClick={() => setChartSeries("total")}
          />
          {PLATFORM_CARDS.map((platform) => (
            <OverviewStat
              key={platform.value}
              label={platform.short}
              value={totals?.[platform.value].views ?? 0}
              active={chartSeries === platform.value}
              onClick={() => setChartSeries(platform.value)}
            />
          ))}
        </div>
        <div className="mt-3">
          <ChipRow
            value={chartSeries}
            onChange={(value) => setChartSeries(value)}
            items={[
              { key: "total", label: "Всего" },
              { key: "platforms", label: "По площадкам" },
              { key: "site", label: "Сайт" },
              { key: "avito", label: "Авито" },
              { key: "cian", label: "ЦИАН" },
              { key: "yandex", label: "Яндекс" },
            ]}
          />
        </div>

        {overviewLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Загрузка графика...</p>
        ) : (
          <div className="mt-5 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overview?.days ?? []} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) => value.slice(8) + "." + value.slice(5, 7)}
                  fontSize={12}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  allowDecimals={false}
                  fontSize={12}
                  width={44}
                  domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.15))]}
                />
                <Tooltip labelFormatter={(value: string) => new Date(value).toLocaleDateString("ru-RU")} />
                <Legend />
                {chartLines.map((line) => (
                  <Line
                    key={line.key}
                    type="linear"
                    dataKey={line.key}
                    name={line.label}
                    stroke={line.color}
                    strokeWidth={2.5}
                    dot={{ r: 2.5, strokeWidth: 0, fill: line.color }}
                    activeDot={{ r: 4 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Нажмите на площадку сверху, чтобы увидеть только её просмотры. «По площадкам» показывает все
          линии сразу.
        </p>
      </section>

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
        <ChipRow value={filter} onChange={setFilter} items={PUBLISH_FILTERS} />
        <ChipRow
          value={viewSort}
          onChange={(value) => setViewSort(value)}
          items={[
            { key: "views_desc", label: "Больше просмотров" },
            { key: "views_asc", label: "Меньше просмотров" },
          ]}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Фильтр: опубликовано на выбранной площадке. Сортировка по просмотрам за выбранный период.
      </p>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Загрузка...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Объекты не найдены</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((property) => {
            const photo = property.photos?.[0]?.path;
            const entry = listingMap.get(property.id) ?? {};
            const stats = board[property.id];
            return (
              <article
                key={property.id}
                className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card"
              >
                <div className="relative h-44 shrink-0 overflow-hidden bg-muted sm:h-48">
                  {photo && urls[photo] ? (
                    <img
                      src={urls[photo]}
                      alt={property.title}
                      loading="lazy"
                      className="absolute inset-0 block size-full object-cover"
                    />
                  ) : (
                    <div className="grid size-full place-items-center text-xs text-muted-foreground">
                      Нет фото
                    </div>
                  )}
                </div>
                <div className="flex min-h-0 flex-1 flex-col p-4">
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
                    {PLATFORM_CARDS.map((platform) => {
                      const published = isPlatformPublished(
                        property,
                        platform.value,
                        entry[platform.value],
                        feedFlags,
                      );
                      const platformTotals = stats?.[platform.value] ?? EMPTY;
                      return (
                        <div key={platform.value} className="rounded-lg border border-border p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-medium">{platform.short}</p>
                            <span
                              className={
                                "size-2 shrink-0 rounded-full " +
                                (published ? "bg-emerald-500" : "bg-muted-foreground/30")
                              }
                            />
                          </div>
                          <p className="mt-2 text-lg font-semibold tabular-nums leading-none">
                            {platformTotals.hasData || published ? formatCount(platformTotals.views) : "—"}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {platformTotals.hasData || published
                              ? `${formatCount(platformTotals.contacts)} обр.`
                              : "нет данных"}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-auto pt-4">
                    <Button asChild variant="outline" className="h-9 w-full">
                      <Link to="/promo/$id" params={{ id: property.id }}>
                        <BarChart3 className="size-4" />
                        Статистика
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function chartLinesFor(series: ChartSeries): { key: string; label: string; color: string }[] {
  if (series === "total") {
    return [{ key: "total_views", label: "Всего просмотров", color: TOTAL_LINE_COLOR }];
  }
  if (series === "platforms") {
    return PLATFORM_CARDS.map((platform) => ({
      key: `${platform.value}_views`,
      label: platform.short,
      color: LINE_COLOR[platform.value],
    }));
  }
  return [{ key: `${series}_views`, label: "Просмотры", color: LINE_COLOR[series] }];
}

function propertyViews(
  stats: Record<ListingPlatform, PlatformTotals> | undefined,
  filter: PublishFilter,
) {
  if (!stats) return 0;
  if (filter === "all") {
    return PLATFORM_ORDER.reduce((sum, platform) => sum + (stats[platform]?.views ?? 0), 0);
  }
  return stats[filter]?.views ?? 0;
}

function OverviewStat({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-lg border p-3 text-left transition-colors " +
        (active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")
      }
    >
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{formatCount(value)}</p>
    </button>
  );
}

function ChipRow<T extends string>({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: T) => void;
  items: { key: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border p-1">
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
