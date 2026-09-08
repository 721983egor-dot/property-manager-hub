import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ImageIcon, MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionTabs } from "@/components/SectionTabs";
import {
  deleteComplex,
  fetchComplexes,
  infrastructureLabel,
  mainPhotoPath,
  type Complex,
} from "@/lib/complexes";
import { signedUrls } from "@/lib/properties";

export const Route = createFileRoute("/_authenticated/complexes/")({
  head: () => ({
    meta: [
      { title: "Комплексы — RM OS" },
      {
        name: "description",
        content:
          "Справочник жилых комплексов RM OS: описание, фотографии и инфраструктура для объектов аренды.",
      },
      { property: "og:title", content: "Комплексы — RM OS" },
      {
        property: "og:description",
        content: "Справочник жилых комплексов с описанием, фотографиями и инфраструктурой.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComplexesPage,
});

function ComplexesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: complexes = [], isLoading } = useQuery({
    queryKey: ["complexes"],
    queryFn: fetchComplexes,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return complexes;
    return complexes.filter((c) => c.name.toLowerCase().includes(q));
  }, [complexes, search]);

  const paths = filtered.map((c) => mainPhotoPath(c)).filter(Boolean) as string[];
  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", paths.slice().sort().join("|")],
    queryFn: () => signedUrls(paths),
    enabled: paths.length > 0,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteComplex(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complexes"] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Комплекс удалён");
    },
    onError: () => toast.error("Не удалось удалить комплекс"),
  });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Комплексы</h1>
        <Button size="lg" onClick={() => navigate({ to: "/complexes/new" })}>
          <Plus className="size-4" />
          Добавить комплекс
        </Button>
      </header>

      <SectionTabs active="complexes" />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-full flex-1 sm:min-w-[260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию комплекса..."
            className="h-10 pl-9"
          />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Фото</th>
              <th className="px-4 py-3 font-medium">Название комплекса</th>
              <th className="px-4 py-3 font-medium">Краткое описание</th>
              <th className="px-4 py-3 font-medium">Инфраструктура</th>
              <th className="px-4 py-3 text-right font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                  Загрузка...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                  Комплексы не найдены
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <Row
                  key={c.id}
                  complex={c}
                  photoUrl={mainPhotoPath(c) ? urls[mainPhotoPath(c)!] : undefined}
                  onDelete={() => removeMutation.mutate(c.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">Всего комплексов: {filtered.length}</p>
    </div>
  );
}

function Row({
  complex,
  photoUrl,
  onDelete,
}: {
  complex: Complex;
  photoUrl?: string | undefined;
  onDelete: () => void;
}) {
  return (
    <tr className="border-b border-border last:border-0 transition-colors hover:bg-muted/40">
      <td className="px-5 py-4">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={complex.name}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" />
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <Link
          to="/complexes/$id/edit"
          params={{ id: complex.id }}
          className="font-medium hover:text-primary"
        >
          {complex.name}
        </Link>
      </td>
      <td className="max-w-[380px] px-4 py-4 text-muted-foreground">
        <span className="line-clamp-2">{complex.description || "—"}</span>
      </td>
      <td className="px-4 py-4">
        {complex.infrastructure.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {complex.infrastructure.map((i) => (
              <li
                key={i}
                className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
              >
                {infrastructureLabel(i)}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/complexes/$id/edit" params={{ id: complex.id }}>
              <Pencil className="size-4" />
              Редактировать
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Меню комплекса">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link to="/complexes/$id/edit" params={{ id: complex.id }}>
                  Редактировать
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  if (confirm(`Удалить комплекс «${complex.name}»?`)) onDelete();
                }}
              >
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
