import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Download, Globe, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { missingCianFields } from "@/lib/cian";
import { publishToCian, unpublishFromCian } from "@/lib/cian.functions";
import { PLATFORMS, fetchListings, setSitePublished } from "@/lib/listings";
import {
  fetchProperties,
  formatMoney,
  internalTitle,
  signedUrls,
  type Property,
} from "@/lib/properties";


export const Route = createFileRoute("/promo/")({
  head: () => ({
    meta: [
      { title: "Публикация и реклама — RM OS" },
      {
        name: "description",
        content:
          "Управление публикацией объектов на сайте Residence More, Авито и ЦИАН, статистика просмотров и обращений.",
      },
      { property: "og:title", content: "Публикация и реклама — RM OS" },
      {
        property: "og:description",
        content: "Где опубликован каждый объект и сколько его смотрят.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PromoListPage,
});

type Filter = "all" | "published" | "unpublished";

function PromoListPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });
  const { data: listings = [] } = useQuery({
    queryKey: ["property-listings"],
    queryFn: fetchListings,
  });

  const active = properties.filter((p) => p.status !== "archived");

  const paths = active.map((p) => p.photos?.[0]?.path).filter(Boolean) as string[];
  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", paths.slice().sort().join("|")],
    queryFn: () => signedUrls(paths),
    enabled: paths.length > 0,
  });

  const listingMap = useMemo(() => {
    const map = new Map<string, Record<string, { published: boolean; at: string | null }>>();
    for (const l of listings) {
      const entry = map.get(l.property_id) ?? {};
      entry[l.platform] = { published: l.published, at: l.published_at };
      map.set(l.property_id, entry);
    }
    return map;
  }, [listings]);

  const filtered = active.filter((p) => {
    if (filter === "published" && !p.published) return false;
    if (filter === "unpublished" && p.published) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      internalTitle(p).toLowerCase().includes(q) ||
      p.title.toLowerCase().includes(q) ||
      p.complex_name.toLowerCase().includes(q)
    );
  });

  async function togglePublish(p: Property) {
    setBusy(p.id + "site");
    try {
      await setSitePublished(p.id, !p.published);
      await qc.invalidateQueries({ queryKey: ["properties"] });
      await qc.invalidateQueries({ queryKey: ["property-listings"] });
      toast.success(p.published ? "Снято с публикации" : "Опубликовано на сайте");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось изменить публикацию");
    } finally {
      setBusy(null);
    }
  }

  async function toggleCian(p: Property, published: boolean) {
    if (!published) {
      const missing = missingCianFields(p);
      if (missing.length > 0) {
        toast.error(`Заполните для ЦИАН: ${missing.join(", ")}`);
        return;
      }
    }
    setBusy(p.id + "cian");
    try {
      if (published) {
        await removeFromCian({ data: { propertyId: p.id } });
        toast.success("Объявление снято с ЦИАН");
      } else {
        await sendToCian({ data: { propertyId: p.id } });
        toast.success("Объект отправлен на ЦИАН");
      }
      await qc.invalidateQueries({ queryKey: ["property-listings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ЦИАН не принял объявление");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Публикация и реклама</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Где опубликован каждый объект и сколько его смотрят.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/promo/import">
            <Download className="size-4" />
            Загрузить объявления с ЦИАН
          </Link>
        </Button>
      </header>


      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или ЖК"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {(
            [
              { key: "all", label: "Все" },
              { key: "published", label: "На сайте" },
              { key: "unpublished", label: "Не опубликованы" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                (filter === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Загрузка...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Объекты не найдены</p>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const photo = p.photos?.[0]?.path;
            const entry = listingMap.get(p.id) ?? {};
            return (
              <article
                key={p.id}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
              >
                <div className="aspect-[4/3] bg-muted">
                  {photo && urls[photo] ? (
                    <img
                      src={urls[photo]}
                      alt={p.title}
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
                  <h2 className="text-[15px] font-semibold leading-snug">{internalTitle(p)}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {p.complex_name || "Без комплекса"}
                  </p>
                  <p className="mt-1 text-sm font-medium">{formatMoney(p.price_month)}</p>

                  <ul className="mt-4 space-y-2">
                    {PLATFORMS.map((platform) => {
                      const state =
                        platform.value === "site"
                          ? { published: p.published, at: entry["site"]?.at ?? null }
                          : entry[platform.value] ?? { published: false, at: null };
                      const isCian = platform.value === "cian";
                      return (
                        <li
                          key={platform.value}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={
                                "size-2 rounded-full " +
                                (state.published ? "bg-emerald-500" : "bg-muted-foreground/40")
                              }
                            />
                            {platform.label}
                            {state.published && state.at ? (
                              <span className="text-xs text-muted-foreground">
                                с {new Date(state.at).toLocaleDateString("ru-RU")}
                              </span>
                            ) : null}
                          </span>
                          {platform.available ? (
                            <Button
                              size="sm"
                              variant={state.published ? "outline" : "default"}
                              disabled={busy === p.id + platform.value}
                              onClick={() =>
                                isCian ? toggleCian(p, state.published) : togglePublish(p)
                              }
                            >
                              <Globe className="size-3.5" />
                              {state.published ? "Снять" : "Опубликовать"}
                            </Button>
                          ) : (
                            <span className="rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
                              Скоро
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>


                  <Button asChild variant="outline" className="mt-4 w-full">
                    <Link to="/promo/$id" params={{ id: p.id }}>
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
