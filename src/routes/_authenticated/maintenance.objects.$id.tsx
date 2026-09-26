import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, Circle, ImageIcon, Pencil } from "lucide-react";
import { toast } from "sonner";

import { MaintenanceTabs } from "@/components/MaintenanceTabs";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchMaintenanceServiceItems,
  fetchPropertyServiceItemIds,
  setPropertyServiceItems,
} from "@/lib/maintenance";
import {
  formatArea,
  formatLandArea,
  formatMoney,
  fetchProperty,
  internalTitle,
  roomsLabel,
  signedUrls,
  typeLabel,
  updateProperty,
} from "@/lib/properties";
import { formatDateRu, parseISODate } from "@/lib/rentals";
import {
  fetchPropertyTasks,
  fetchTaskTypes,
  formatTaskTimeRange,
  type StaffTask,
} from "@/lib/tasks";

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

const BOILER_NONE = "__none__";

function MaintenanceObjectCardPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: property, isLoading, error } = useQuery({
    queryKey: ["properties", id],
    queryFn: () => fetchProperty(id),
  });
  const { data: catalog = [] } = useQuery({
    queryKey: ["maintenance-services"],
    queryFn: () => fetchMaintenanceServiceItems({ activeOnly: false }),
  });
  const serviceNameById = useMemo(
    () => new Map(catalog.map((item) => [item.id, item.name])),
    [catalog],
  );
  const activeCatalog = useMemo(() => catalog.filter((item) => item.active), [catalog]);
  const { data: linkedIds = [] } = useQuery({
    queryKey: ["property-maintenance-services", id],
    queryFn: () => fetchPropertyServiceItemIds(id),
  });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["property-tasks", id],
    queryFn: () => fetchPropertyTasks(id),
  });
  const { data: types = [] } = useQuery({ queryKey: ["task-types"], queryFn: fetchTaskTypes });
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  const [boilerKind, setBoilerKind] = useState("");
  const [hasGenerator, setHasGenerator] = useState(false);
  const [acCount, setAcCount] = useState("");
  const [poolLength, setPoolLength] = useState("");
  const [poolWidth, setPoolWidth] = useState("");
  const [poolHeated, setPoolHeated] = useState(false);
  const [gardenNotes, setGardenNotes] = useState("");

  useEffect(() => {
    if (!property) return;
    setBoilerKind(property.boiler_kind || "");
    setHasGenerator(property.has_generator);
    setAcCount(property.air_conditioners_count != null ? String(property.air_conditioners_count) : "");
    setPoolLength(property.pool_length_m != null ? String(property.pool_length_m) : "");
    setPoolWidth(property.pool_width_m != null ? String(property.pool_width_m) : "");
    setPoolHeated(property.pool_heated);
    setGardenNotes(property.garden_notes ?? "");
  }, [property]);

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

  const saveDetails = useMutation({
    mutationFn: () =>
      updateProperty(id, {
        boiler_kind: boilerKind,
        has_generator: hasGenerator,
        air_conditioners_count: acCount.trim() === "" ? null : Number(acCount),
        pool_length_m: poolLength.trim() === "" ? null : Number(poolLength),
        pool_width_m: poolWidth.trim() === "" ? null : Number(poolWidth),
        pool_heated: poolHeated,
        garden_notes: gardenNotes.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["properties"] });
      void queryClient.invalidateQueries({ queryKey: ["properties", id] });
      toast.success("Данные обслуживания сохранены");
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
  const openTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");

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
        <Button asChild>
          <Link to="/maintenance/objects/$id/edit" params={{ id }}>
            <Pencil className="size-4" />
            Редактировать
          </Link>
        </Button>
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
        <h2 className="text-base font-semibold">Основная информация</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <InfoRow label="Внутреннее название" value={property.internal_name || "—"} />
          <InfoRow label="Публичное название" value={property.title || "—"} />
          <InfoRow label="Тип" value={typeLabel(property.type)} />
          <InfoRow label="Адрес" value={property.address || "—"} />
          <InfoRow label="Планировка" value={roomsLabel(property.rooms)} />
          <InfoRow label="Санузлы" value={String(property.bathrooms)} />
          <InfoRow label="Площадь" value={formatArea(property.area) || "—"} />
          <InfoRow label="Участок" value={formatLandArea(property.land_area) || "—"} />
          <InfoRow
            label="Цена"
            value={property.price_month != null ? formatMoney(property.price_month) : "—"}
          />
          <InfoRow label="Этажность" value={property.total_floors != null ? String(property.total_floors) : "—"} />
        </dl>
        {property.description ? (
          <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{property.description}</p>
        ) : null}
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Инженерные системы</h2>
          <Button
            type="button"
            size="sm"
            disabled={saveDetails.isPending}
            onClick={() => saveDetails.mutate()}
          >
            Сохранить
          </Button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Котёл</Label>
            <Select
              value={boilerKind || BOILER_NONE}
              onValueChange={(v) => setBoilerKind(v === BOILER_NONE ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Не указан" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BOILER_NONE}>Не указан</SelectItem>
                <SelectItem value="gas">Газовый</SelectItem>
                <SelectItem value="electric">Электро</SelectItem>
                <SelectItem value="none">Нет</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Кондиционеры, шт.</Label>
            <Input
              type="number"
              min={0}
              value={acCount}
              onChange={(e) => setAcCount(e.target.value)}
              placeholder="0"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-3 sm:col-span-2">
            <Checkbox checked={hasGenerator} onCheckedChange={(v) => setHasGenerator(Boolean(v))} />
            <span className="text-sm font-medium">Генератор есть</span>
          </label>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Бассейн</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Длина, м</Label>
            <Input
              type="number"
              min={0}
              step="0.1"
              value={poolLength}
              onChange={(e) => setPoolLength(e.target.value)}
              placeholder="—"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ширина, м</Label>
            <Input
              type="number"
              min={0}
              step="0.1"
              value={poolWidth}
              onChange={(e) => setPoolWidth(e.target.value)}
              placeholder="—"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-3 sm:col-span-2">
            <Checkbox checked={poolHeated} onCheckedChange={(v) => setPoolHeated(Boolean(v))} />
            <span className="text-sm font-medium">Подогрев есть</span>
          </label>
        </div>
        <Button
          type="button"
          className="mt-4"
          size="sm"
          disabled={saveDetails.isPending}
          onClick={() => saveDetails.mutate()}
        >
          Сохранить бассейн и сад
        </Button>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Садовые насаждения</h2>
        <Textarea
          className="mt-4 min-h-[100px]"
          value={gardenNotes}
          onChange={(e) => setGardenNotes(e.target.value)}
          placeholder="Деревья, кустарники, газон…"
        />
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Услуги обслуживания</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Отметьте пункты из справочника. Список правится во вкладке «Услуги».
        </p>
        <div className="mt-4 space-y-2">
          {activeCatalog.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Справочник пуст.{" "}
              <Link to="/maintenance/services" className="text-primary underline-offset-2 hover:underline">
                Добавить услуги
              </Link>
            </p>
          )}
          {activeCatalog.map((item) => {
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

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">История по задачам</h2>
          <Button asChild variant="outline" size="sm">
            <Link to="/maintenance/tasks">Все задачи</Link>
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Открытые: {openTasks.length} · Выполненные: {doneTasks.length}
        </p>
        {tasksLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Загрузка задач…</p>
        ) : tasks.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">По этому объекту задач ещё нет.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {tasks.map((task) => (
              <TaskHistoryRow
                key={task.id}
                task={task}
                typeName={typeById.get(task.task_type_id ?? "")?.name}
                serviceName={
                  task.maintenance_service_item_id
                    ? serviceNameById.get(task.maintenance_service_item_id)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function TaskHistoryRow({
  task,
  typeName,
  serviceName,
}: {
  task: StaffTask;
  typeName?: string;
  serviceName?: string;
}) {
  const done = task.status === "done";
  const time = formatTaskTimeRange(task.due_start, task.due_end);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
      {done ? (
        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{task.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {done ? "Выполнена" : "Не выполнена"}
          {typeName ? ` · ${typeName}` : ""}
          {serviceName ? ` · ${serviceName}` : ""}
          {task.due_date
            ? ` · ${formatDateRu(parseISODate(task.due_date))}${time ? ` ${time}` : ""}`
            : " · без срока"}
        </p>
      </div>
    </div>
  );
}
