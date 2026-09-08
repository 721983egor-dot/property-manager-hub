import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, Copy, HelpCircle, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  fetchCianOffers,
  getCianFeedInfo,
  linkCianOffers,
  setCianAutoPublish,
  testCianConnection,
} from "@/lib/cian.functions";
import { matchOffers, type MatchConfidence } from "@/lib/cian";
import { getYandexFeedInfo, setYandexAutoPublish } from "@/lib/yandex-realty.functions";
import {
  getYandexFeedStatus,
  syncYandexStats,
  type YandexFeedStatus,
  type YandexStatsResult,
} from "@/lib/yandex-stats.functions";
import { fetchListings } from "@/lib/listings";
import { fetchProperties, formatMoney, internalTitle } from "@/lib/properties";

export const Route = createFileRoute("/_authenticated/promo/import")({
  head: () => ({
    meta: [
      { title: "Сверка объявлений ЦИАН — RM OS" },
      {
        name: "description",
        content:
          "Сопоставление объявлений из кабинета ЦИАН с объектами RM OS перед синхронизацией публикаций.",
      },
      { property: "og:title", content: "Сверка объявлений ЦИАН — RM OS" },
      {
        property: "og:description",
        content: "Связываем размещённые на ЦИАН объявления с объектами RM OS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CianImportPage,
});

const CONFIDENCE_LABEL: Record<MatchConfidence, string> = {
  exact: "Совпало точно",
  likely: "Похоже, проверьте",
  none: "Нет объекта в RM OS",
};

function CianImportPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const loadOffers = useServerFn(fetchCianOffers);
  const checkConnection = useServerFn(testCianConnection);
  const saveLinks = useServerFn(linkCianOffers);
  const loadFeedInfo = useServerFn(getCianFeedInfo);
  const setAutoPublish = useServerFn(setCianAutoPublish);
  const loadYandexFeedInfo = useServerFn(getYandexFeedInfo);
  const setYandexAuto = useServerFn(setYandexAutoPublish);

  const [choices, setChoices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: connection } = useQuery({
    queryKey: ["cian-connection"],
    queryFn: () => checkConnection({}),
  });

  const { data: feedInfo } = useQuery({
    queryKey: ["cian-feed-info"],
    queryFn: () => loadFeedInfo({}),
  });

  const { data: yandexFeedInfo } = useQuery({
    queryKey: ["yandex-feed-info"],
    queryFn: () => loadYandexFeedInfo({}),
  });

  const {
    data: offersResult,
    isLoading: offersLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["cian-offers"],
    queryFn: () => loadOffers({}),
  });

  const { data: properties = [] } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });
  const { data: listings = [] } = useQuery({
    queryKey: ["property-listings"],
    queryFn: fetchListings,
  });

  const linkedByExternalId = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of listings) {
      if (l.platform === "cian" && l.external_id) map.set(l.external_id, l.property_id);
    }
    return map;
  }, [listings]);

  const activeProperties = useMemo(
    () => properties.filter((p) => p.status !== "archived"),
    [properties],
  );

  const matches = useMemo(
    () =>
      matchOffers(offersResult?.offers ?? [], activeProperties, linkedByExternalId).sort(
        (a, b) => Number(a.alreadyLinked) - Number(b.alreadyLinked),
      ),
    [offersResult, activeProperties, linkedByExternalId],
  );

  // Предзаполняем выбор автоматическими совпадениями.
  useEffect(() => {
    if (matches.length === 0) return;
    setChoices((prev) => {
      const next = { ...prev };
      for (const m of matches) {
        if (next[m.offer.externalId] === undefined) {
          next[m.offer.externalId] = m.propertyId ?? "";
        }
      }
      return next;
    });
  }, [matches]);

  const propertyById = useMemo(
    () => new Map(properties.map((p) => [p.id, p])),
    [properties],
  );

  const selectedCount = Object.values(choices).filter(Boolean).length;

  async function save() {
    const links = matches
      .filter((m) => !m.alreadyLinked && choices[m.offer.externalId])
      .map((m) => ({
        propertyId: choices[m.offer.externalId]!,
        externalId: m.offer.externalId,
        externalUrl: m.offer.url,
      }));

    if (links.length === 0) {
      toast.error("Выберите хотя бы один объект для связки");
      return;
    }

    setSaving(true);
    try {
      const result = await saveLinks({ data: { links } });
      toast.success(`Связано объявлений: ${result.linked}`);
      await router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить связки");
    } finally {
      setSaving(false);
    }
  }

  const unmatchedProperties = activeProperties.filter(
    (p) => !Object.values(choices).includes(p.id) && !linkedByExternalId.has(p.id),
  );

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
          <h1 className="text-3xl font-semibold tracking-tight">Сверка объявлений ЦИАН</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Связываем то, что уже размещено на ЦИАН, с объектами в RM OS. Дальше публикации будут
            обновляться автоматически.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={"size-4 " + (isFetching ? "animate-spin" : "")} />
          Обновить список
        </Button>
      </header>

      {feedInfo ? <FeedSettings label="ЦИАН" cabinetHint="Вставьте ссылку на фид в кабинете ЦИАН (раздел «Автозагрузка»). Площадка будет забирать файл сама: новые объекты, изменения цены, описания и фото попадут в объявления без лишних действий." info={feedInfo} onChanged={() => qc.invalidateQueries({ queryKey: ["cian-feed-info"] })} toggleAuto={(enabled) => setAutoPublish({ data: { enabled } })} /> : null}

      {yandexFeedInfo ? <FeedSettings label="Яндекс Недвижимость" cabinetHint="Вставьте ссылку на фид в кабинете Яндекс Недвижимости (раздел загрузки объявлений агентства). Площадка будет забирать файл сама: новые объекты, изменения цены, описания и фото попадут в объявления без лишних действий." info={yandexFeedInfo} onChanged={() => qc.invalidateQueries({ queryKey: ["yandex-feed-info"] })} toggleAuto={(enabled) => setYandexAuto({ data: { enabled } })} /> : null}

      <YandexApiPanel />


      {connection && !connection.connected ? (
        <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-5">
          <h2 className="text-sm font-semibold">Кабинет ЦИАН не подключён</h2>
          <p className="mt-1 text-sm text-muted-foreground">{connection.error}</p>
        </div>
      ) : null}

      {offersResult?.error ? (
        <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm">
          {offersResult.error}
        </div>
      ) : null}

      {offersLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Загружаем объявления с ЦИАН...</p>
      ) : matches.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          Объявления не загружены. Проверьте подключение кабинета ЦИАН.
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Объявлений на ЦИАН: {matches.length} · выбрано связок: {selectedCount}
            </p>
            <Button onClick={save} disabled={saving}>
              Сохранить связки
            </Button>
          </div>

          <ul className="mt-4 space-y-3">
            {matches.map((m) => {
              const chosen = choices[m.offer.externalId] ?? "";
              const Icon =
                m.confidence === "exact"
                  ? CheckCircle2
                  : m.confidence === "likely"
                    ? HelpCircle
                    : XCircle;
              const tone =
                m.confidence === "exact"
                  ? "text-emerald-600"
                  : m.confidence === "likely"
                    ? "text-amber-600"
                    : "text-muted-foreground";
              return (
                <li
                  key={m.offer.externalId}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-[240px] flex-1 items-start gap-3">
                      {m.offer.photo ? (
                        <img
                          src={m.offer.photo}
                          alt=""
                          className="size-16 shrink-0 rounded-lg object-cover"
                          loading="lazy"
                        />
                      ) : null}
                      <div>
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <Icon className={"size-4 " + tone} />
                          {m.alreadyLinked ? "Уже связано" : CONFIDENCE_LABEL[m.confidence]}
                        </p>
                        <p className="mt-2 text-[15px] font-semibold leading-snug">
                          {m.offer.title || m.offer.address || `Объявление ${m.offer.externalId}`}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{m.offer.address}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[
                          m.offer.complexName,
                          m.offer.rooms != null ? `${m.offer.rooms} комн.` : null,
                          m.offer.area != null ? `${m.offer.area} м²` : null,
                          m.offer.price != null ? formatMoney(m.offer.price) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                        <a
                          href={m.offer.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs text-primary hover:underline"
                        >
                          Открыть на ЦИАН
                        </a>
                      </div>
                    </div>

                    <div className="min-w-[260px]">
                      <label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Объект в RM OS
                      </label>
                      <select
                        value={chosen}
                        disabled={m.alreadyLinked}
                        onChange={(e) =>
                          setChoices((prev) => ({
                            ...prev,
                            [m.offer.externalId]: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                      >
                        <option value="">Не связывать</option>
                        {m.candidates.map((c) => {
                          const p = propertyById.get(c.propertyId);
                          if (!p) return null;
                          return (
                            <option key={c.propertyId} value={c.propertyId}>
                              {internalTitle(p)} — совпадение {c.score}%
                            </option>
                          );
                        })}
                        {activeProperties
                          .filter((p) => !m.candidates.some((c) => c.propertyId === p.id))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {internalTitle(p)}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {unmatchedProperties.length > 0 ? (
            <section className="mt-8 rounded-xl border border-dashed border-border p-5">
              <h2 className="text-sm font-semibold">Есть в RM OS, но не найдено на ЦИАН</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Этих объектов пока нет на ЦИАН. Разместите их в кабинете ЦИАН, затем вернитесь
                сюда, обновите список и свяжите.
              </p>
              <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                {unmatchedProperties.slice(0, 30).map((p) => (
                  <li key={p.id} className="text-muted-foreground">
                    {internalTitle(p)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Настройки автопубликации: ссылка на XML-фид и переключатель автозагрузки. */
function FeedSettings({
  label,
  cabinetHint,
  info,
  onChanged,
  toggleAuto,
}: {
  label: string;
  cabinetHint: string;
  info: {
    autoPublish: boolean;
    inFeed: number;
    withErrors: number;
    feedPath: string;
    issues?: { label: string; fields: string[]; blocking: boolean }[];
  };
  onChanged: () => void;
  toggleAuto: (enabled: boolean) => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const feedUrl = typeof window === "undefined" ? info.feedPath : window.location.origin + info.feedPath;

  async function copy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success("Ссылка на фид скопирована");
    } catch {
      toast.error("Не удалось скопировать ссылку");
    }
  }

  async function toggle() {
    setSaving(true);
    try {
      await toggleAuto(!info.autoPublish);
      toast.success(info.autoPublish ? "Автопубликация выключена" : "Автопубликация включена");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось изменить настройку");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">Автопубликация {label} через XML-фид</h2>
      <p className="mt-1 text-sm text-muted-foreground">{cabinetHint}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-[220px] flex-1 truncate rounded-md border border-input bg-muted/50 px-3 py-2 text-xs">
          {feedUrl}
        </code>
        <Button size="sm" variant="outline" onClick={copy}>
          <Copy className="size-3.5" />
          Скопировать
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          В фиде сейчас: {info.inFeed}
          {info.withErrors > 0 ? ` · не хватает данных у ${info.withErrors}` : ""}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={info.autoPublish}
            disabled={saving}
            onChange={toggle}
            className="size-4 accent-primary"
          />
          Публиковать новые объекты автоматически
        </label>
      </div>
      {info.issues && info.issues.length > 0 ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium">Что нужно заполнить вручную</p>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {info.issues.map((issue) => (
              <li key={issue.label}>
                <span className="text-foreground">{issue.label}</span>: {issue.fields.join(", ")}
                {issue.blocking ? " — объект не попадает в выгрузку" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** Проверка фида и статистика через партнёрское API Яндекс Недвижимости. */
function YandexApiPanel() {
  const checkFeed = useServerFn(getYandexFeedStatus);
  const loadStats = useServerFn(syncYandexStats);
  const [busy, setBusy] = useState<"feed" | "stats" | null>(null);
  const [status, setStatus] = useState<YandexFeedStatus | null>(null);
  const [stats, setStats] = useState<YandexStatsResult | null>(null);

  async function runFeed() {
    setBusy("feed");
    try {
      setStatus(await checkFeed({}));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось получить статус фида");
    } finally {
      setBusy(null);
    }
  }

  async function runStats() {
    setBusy("stats");
    try {
      const res = await loadStats({ data: { days: 30 } });
      setStats(res);
      if (res.configured) toast.success("Статистика обновлена");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось получить статистику");
    } finally {
      setBusy(null);
    }
  }

  const notConfigured =
    (status && !status.configured) || (stats && !stats.configured);

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">Проверка объявлений на Яндекс Недвижимости</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Показывает, какие объявления площадка приняла, а какие отклонила и почему, и подтягивает
        просмотры со звонками за последние 30 дней.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={runFeed}>
          <RefreshCw className={busy === "feed" ? "size-3.5 animate-spin" : "size-3.5"} />
          Проверить фид
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={runStats}>
          <RefreshCw className={busy === "stats" ? "size-3.5 animate-spin" : "size-3.5"} />
          Обновить статистику
        </Button>
      </div>

      {notConfigured ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          Пока не хватает данных от Яндекса: нужен clientID и ключ доступа. Как их пришлют —
          сохраним, и обе кнопки заработают сразу.
        </p>
      ) : null}

      {status?.configured ? (
        <div className="mt-4 text-sm">
          <p className="text-muted-foreground">
            Всего объявлений: {status.total} · принято: {status.accepted} · отклонено:{" "}
            {status.rejected}
          </p>
          {status.problems.length > 0 ? (
            <ul className="mt-2 grid gap-1">
              {status.problems.map((p) => (
                <li key={p.externalId} className="flex items-start gap-2">
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                  <span>
                    <span className="font-medium">{p.externalId}</span> — {p.message}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              Ошибок нет
            </p>
          )}
        </div>
      ) : null}

      {stats?.configured ? (
        <div className="mt-4 text-sm text-muted-foreground">
          Период {stats.from} — {stats.to}: объявлений {stats.offers.length}, просмотров{" "}
          {stats.offers.reduce((s, o) => s + o.views, 0)}, звонков{" "}
          {stats.offers.reduce((s, o) => s + o.calls, 0)}
        </div>
      ) : null}
    </section>
  );
}
