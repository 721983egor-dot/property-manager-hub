import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Globe, RefreshCw } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { getPropertyStats } from "@/lib/analytics.functions";
import { setCianPublished, syncCianMessages, syncCianStats } from "@/lib/cian.functions";

import { PLATFORMS, fetchPropertyListings, setSitePublished } from "@/lib/listings";
import { fetchProperty, internalTitle } from "@/lib/properties";
import { toISODate } from "@/lib/rentals";

export const Route = createFileRoute("/promo/$id")({
  head: () => ({
    meta: [
      { title: "Статистика объекта — RM OS" },
      {
        name: "description",
        content: "Просмотры, обращения и площадки публикации по объекту за выбранный период.",
      },
      { property: "og:title", content: "Статистика объекта — RM OS" },
      {
        property: "og:description",
        content: "Просмотры, обращения и площадки публикации по объекту.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PromoDetailPage,
});

const RANGES = [
  { key: "7", label: "7 дней", days: 7 },
  { key: "30", label: "30 дней", days: 30 },
  { key: "90", label: "90 дней", days: 90 },
] as const;

function PromoDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]["key"]>("30");
  const [busy, setBusy] = useState(false);
  const [cianBusy, setCianBusy] = useState(false);
  const setCian = useServerFn(setCianPublished);

  const days = RANGES.find((r) => r.key === rangeKey)!.days;
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

  const loadStats = useServerFn(getPropertyStats);
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["property-stats", id, from, to],
    queryFn: () => loadStats({ data: { propertyId: id, from, to } }),
  });

  const loadCianStats = useServerFn(syncCianStats);
  const {
    data: cianStats,
    refetch: refetchCian,
    isFetching: cianFetching,
  } = useQuery({
    queryKey: ["cian-stats", id, from, to],
    queryFn: () => loadCianStats({ data: { propertyId: id, from, to } }),
  });

  const loadCianMessages = useServerFn(syncCianMessages);
  const { data: cianMessages, refetch: refetchMessages } = useQuery({
    queryKey: ["cian-messages", id],
    queryFn: () => loadCianMessages({ data: { propertyId: id } }),
  });

  const cianTotals = (cianStats?.days ?? []).reduce(
    (acc, d) => ({
      impressions: acc.impressions + d.impressions,
      views: acc.views + d.views,
      contact_views: acc.contact_views + d.contact_views,
      calls: acc.calls + d.calls,
      messages: acc.messages + d.messages,
      favorites: acc.favorites + d.favorites,
    }),
    { impressions: 0, views: 0, contact_views: 0, calls: 0, messages: 0, favorites: 0 },
  );


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

  const totals = stats?.totals;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 lg:px-10 lg:py-10">
      <Link
        to="/promo"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Публикация и реклама
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {property ? internalTitle(property) : "Объект"}
          </h1>
          {property ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {property.complex_name || "Без комплекса"} · ID {property.ref_id}
            </p>
          ) : null}
        </div>
        {property ? (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/objects/$id" params={{ id: property.id }}>
                Карточка объекта
              </Link>
            </Button>
            <Button onClick={togglePublish} disabled={busy}>
              <Globe className="size-4" />
              {property.published ? "Снять с сайта" : "Опубликовать на сайте"}
            </Button>
          </div>
        ) : null}
      </header>

      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Где опубликовано</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {PLATFORMS.map((platform) => {
            const row = listings.find((l) => l.platform === platform.value);
            const published =
              platform.value === "site" ? Boolean(property?.published) : Boolean(row?.published);
            return (
              <li key={platform.value} className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium">{platform.label}</p>
                <p
                  className={
                    "mt-1 text-sm " + (published ? "text-emerald-600" : "text-muted-foreground")
                  }
                >
                  {published ? "Опубликовано" : "Не опубликовано"}
                </p>
                {published && row?.published_at ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    с {new Date(row.published_at).toLocaleDateString("ru-RU")}
                  </p>
                ) : null}
                {!platform.available ? (
                  <p className="mt-2 text-xs text-muted-foreground">Подключение по API — скоро</p>
                ) : null}
                {platform.value === "cian" && property ? (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant={published ? "outline" : "default"}
                      disabled={cianBusy}
                      onClick={() => toggleCian(published)}
                    >
                      <Globe className="size-3.5" />
                      {published ? "Снять с ЦИАН" : "Опубликовать на ЦИАН"}
                    </Button>
                    {published && row?.last_synced_at ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Синхронизация: {new Date(row.last_synced_at).toLocaleString("ru-RU")}
                      </p>
                    ) : null}
                    {row?.sync_error ? (
                      <p className="mt-2 text-xs text-destructive">{row.sync_error}</p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Статистика на сайте</h2>
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRangeKey(r.key)}
                className={
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                  (rangeKey === r.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {statsLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Загрузка...</p>
        ) : (
          <>
            <dl className="mt-4 grid gap-4 sm:grid-cols-4">
              <Metric label="Просмотры страницы" value={totals?.page_view ?? 0} />
              <Metric label="Клики «Связаться»" value={totals?.contact_click ?? 0} />
              <Metric label="Заявки" value={totals?.lead_submit ?? 0} />
              <Metric label="В подборках" value={totals?.selection_add ?? 0} />
            </dl>

            <div className="mt-6 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.days ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => d.slice(8) + "." + d.slice(5, 7)}
                    fontSize={12}
                  />
                  <YAxis allowDecimals={false} fontSize={12} width={30} />
                  <Tooltip
                    labelFormatter={(d: string) => new Date(d).toLocaleDateString("ru-RU")}
                  />
                  <Line
                    type="monotone"
                    dataKey="page_view"
                    name="Просмотры"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="lead_submit"
                    name="Заявки"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Статистика считается анонимно и накапливается с момента запуска раздела.
            </p>
          </>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Статистика ЦИАН</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refetchCian();
              void refetchMessages();
            }}
            disabled={cianFetching}
          >
            <RefreshCw className={"size-4 " + (cianFetching ? "animate-spin" : "")} />
            Синхронизировать
          </Button>
        </div>

        {cianStats?.error ? (
          <p className="mt-3 text-sm text-muted-foreground">{cianStats.error}</p>
        ) : null}

        <dl className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Показы" value={cianTotals.impressions} />
          <Metric label="Просмотры" value={cianTotals.views} />
          <Metric label="Просмотры контактов" value={cianTotals.contact_views} />
          <Metric label="Звонки" value={cianTotals.calls} />
          <Metric label="Сообщения" value={cianTotals.messages} />
          <Metric label="В избранном" value={cianTotals.favorites} />
        </dl>

        <div className="mt-6">
          <h3 className="text-sm font-semibold">Сообщения из чата ЦИАН</h3>
          {cianMessages?.messages?.length ? (
            <ul className="mt-3 space-y-3">
              {cianMessages.messages.map((m) => (
                <li key={m.id} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    {m.author} · {new Date(m.sent_at).toLocaleString("ru-RU")}
                  </p>
                  <p className="mt-1 text-sm">{m.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {cianMessages?.error || "Сообщений пока нет"}
            </p>
          )}
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        {PLATFORMS.filter((p) => !p.available).map((p) => (
          <div key={p.value} className="rounded-xl border border-dashed border-border p-6">
            <h2 className="text-base font-semibold">Статистика {p.label}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Площадка не подключена. После подключения по API здесь появятся показы, просмотры
              контактов и обращения.
            </p>
          </div>
        ))}
      </section>

    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}
