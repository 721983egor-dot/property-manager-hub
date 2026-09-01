import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Archive, ImageIcon, MoreHorizontal, Pencil, Plus, RotateCcw, Search } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/StatusBadge";
import {

  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  ROOM_OPTIONS,
  fetchProperties,
  floorLabel,
  roomsLabel,
  setPropertyStatus,
  signedUrls,
  typeLabel,
  type Property,
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
    return properties.filter((p) => {
      if (tab === "active" && p.status === "archived") return false;
      if (tab === "archive" && p.status !== "archived") return false;
      if (q && !`${p.title} ${p.complex_name}`.toLowerCase().includes(q)) return false;
      if (type !== ALL && p.type !== type) return false;
      if (complex !== ALL && p.complex_name !== complex) return false;
      if (rooms !== ALL && p.rooms !== Number(rooms)) return false;
      if (status !== ALL && p.status !== status) return false;
      return true;
    });
  }, [properties, tab, search, type, complex, rooms, status]);

  const photoPaths = filtered.map((p) => p.photos[0]?.path).filter(Boolean) as string[];
  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", photoPaths.slice().sort().join("|")],
    queryFn: () => signedUrls(photoPaths),
    enabled: photoPaths.length > 0,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "archived" | "free" }) =>
      setPropertyStatus(id, next),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success(vars.next === "archived" ? "Объект перемещён в архив" : "Объект восстановлен");
    },
    onError: () => toast.error("Не удалось изменить статус объекта"),
  });

  const hasFilters =
    search !== "" || type !== ALL || complex !== ALL || rooms !== ALL || status !== ALL;

  const resetFilters = () => {
    setSearch("");
    setType(ALL);
    setComplex(ALL);
    setRooms(ALL);
    setStatus(ALL);
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

        {hasFilters ? (
          <Button variant="ghost" onClick={resetFilters} className="h-10 text-muted-foreground">
            Сбросить
          </Button>
        ) : null}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Объект</th>
              <th className="px-4 py-3 font-medium">Тип</th>
              <th className="px-4 py-3 font-medium">Комплекс</th>
              <th className="px-4 py-3 font-medium">Этаж</th>
              <th className="px-4 py-3 font-medium">Планировка</th>
              <th className="px-4 py-3 font-medium">Санузлы</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 text-right font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                  Загрузка...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                  Объекты не найдены
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <Row
                  key={p.id}
                  property={p}
                  photoUrl={p.photos[0]?.path ? urls[p.photos[0].path] : undefined}
                  onArchive={() => statusMutation.mutate({ id: p.id, next: "archived" })}
                  onRestore={() => statusMutation.mutate({ id: p.id, next: "free" })}
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
      <SelectTrigger className="h-10 min-w-[160px]">
        <SelectValue placeholder={placeholder} />
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
  onArchive,
  onRestore,
}: {
  property: Property;
  photoUrl?: string | undefined;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const archived = property.status === "archived";
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
              to="/objects/$id/edit"
              params={{ id: property.id }}
              className="block truncate font-medium hover:text-primary"
            >
              {property.title}
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
        <StatusBadge status={property.status} />
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/objects/$id/edit" params={{ id: property.id }} aria-label="Редактировать">
              <Pencil className="size-4" />
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Ещё">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/objects/$id/edit" params={{ id: property.id }}>
                  <Pencil className="size-4" />
                  Редактировать
                </Link>
              </DropdownMenuItem>
              {archived ? (
                <DropdownMenuItem onSelect={onRestore}>
                  <RotateCcw className="size-4" />
                  Восстановить объект
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={onArchive}>
                  <Archive className="size-4" />
                  Переместить в архив
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}


