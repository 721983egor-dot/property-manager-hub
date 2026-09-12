import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ExternalLink, Globe, RefreshCw } from "lucide-react";
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
import { setAvitoPublished } from "@/lib/avito.functions";
import { setCianPublished, syncCianMessages, syncCianStats } from "@/lib/cian.functions";
import { PLATFORMS, fetchPropertyListings, setSitePublished, type ListingPlatform } from "@/lib/listings";
import { getPropertyPlatformStats, refreshAvitoStats, refreshYandexStats, type PlatformDay } from "@/lib/promo-stats.functions";
import { fetchProperty, internalTitle } from "@/lib/properties";
import { fetchDealStages, fetchPropertyDeals, fetchPropertyShowings, formatBudget } from "@/lib/deals";
import { fetchCrmClients } from "@/lib/clients";
import { setYandexPublished } from "@/lib/yandex-realty.functions";
import { toISODate } from "@/lib/rentals";

export const Route = createFileRoute("/_authenticated/promo/$id")({
  head: () => ({
    meta: [
      { title: "Статистика объекта — RM OS" },
      {
        name: "description",
        content: "Просмотры и обращения по площадкам: сайт, Авито, ЦИАН и Яндекс.",
      },
    ],
  }),
  component: () => (
    <AdminOnly>
      <PromoDetailPage />
    </AdminOnly>
  ),
});

const RANGES = [
  { key: "7", label: "7 дней", days: 7 },
  { key: "30", label: "30 дней", days: 30 },
  { key: "90", label: "90 дней", days: 90 },
] as const;

const CHART_PLATFORMS = [
  { key: "all", label: "Все площадки" },
  { key: "site", label: "Сайт" },
  { key: "avito", label: "Авито" },
  { key: "cian", label: "ЦИАН" },
  { key: "yandex", label: "Яндекс" },
] as const;

type ChartPlatform = (typeof CHART_PLATFORMS)[number]["key"];

const LINE_COLOR: Record<Exclude<ChartPlatform, "all">, string> = {
  site: "hsl(var(--primary))",
  avito: "#2563eb",
  cian: "#0284c7",
  yandex: "#d97706",
};

function PromoDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]["key"]>("7");
  const [chartPlatform, setChartPlatform] = useState<ChartPlatform>("all");
  const [busy, setBusy] = useState(false);
  const [feedBusy, setFeedBusy] = useState<"avito" | "cian" | "yandex" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const setAvito = useServerFn(setAvitoPublished);
  const setCian = useServerFn(setCianPublished);
  const setYandex = useServerFn(setYandexPublished);
  const loadSeries = useServerFn(getPropertyPlatformStats);
  const syncCian = useServerFn(syncCianStats);
  const syncAvito = useServerFn(refreshAvitoStats);
  const syncYandex = useServerFn(refreshYandexStats);
  const loadCianMessages = useServerFn(syncCianMessages);

  const days = RANGES.find((item) => item.key === rangeKey)!.days;
  const to = toISODate(new Date());
  const from = toISODate(new Date(Date.now() - (days - 1) * 86_400_000));

  const { data: property } = useQuery({
    queryKey: ["properties", id],
    queryFn: () => fetchProperty(id),
  });
  const { data: listings = [] } = useQuery({
    queryKey: ["property-listings", id],
    queryFn: () => fetchPropertyListings(id),
  });
  const { data: showings = [] } = useQuery({
    queryKey: ["property-showings", id],
    queryFn: () => fetchPropertyShowings(id),
  });
  const { data: propertyDeals = [] } = useQuery({
    queryKey: ["property-deals", id],
    queryFn: () => fetchPropertyDeals(id),
  });
  const { data: dealStages = [] } = useQuery({
    queryKey: ["deal-stages"],
    queryFn: fetchDealStages,
  });
  const { data: crmClients = [] } = useQuery({
    queryKey: ["crm-clients"],
    queryFn: fetchCrmClients,
  });
  const { data: series, isLoading: statsLoading } = useQuery({
    queryKey: ["property-platform-stats", id, from, to],
    queryFn: () => loadSeries({ data: { propertyId: id, from, to } }),
  });
  const { data: cianMessages, refetch: refetchMessages } = useQuery({
    queryKey: ["cian-messages", id],
    queryFn: () => loadCianMessages({ data: { propertyId: id } }),
  });

  const stageById = new Map(dealStages.map((stage) => [stage.id, stage]));
  const clientById = new Map(crmClients.map((client) => [client.id, client]));
  const wonCount = propertyDeals.filter((deal) => stageById.get(deal.stage_id)?.kind === "won").length;

  async function toggleFeed(platform: "avito" | "cian" | "yandex", published: boolean) {
    setFeedBusy(platform);
    const label = platform === "avito" ? "Авито" : platform === "cian" ? "ЦИАН" : "Яндекс Недвижимость";
    try {
      const fn = platform === "avito" ? setAvito : platform === "cian" ? setCian : setYandex;
      await fn({ data: { propertyId: id, published: !published } });
      await qc.invalidateQueries({ queryKey: ["property-listings", id] });
      await qc.invalidateQueries({ queryKey: ["property-listings"] });
      toast.success(published ? `Убран из фида ${label}` : `Добавлен в фид ${label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Не удалось изменить публикацию на ${label}`);
    } finally {
      setFeedBusy(null);
    }
  }

  async function togglePublish() {
    if (!property) return;
    setBusy(true);
    try {
      await setSitePublished(property.id, !property.published);
      await qc.invalidateQueries({ queryKey: ["properties"] });
      await qc.invalidateQueries({ queryKey: ["property-listings"] });
      toast.success(property.published ? "Снято с публикации" : "Опубликовано на сайте");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось изменить публикацию");
    } finally {
      setBusy(false);
    }
  }

  async function refreshStats() {
    setRefreshing(true);
    try {
      const results = await Promise.allSettled([
        syncAvito({}),
        syncCian({ data: { propertyId: id, from, to } }),
        syncYandex({}),
      ]);
      const failed = results.find((result) => result.status === "rejected");
      if (failed && failed.status === "rejected" && results.every((result) => result.status === "rejected")) {
        throw failed.reason;
      }
      await qc.invalidateQueries({ queryKey: ["property-platform-stats", id] });
      await refetchMessages();
      toast.success("Статистика обновлена");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось обновить статистику");
    } finally {
      setRefreshing(false);
    }
  }

  const chartLines = chartLinesFor(chartPlatform);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link
        to="/promo"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Публикация и реклама
      </Link>

      <header className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {property ? internalTitle(property) : "Объект"}
          </h1>
          {property ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {property.complex_name || "Без комплекса"} · ID {property.ref_id}
            </p>
          ) : null}
        </div>
        {property ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-9">
              <Link to="/objects/$id" params={{ id: property.id }}>
                Карточка объекта
              </Link>
            </Button>
            <Button className="h-9" onClick={togglePublish} disabled={busy}>
              <Globe className="size-4" />
              {property.published ? "Снять с сайта" : "Опубликовать на сайте"}
            </Button>
          </div>
        ) : null}
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PLATFORMS.map((platform) => {
          const row = listings.find((listing) => listing.platform === platform.value);
          const published =
            platform.value === "site" ? Boolean(property?.published) : Boolean(row?.published);
          const totals = series?.totals[platform.value];
          const thirdLabel = platform.value === "site" ? "Заявки" : "В избранном";
          const thirdValue = platform.value === "site" ? totals?.leads ?? 0 : totals?.favorites ?? 0;
          return (
            <article key={platform.value} className="flex min-h-[220px] flex-col rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{platform.label}</h2>
                  <p className={"mt-1 text-sm " + (published ? "text-emerald-600" : "text-muted-foreground")}>
                    {published ? "Опубликовано" : "Не опубликовано"}
                  </p>
                </div>
                <span
                  className={
                    "mt-1 size-2 rounded-full " + (published ? "bg-emerald-500" : "bg-muted-foreground/30")
                  }
                />
              </div>
              <p className="mt-1 min-h-4 text-xs text-muted-foreground">
                {published && row?.published_at
                  ? `с ${new Date(row.published_at).toLocaleDateString("ru-RU")}`
                  : " "}
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="Просмотры" value={totals?.views ?? 0} compact />
                <Metric label="Обращения" value={totals?.contacts ?? 0} compact />
                <Metric label={thirdLabel} value={thirdValue} compact />
              </dl>
              <div className="mt-auto flex gap-2 pt-4">
                <PlatformAction
                  platform={platform.value}
                  published={published}
                  url={row?.external_url ?? ""}
                  busy={
                    platform.value === "site"
                      ? busy
                      : feedBusy === platform.value
                  }
                  onToggle={() => {
                    if (platform.value === "site") void togglePublish();
                    if (
                      platform.value === "avito" ||
                      platform.value === "cian" ||
                      platform.value === "yandex"
                    ) {
                      void toggleFeed(platform.value, published);
                    }
                  }}
                />
              </div>
            </article>
          );
        })}
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-base font-semibold">График</h2>
          <div className="flex flex-wrap items-center gap-2">
            <ChipRow
              value={chartPlatform}
              onChange={setChartPlatform}
              items={CHART_PLATFORMS.map((item) => ({ key: item.key, label: item.label }))}
            />
            <ChipRow
              value={rangeKey}
              onChange={setRangeKey}
              items={RANGES.map((item) => ({ key: item.key, label: item.label }))}
            />
            <Button variant="outline" className="h-9" onClick={refreshStats} disabled={refreshing}>
              <RefreshCw className={"size-4 " + (refreshing ? "animate-spin" : "")} />
              Обновить
            </Button>
          </div>
        </div>

        {statsLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Загрузка...</p>
        ) : (
          <div className="mt-5 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series?.days ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) => value.slice(8) + "." + value.slice(5, 7)}
                  fontSize={12}
                />
                <YAxis allowDecimals={false} fontSize={12} width={32} />
                <Tooltip
                  labelFormatter={(value: string) => new Date(value).toLocaleDateString("ru-RU")}
                />
                <Legend />
                {chartLines.map((line) => (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.label}
                    stroke={line.color}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Сайт считает просмотры страницы. Авито, ЦИАН и Яндекс — просмотры объявления. Обращения
          видны, если выбрать одну площадку.
        </p>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Показы и сделки</h2>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <Metric label="Показов" value={showings.length} />
            <Metric label="Сделок" value={propertyDeals.length} />
            <Metric label="Успешных" value={wonCount} />
          </dl>
          {showings.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Показов пока не было.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {showings.map((showing) => (
                <li key={showing.id} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">
                    {new Date(showing.shown_at).toLocaleDateString("ru-RU")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {showing.author_name || "Сотрудник"}
                  </p>
                  {showing.note ? <p className="mt-1 text-sm">{showing.note}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Сделки</h2>
          {propertyDeals.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Сделок по объекту нет.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {propertyDeals.map((deal) => {
                const stage = stageById.get(deal.stage_id);
                const client = deal.client_id ? clientById.get(deal.client_id) : null;
                return (
                  <li key={deal.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{deal.title || "Без названия"}</p>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {stage?.name || "Стадия"}
                      </span>
                    </div>
                    {client ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{client.full_name}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {deal.price_month != null
                        ? `${deal.price_month.toLocaleString("ru-RU")} ₽/мес`
                        : `Бюджет: ${formatBudget(deal.budget)}`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Сообщения ЦИАН</h2>
        {cianMessages?.messages?.length ? (
          <ul className="mt-4 space-y-2">
            {cianMessages.messages.map((message) => (
              <li key={message.id} className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  {message.author} · {new Date(message.sent_at).toLocaleString("ru-RU")}
                </p>
                <p className="mt-1 text-sm">{message.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {cianMessages?.error || "Сообщений пока нет"}
          </p>
        )}
      </section>
    </div>
  );
}

function chartLinesFor(platform: ChartPlatform): { key: keyof PlatformDay; label: string; color: string }[] {
  if (platform === "all") {
    return [
      { key: "site_views", label: "Сайт", color: LINE_COLOR.site },
      { key: "avito_views", label: "Авито", color: LINE_COLOR.avito },
      { key: "cian_views", label: "ЦИАН", color: LINE_COLOR.cian },
      { key: "yandex_views", label: "Яндекс", color: LINE_COLOR.yandex },
    ];
  }
  return [
    { key: `${platform}_views`, label: "Просмотры", color: LINE_COLOR[platform] },
    { key: `${platform}_contacts`, label: "Обращения", color: "#16a34a" },
  ];
}

function PlatformAction({
  published,
  url,
  busy,
  onToggle,
}: {
  platform: ListingPlatform;
  published: boolean;
  url: string;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {url ? (
        <Button asChild variant="outline" className="h-9 flex-1">
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" />
            Открыть
          </a>
        </Button>
      ) : null}
      <Button
        className={url ? "h-9 flex-1" : "h-9 w-full"}
        variant={published ? "outline" : "default"}
        disabled={busy}
        onClick={onToggle}
      >
        <Globe className="size-3.5" />
        {published ? "Снять" : "Опубликовать"}
      </Button>
    </>
  );
}

function Metric({ label, value, compact }: { label: string; value: number; compact?: boolean }) {
  return (
    <div className={compact ? "" : "rounded-lg border border-border p-3"}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={compact ? "mt-1 text-lg font-semibold tabular-nums" : "mt-1 text-2xl font-semibold tabular-nums"}>
        {value.toLocaleString("ru-RU")}
      </dd>
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
    <div className="flex h-9 items-center gap-1 rounded-lg border border-border p-1">
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
