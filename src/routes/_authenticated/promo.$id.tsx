import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ExternalLink, Globe, RefreshCw } from "lucide-react";
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
import { setCianPublished, syncCianStats } from "@/lib/cian.functions";
import { PLATFORMS, fetchPropertyListings, setSitePublished, type ListingPlatform } from "@/lib/listings";
import {
  getPropertyPlatformStats,
  getPropertyPromoMessages,
  refreshAvitoStats,
  refreshYandexStats,
  type PlatformDay,
} from "@/lib/promo-stats.functions";
import { fetchProperty, internalTitle } from "@/lib/properties";
import { fetchDealStages, fetchPropertyDeals, fetchPropertyShowings, formatBudget } from "@/lib/deals";
import { fetchCrmClients } from "@/lib/clients";
import { fetchPropertyTasks, fetchStaffDirectory, formatTaskTimeRange } from "@/lib/tasks";
import { formatDateRu } from "@/lib/rentals";
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
  site: "#4f46e5",
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
  const loadCian = useServerFn(syncCianStats);
  const syncAvito = useServerFn(refreshAvitoStats);
  const syncYandex = useServerFn(refreshYandexStats);
  const loadMessages = useServerFn(getPropertyPromoMessages);

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
  const { data: propertyTasks = [] } = useQuery({
    queryKey: ["property-tasks", id],
    queryFn: () => fetchPropertyTasks(id),
  });
  const { data: staffDirectory = [] } = useQuery({
    queryKey: ["staff-directory"],
    queryFn: fetchStaffDirectory,
  });
  const { data: series, isLoading: statsLoading } = useQuery({
    queryKey: ["property-platform-stats", id, from, to],
    queryFn: () => loadSeries({ data: { propertyId: id, from, to } }),
  });
  const { data: inbox, refetch: refetchMessages } = useQuery({
    queryKey: ["promo-messages", id],
    queryFn: async () => {
      const result = await loadMessages({ data: { propertyId: id } });
      await qc.invalidateQueries({ queryKey: ["property-platform-stats", id] });
      return result;
    },
  });

  const stageById = new Map(dealStages.map((stage) => [stage.id, stage]));
  const clientById = new Map(crmClients.map((client) => [client.id, client]));
  const staffById = new Map(staffDirectory.map((member) => [member.id, member.full_name || member.email]));
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
        loadCian({ data: { propertyId: id, from, to } }),
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
          const withMessages = platform.value === "avito" || platform.value === "cian";
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
              <dl className={"mt-3 grid gap-2 " + (withMessages ? "grid-cols-2" : "grid-cols-3")}>
                <Metric label="Просмотры" value={totals?.views ?? 0} compact />
                <Metric label="Обращения" value={totals?.contacts ?? 0} compact />
                <Metric label={thirdLabel} value={thirdValue} compact />
                {withMessages ? <Metric label="Сообщения" value={totals?.messages ?? 0} compact /> : null}
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
              <LineChart data={series?.days ?? []} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
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
                <Tooltip
                  labelFormatter={(value: string) => new Date(value).toLocaleDateString("ru-RU")}
                />
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
        <h2 className="text-base font-semibold">Задачи по объекту</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          История созданных и выполненных задач, если объект выбран в карточке задачи.
        </p>
        {propertyTasks.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Задач по объекту пока нет.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {propertyTasks.map((task) => {
              const range = formatTaskTimeRange(task.due_start, task.due_end);
              const doneItems = task.items.filter((item) => item.done).length;
              return (
                <li key={task.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {task.title || "Без названия"}
                      {range ? ` (${range})` : ""}
                    </p>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {task.status === "done" ? "Выполнена" : "В работе"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {task.due_date ? formatDateRu(task.due_date) : "Без срока"}
                    {task.assignee_id ? ` · ${staffById.get(task.assignee_id) ?? "сотрудник"}` : ""}
                    {task.items.length > 0 ? ` · чеклист ${doneItems}/${task.items.length}` : ""}
                  </p>
                  {task.status === "done" && task.completed_at ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Закрыта {new Date(task.completed_at).toLocaleString("ru-RU")}
                    </p>
                  ) : null}
                  {task.items.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {task.items.map((item) => (
                        <li key={item.id} className="text-xs text-muted-foreground">
                          {item.done ? "●" : "○"} {item.title}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <MessageHistoryCard
          title="Сообщения ЦИАН"
          messages={inbox?.cian.messages ?? []}
          error={inbox?.cian.messages.length ? "" : inbox?.cian.error}
        />
        <MessageHistoryCard
          title="Сообщения Авито"
          messages={inbox?.avito.messages ?? []}
          error={inbox?.avito.messages.length ? "" : inbox?.avito.error}
        />
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

const PREVIEW_COUNT = 3;

function MessageHistoryCard({
  title,
  messages,
  error,
}: {
  title: string;
  messages: { id: string; author: string; direction: string; body: string; sent_at: string }[];
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const preview = messages.slice(0, PREVIEW_COUNT);
  const rest = messages.slice(PREVIEW_COUNT);
  const visible = open ? messages : preview;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {messages.length > 0 ? (
          <p className="text-xs text-muted-foreground">{messages.length}</p>
        ) : null}
      </div>
      {visible.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {visible.map((message) => (
            <li key={message.id} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">
                {message.direction === "out" ? "Мы" : message.author || "Клиент"} ·{" "}
                {new Date(message.sent_at).toLocaleString("ru-RU")}
              </p>
              <p className={open ? "mt-1 text-sm" : "mt-1 line-clamp-2 text-sm"}>{message.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{error || "Сообщений пока нет"}</p>
      )}
      {rest.length > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={"size-4 transition-transform " + (open ? "rotate-180" : "")} />
          {open ? "Свернуть" : `Показать все (${messages.length})`}
        </button>
      ) : null}
    </section>
  );
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
