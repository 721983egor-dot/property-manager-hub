import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ImageIcon, Pencil } from "lucide-react";
import { toast } from "sonner";

import { MaintenanceTabs } from "@/components/MaintenanceTabs";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  fetchMaintenanceServiceItems,
  fetchPropertyServiceItemIds,
  setPropertyServiceItems,
} from "@/lib/maintenance";
import {
  fetchProperty,
  formatMoney,
  internalTitle,
  signedUrls,
  typeLabel,
  updateProperty,
} from "@/lib/properties";

export const Route = createFileRoute("/_authenticated/maintenance/objects/$id")({
  head: () => ({
    meta: [
      { title: "Карточка обслуживания — RM OS" },
      { name: "description", content: "Карточка дома/виллы в блоке обслуживания." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MaintenanceObjectCardPage,
});

function MaintenanceObjectCardPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: property, isLoading, error } = useQuery({
    queryKey: ["properties", id],
    queryFn: () => fetchProperty(id),
  });
  const { data: catalog = [] } = useQuery({
    queryKey: ["maintenance-services"],
    queryFn: () => fetchMaintenanceServiceItems({ activeOnly: true }),
  });
  const { data: linkedIds = [] } = useQuery({
    queryKey: ["property-maintenance-services", id],
    queryFn: () => fetchPropertyServiceItemIds(id),
  });

  const photoPaths = (property?.photos ?? []).map((p) => p.path);
  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", photoPaths.slice().sort().join("|")],
    queryFn: () => signedUrls(photoPaths),
    enabled: photoPaths.length > 0,
  });

  const saveServices = useMutation({
    mutationFn: (ids: string[]) => setPropertyServiceItems(id, ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["property-maintenance-services", id] });
      toast.success("Услуги обновлены");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить услуги"),
  });

  const toggleForRent = useMutation({
    mutationFn: (for_rent: boolean) => updateProperty(id, { for_rent }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["properties"] });
      void queryClient.invalidateQueries({ queryKey: ["properties", id] });
      toast.success("Настройка аренды сохранена");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Загрузка…</div>
    );
  }
  if (error || !property) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-destructive">
        {error instanceof Error ? error.message : "Объект не найден"}
      </div>
    );
  }

  const cover = property.photos[0]?.path ? urls[property.photos[0].path] : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <Link
        to="/maintenance/objects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Объекты обслуживания
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {internalTitle(property)}
            </h1>
            <StatusBadge status={property.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {typeLabel(property.type)}
            {property.address ? ` · ${property.address}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/objects/$id" params={{ id }}>
              Полная карточка
            </Link>
          </Button>
          <Button asChild>
            <Link to="/maintenance/objects/$id/edit" params={{ id }}>
              <Pencil className="size-4" />
              Редактировать
            </Link>
          </Button>
        </div>
      </header>

      <MaintenanceTabs active="objects" />

      <div className="mt-6 grid gap-4 sm:grid-cols-[200px_1fr]">
        <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border border-border bg-muted">
          {cover ? (
            <img src={cover} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-8 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-3 text-sm">
          <p>
            <span className="text-muted-foreground">Аренда: </span>
            {property.price_month != null ? formatMoney(property.price_month) : "—"}
          </p>
          <p>
            <span className="text-muted-foreground">На сайте: </span>
            {property.published ? "опубликован" : "не опубликован"}
          </p>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4">
            <Checkbox
              checked={property.for_rent}
              onCheckedChange={(v) => toggleForRent.mutate(Boolean(v))}
              disabled={toggleForRent.isPending}
            />
            <span>
              <span className="block font-medium">В аренду</span>
              <span className="mt-0.5 block text-muted-foreground">
                Показывать в общем календаре аренды. Без галочки — только обслуживание.
              </span>
            </span>
          </label>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Услуги обслуживания</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Отметьте пункты из справочника. Список правится во вкладке «Услуги».
        </p>
        <div className="mt-4 space-y-2">
          {catalog.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Справочник пуст.{" "}
              <Link to="/maintenance/services" className="text-primary underline-offset-2 hover:underline">
                Добавить услуги
              </Link>
            </p>
          )}
          {catalog.map((item) => {
            const checked = linkedIds.includes(item.id);
            return (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-muted/40"
              >
                <Checkbox
                  checked={checked}
                  disabled={saveServices.isPending}
                  onCheckedChange={(v) => {
                    const next = v
                      ? [...linkedIds, item.id]
                      : linkedIds.filter((x) => x !== item.id);
                    saveServices.mutate(next);
                  }}
                />
                <span className="text-sm font-medium">{item.name}</span>
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}
