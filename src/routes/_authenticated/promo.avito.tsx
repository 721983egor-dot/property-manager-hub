import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchAvitoMatchBoard, saveAvitoLink } from "@/lib/avito.functions";
import { formatMoney } from "@/lib/properties";

export const Route = createFileRoute("/_authenticated/promo/avito")({
  head: () => ({
    meta: [
      { title: "Сопоставление Авито — RM OS" },
      {
        name: "description",
        content: "Ручная привязка объявлений Авито к объектам RM OS.",
      },
    ],
  }),
  component: () => (
    <AdminOnly>
      <AvitoMatchPage />
    </AdminOnly>
  ),
});

function AvitoMatchPage() {
  const qc = useQueryClient();
  const loadBoard = useServerFn(fetchAvitoMatchBoard);
  const saveLink = useServerFn(saveAvitoLink);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["avito-match-board"],
    queryFn: () => loadBoard({}),
  });

  useEffect(() => {
    if (!data?.ads) return;
    setChoices((prev) => {
      const next = { ...prev };
      for (const ad of data.ads) {
        if (next[ad.id] === undefined) next[ad.id] = ad.propertyId;
      }
      return next;
    });
  }, [data]);

  const ads = data?.ads ?? [];
  const properties = data?.properties ?? [];
  const linked = ads.filter((ad) => ad.propertyId).length;

  async function save(itemId: string, url: string) {
    setSavingId(itemId);
    try {
      await saveLink({
        data: { itemId, propertyId: choices[itemId] ?? "", url },
      });
      await qc.invalidateQueries({ queryKey: ["avito-match-board"] });
      await qc.invalidateQueries({ queryKey: ["property-listings"] });
      toast.success(choices[itemId] ? "Связка сохранена" : "Связка снята");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить связку");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link
        to="/promo"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Публикации
      </Link>
      <header className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Сопоставление Авито</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Выберите объект RM OS рядом с объявлением и нажмите «Сохранить». Статистика и чаты
          начнут относиться к этому объекту. Уже связанные можно поменять или снять.
        </p>
      </header>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Загружаю объявления Авито…</p>
      ) : data?.error ? (
        <p className="mt-8 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {data.error}
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted-foreground">
            На Авито {ads.length}, уже связано {linked}.
            {isFetching ? " Обновляю…" : ""}
          </p>
          <ul className="mt-4 space-y-3">
            {ads.map((ad) => {
              const chosen = choices[ad.id] ?? "";
              const dirty = chosen !== ad.propertyId;
              return (
                <li key={ad.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {ad.propertyId ? "Связано" : "Не связано"}
                      </p>
                      <p className="mt-1 text-[15px] font-semibold leading-snug">
                        {ad.title || `Объявление ${ad.id}`}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{ad.address}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {ad.price != null ? formatMoney(ad.price) : "Цена не указана"}
                      </p>
                      {ad.url ? (
                        <a
                          href={ad.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs text-primary hover:underline"
                        >
                          Открыть на Авито
                        </a>
                      ) : null}
                    </div>
                    <div className="w-full lg:w-[340px]">
                      <label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Объект в RM OS
                      </label>
                      <select
                        value={chosen}
                        onChange={(e) =>
                          setChoices((prev) => ({ ...prev, [ad.id]: e.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Не связывать</option>
                        {properties.map((property) => (
                          <option key={property.id} value={property.id}>
                            {property.refId ? `${property.refId} · ` : ""}
                            {property.title}
                          </option>
                        ))}
                      </select>
                      <Button
                        className="mt-2"
                        size="sm"
                        disabled={!dirty || savingId === ad.id}
                        onClick={() => save(ad.id, ad.url)}
                      >
                        {savingId === ad.id ? "Сохраняю…" : "Сохранить"}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {ads.length === 0 ? (
            <button
              type="button"
              className="mt-4 text-sm text-primary hover:underline"
              onClick={() => refetch()}
            >
              Обновить список
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
