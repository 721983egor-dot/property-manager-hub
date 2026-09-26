import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, Pencil, Plus, Search } from "lucide-react";

import { MaintenanceTabs } from "@/components/MaintenanceTabs";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { filterMaintenanceProperties } from "@/lib/maintenance";
import {
  fetchProperties,
  formatMoney,
  internalTitle,
  signedUrls,
  typeLabel,
} from "@/lib/properties";

export const Route = createFileRoute("/_authenticated/maintenance/objects/")({
  head: () => ({
    meta: [
      { title: "Обслуживание — объекты — RM OS" },
      {
        name: "description",
        content: "Дома и виллы на управлении: услуги обслуживания без автопубликации на сайт.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MaintenanceObjectsPage,
});

function MaintenanceObjectsPage() {
  const [search, setSearch] = useState("");
  const [showArchive, setShowArchive] = useState(false);

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });

  const rows = useMemo(() => {
    const list = filterMaintenanceProperties(properties, { includeArchived: showArchive });
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) =>
      `${p.title} ${p.internal_name} ${p.address}`.toLowerCase().includes(q),
    );
  }, [properties, search, showArchive]);

  const photoPaths = rows.map((p) => p.photos[0]?.path).filter(Boolean) as string[];
  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", photoPaths.slice().sort().join("|")],
    queryFn: () => signedUrls(photoPaths),
    enabled: photoPaths.length > 0,
  });

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Обслуживание</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Дома и виллы на управлении. В аренду — только с явной галочкой в карточке.
          </p>
        </div>
        <Button asChild>
          <Link to="/maintenance/objects/new">
            <Plus className="size-4" />
            Добавить объект
          </Link>
        </Button>
      </header>

      <MaintenanceTabs active="objects" />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или адресу"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant={showArchive ? "secondary" : "outline"}
          onClick={() => setShowArchive((v) => !v)}
        >
          {showArchive ? "Скрыть архив" : "Показать архив"}
        </Button>
      </div>

      <div className="mt-6 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Пока нет домов и вилл на управлении. Добавьте объект или переведите дом в статус
            «Управление объектом».
          </p>
        )}
        {rows.map((property) => {
          const photo = property.photos[0]?.path;
          const thumb = photo ? urls[photo] : null;
          return (
            <Link
              key={property.id}
              to="/maintenance/objects/$id"
              params={{ id: property.id }}
              className="flex items-center gap-4 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:bg-muted/40 sm:px-4"
            >
              <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                {thumb ? (
                  <img src={thumb} alt="" className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{internalTitle(property)}</p>
                  <StatusBadge status={property.status} />
                  {property.for_rent ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      В аренду
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Только обслуживание
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {typeLabel(property.type)}
                  {property.address ? ` · ${property.address}` : ""}
                  {property.price_month != null ? ` · ${formatMoney(property.price_month)}` : ""}
                </p>
              </div>
              <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                <Pencil className="size-3.5" />
                Открыть
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
