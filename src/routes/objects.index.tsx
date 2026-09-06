import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, ImageIcon, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionTabs } from "@/components/SectionTabs";
import {
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  ROOM_OPTIONS,
  SUMMER_SEASON_LABEL,
  deleteProperty,
  fetchProperties,
  floorLabel,
  formatMoney,
  internalTitle,
  roomsLabel,
  setPropertyStatus,
  signedUrls,
  typeLabel,
  type Property,
  type PropertyStatus,
} from "@/lib/properties";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Объекты — RM OS" },
      {
        name: "description",
        content:
          "Реестр объектов долгосрочной аренды: поиск, фильтры по типу, комплексу и статусу, архив и редактирование.",
      },
      { property: "og:title", content: "Объекты — RM OS" },
      {
        property: "og:description",
        content: "Внутренняя система управления объектами долгосрочной аренды.",
      },
    ],
  }),
  component: ObjectsPage,
});

const ALL = "__all__";
const TABS = [
  { key: "all", label: "Все объекты" },
  { key: "active", label: "Активные" },
  { key: "archive", label: "Архив" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function ObjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>(ALL);
  const [complex, setComplex] = useState<string>(ALL);
  const [rooms, setRooms] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [sort, setSort] = useState<string>(ALL);

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });

  const complexes = useMemo(
    () =>
      Array.from(new Set(properties.map((p) => p.complex_name).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "ru"),
      ),
    [properties],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = properties.filter((p) => {
      // Архивные объекты скрыты, пока их не выбрали в фильтре статуса или во вкладке «Архив».
      if (p.status === "archived" && tab !== "archive" && status !== "archived") return false;
      if (tab === "archive" && p.status !== "archived") return false;
      if (q && !`${p.title} ${p.internal_name} ${p.complex_name}`.toLowerCase().includes(q))
        return false;
      if (type !== ALL && p.type !== type) return false;
      if (complex !== ALL && p.complex_name !== complex) return false;
      if (rooms !== ALL && p.rooms !== Number(rooms)) return false;
      if (status !== ALL && p.status !== status) return false;
      return true;
    });

    if (sort === "price_asc" || sort === "price_desc") {
      const dir = sort === "price_asc" ? 1 : -1;
      rows.sort((a, b) => {
        const av = a.price_month;
        const bv = b.price_month;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * dir;
      });
    }

    return rows;
  }, [properties, tab, search, type, complex, rooms, status, sort]);

  const photoPaths = filtered.map((p) => p.photos[0]?.path).filter(Boolean) as string[];
  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", photoPaths.slice().sort().join("|")],
    queryFn: () => signedUrls(photoPaths),
    enabled: photoPaths.length > 0,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: PropertyStatus }) =>
      setPropertyStatus(id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Статус объекта обновлён");
    },
    onError: () => toast.error("Не удалось изменить статус объекта"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProperty(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Объект удалён");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Не удалось удалить объект"),
  });

  const hasFilters =
    search !== "" ||
    type !== ALL ||
    complex !== ALL ||
    rooms !== ALL ||
    status !== ALL ||
    sort !== ALL;

  const resetFilters = () => {
    setSearch("");
    setType(ALL);
    setComplex(ALL);
    setRooms(ALL);
    setStatus(ALL);
    setSort(ALL);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10">
      <header className="flex items-start justify-between gap-6">
        <h1 className="text-3xl font-semibold tracking-tight">Объекты</h1>
        <Button size="lg" onClick={() => navigate({ to: "/objects/new" })}>
          <Plus className="size-4" />
          Добавить объект
        </Button>
      </header>

      <SectionTabs active="objects" />

      <div className="mt-6 border-b border-border">
        <div className="flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px border-b-2 pb-3 text-sm font-medium transition-colors",
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по объектам и комплексам..."
            className="h-10 pl-9"
          />
        </div>

        <FilterSelect
          value={type}
          onChange={setType}
          placeholder="Тип объекта"
          options={PROPERTY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
        />
        <FilterSelect
          value={complex}
          onChange={setComplex}
          placeholder="Комплекс"
          options={complexes.map((c) => ({ value: c, label: c }))}
        />
        <FilterSelect
          value={rooms}
          onChange={setRooms}
          placeholder="Планировка"
          options={ROOM_OPTIONS.map((r) => ({ value: String(r), label: roomsLabel(r) }))}
        />
        <FilterSelect
          value={status}
          onChange={setStatus}
          placeholder="Статус"
          options={PROPERTY_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
        />
        <FilterSelect
          value={sort}
          onChange={setSort}
          placeholder="Сортировка"
          options={[
            { value: "price_asc", label: "Сначала дешевле" },
            { value: "price_desc", label: "Сначала дороже" },
          ]}
        />


        {hasFilters ? (
          <Button variant="ghost" onClick={resetFilters} className="h-10 text-muted-foreground">
            Сбросить
          </Button>
        ) : null}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Объект</th>
              <th className="px-4 py-3 font-medium">Тип</th>
              <th className="px-4 py-3 font-medium">Комплекс</th>
              <th className="px-4 py-3 font-medium">Этаж</th>
              <th className="px-4 py-3 font-medium">Планировка</th>
              <th className="px-4 py-3 font-medium">Санузлы</th>
              <th className="px-4 py-3 font-medium">Цена в месяц</th>
              <th className="px-4 py-3 font-medium">Депозит</th>
              <th className="px-4 py-3 font-medium">Комиссия</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 text-right font-medium">Действия</th>

            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={11} className="px-5 py-12 text-center text-muted-foreground">
                  Загрузка...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-5 py-12 text-center text-muted-foreground">
                  Объекты не найдены
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <Row
                  key={p.id}
                  property={p}
                  photoUrl={p.photos[0]?.path ? urls[p.photos[0].path] : undefined}
                  onStatus={(next) => statusMutation.mutate({ id: p.id, next })}
                  onDelete={() => {
                    if (
                      window.confirm(
                        `Удалить объект «${internalTitle(p)}»? Это действие нельзя отменить.`,
                      )
                    ) {
                      deleteMutation.mutate(p.id);
                    }
                  }}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">Всего объектов: {filtered.length}</p>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-[180px] shrink-0">
        <SelectValue placeholder={placeholder}>
          {value === ALL ? placeholder : (options.find((o) => o.value === value)?.label ?? value)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}: все</SelectItem>

        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Row({
  property,
  photoUrl,
  onStatus,
  onDelete,
}: {
  property: Property;
  photoUrl?: string | undefined;
  onStatus: (next: PropertyStatus) => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-b border-border last:border-0 transition-colors hover:bg-muted/40">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={property.title}
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <ImageIcon className="size-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <Link
              to="/objects/$id"
              params={{ id: property.id }}
              className="block truncate font-medium hover:text-primary"
            >
              {internalTitle(property)}
            </Link>
            <div className="mt-0.5 text-xs text-muted-foreground">ID: {property.ref_id}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-muted-foreground">{typeLabel(property.type)}</td>
      <td className="px-4 py-4 text-muted-foreground">{property.complex_name || "—"}</td>
      <td className="px-4 py-4 text-muted-foreground">{floorLabel(property)}</td>
      <td className="px-4 py-4 text-muted-foreground">{roomsLabel(property.rooms)}</td>
      <td className="px-4 py-4 text-muted-foreground">{property.bathrooms}</td>
      <td className="px-4 py-4">
        <div className="font-medium text-foreground">{formatMoney(property.price_month)}</div>
        {property.seasonal_pricing && property.summer_price_month != null ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            Лето ({SUMMER_SEASON_LABEL}): {formatMoney(property.summer_price_month)}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-4 text-muted-foreground">{formatMoney(property.deposit)}</td>
      <td className="px-4 py-4 text-muted-foreground">{formatMoney(property.commission)}</td>
      <td className="px-4 py-4">
        <StatusBadge status={property.status} />
      </td>

      <td className="px-4 py-4">
        <div className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Действия
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <Link to="/objects/$id/edit" params={{ id: property.id }}>
                  <Pencil className="size-4" />
                  Редактировать
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Статус
              </DropdownMenuLabel>
              {PROPERTY_STATUSES.map((s) => (
                <DropdownMenuItem
                  key={s.value}
                  disabled={s.value === property.status}
                  onSelect={() => onStatus(s.value)}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={onDelete}
              >
                <Trash2 className="size-4" />
                Удалить объект
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}


