import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionTabs } from "@/components/SectionTabs";
import { deleteSelection, fetchSelections } from "@/lib/selections";

export const Route = createFileRoute("/selections/")({
  head: () => ({
    meta: [
      { title: "Подборки — RM OS" },
      {
        name: "description",
        content:
          "Сохранённые подборки объектов для клиентов: копирование ссылок и управление.",
      },
      { property: "og:title", content: "Подборки — RM OS" },
      {
        property: "og:description",
        content: "Сохранённые подборки объектов для клиентов.",
      },
    ],
  }),
  component: SelectionsPage,
});

function SelectionsPage() {
  const queryClient = useQueryClient();
  const { data: selections = [], isLoading } = useQuery({
    queryKey: ["selections"],
    queryFn: fetchSelections,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSelection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["selections"] });
      toast.success("Подборка удалена");
    },
    onError: () => toast.error("Не удалось удалить подборку"),
  });

  const copyLink = (code: string) => {
    const link = `${window.location.origin}/p/${code}`;
    navigator.clipboard.writeText(link).then(() => toast.success("Ссылка скопирована"));
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-10 lg:py-10">
      <header className="flex items-start justify-between gap-6">
        <h1 className="text-3xl font-semibold tracking-tight">Подборки</h1>
        <Button size="lg" asChild>
          <Link to="/objects">
            <Plus className="size-4" />
            Собрать подборку
          </Link>
        </Button>
      </header>

      <SectionTabs active="selections" />

      {isLoading ? (
        <p className="mt-10 text-center text-muted-foreground">Загрузка…</p>
      ) : selections.length === 0 ? (
        <Card className="mt-10">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <p className="text-lg font-medium">Пока нет сохранённых подборок</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Чтобы создать подборку, отметьте объекты в разделе «Объекты» и нажмите
              «Создать подборку». Если поставить галочку «Сохранить в списке подборок»,
              она появится здесь.
            </p>
            <Button asChild>
              <Link to="/objects">Перейти к объектам</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4">
          {selections.map((s) => {
            const link = `${window.location.origin}/p/${s.code}`;
            return (
              <Card key={s.id} className="overflow-hidden">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-lg font-semibold">
                        {s.client_name || "Подборка без имени"}
                      </h3>
                      <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {formatDate(s.created_at)}
                      </span>
                    </div>
                    {s.comment ? (
                      <p className="mt-1 truncate text-sm text-muted-foreground">{s.comment}</p>
                    ) : null}
                    <p className="mt-1 text-sm">
                      {s.items.length} {objectWord(s.items.length)}
                    </p>
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {link}
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => copyLink(s.code)}>
                      <Copy className="size-4" />
                      Копировать ссылку
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (window.confirm("Удалить сохранённую подборку?")) {
                          deleteMutation.mutate(s.id);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function objectWord(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return "объектов";
  if (mod10 === 1) return "объект";
  if (mod10 >= 2 && mod10 <= 4) return "объекта";
  return "объектов";
}
