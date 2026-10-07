import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteFinanceArticle,
  deleteFinanceArticleCategory,
  fetchFinanceCatalog,
  groupArticlesByCategory,
  moveIndex,
  reorderFinanceArticleCategories,
  reorderFinanceArticles,
  saveFinanceArticle,
  saveFinanceArticleCategory,
  type FinanceArticle,
  type FinanceArticleCategory,
} from "@/lib/finance-articles";
import type { PaymentDirection } from "@/lib/finance";
import { cn } from "@/lib/utils";

type DragPayload = { kind: "category"; id: string } | { kind: "article"; id: string };

function parseDrag(event: DragEvent): DragPayload | null {
  try {
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DragPayload;
    if (parsed.kind === "category" || parsed.kind === "article") return parsed;
    return null;
  } catch {
    return null;
  }
}

export function FinanceArticlesSettings() {
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<PaymentDirection>("out");
  const [categories, setCategories] = useState<FinanceArticleCategory[]>([]);
  const [articles, setArticles] = useState<FinanceArticle[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newArticle, setNewArticle] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["finance-catalog"],
    queryFn: fetchFinanceCatalog,
  });

  useEffect(() => {
    if (!catalogQuery.data) return;
    setCategories(catalogQuery.data.categories);
    setArticles(catalogQuery.data.articles);
  }, [catalogQuery.data]);

  const groups = useMemo(
    () => groupArticlesByCategory(categories, articles, direction),
    [categories, articles, direction],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["finance-catalog"] });
    void queryClient.invalidateQueries({ queryKey: ["payments"] });
  };

  const saveCat = useMutation({
    mutationFn: ({ id, name, position }: { id: string | null; name: string; position?: number }) =>
      saveFinanceArticleCategory(id, {
        name,
        direction,
        ...(position === undefined ? {} : { position }),
      }),
    onSuccess: () => {
      setNewCategory("");
      refresh();
      toast.success("Категория сохранена");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить"),
  });

  const saveArt = useMutation({
    mutationFn: (input: {
      id: string | null;
      name: string;
      category_id: string | null;
      cash_flow_type?: FinanceArticle["cash_flow_type"];
      affects_profit?: boolean;
      position?: number;
    }) =>
      saveFinanceArticle(input.id, {
        name: input.name,
        direction,
        ...(input.cash_flow_type === undefined ? {} : { cash_flow_type: input.cash_flow_type }),
        ...(input.affects_profit === undefined ? {} : { affects_profit: input.affects_profit }),
        category_id: input.category_id,
        ...(input.position === undefined ? {} : { position: input.position }),
      }),
    onSuccess: () => {
      setNewArticle({});
      refresh();
      toast.success("Статья сохранена");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить"),
  });

  const deleteCat = useMutation({
    mutationFn: deleteFinanceArticleCategory,
    onSuccess: () => {
      refresh();
      toast.success("Категория удалена");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Не удалось удалить"),
  });

  const deleteArt = useMutation({
    mutationFn: deleteFinanceArticle,
    onSuccess: () => {
      refresh();
      toast.success("Статья удалена");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Не удалось удалить"),
  });

  const persistCategoryOrder = (next: FinanceArticleCategory[]) => {
    const ids = next.filter((c) => c.direction === direction).map((c) => c.id);
    setCategories(next);
    void reorderFinanceArticleCategories(ids)
      .then(refresh)
      .catch((error) => {
        setCategories(catalogQuery.data?.categories ?? []);
        toast.error(error instanceof Error ? error.message : "Не удалось изменить порядок");
      });
  };

  const persistArticleOrder = (next: FinanceArticle[]) => {
    const ofDir = next.filter((a) => a.direction === direction);
    setArticles(next);
    void reorderFinanceArticles(
      ofDir.map((article, position) => ({
        id: article.id,
        position,
        category_id: article.category_id,
      })),
    )
      .then(refresh)
      .catch((error) => {
        setArticles(catalogQuery.data?.articles ?? []);
        toast.error(error instanceof Error ? error.message : "Не удалось изменить порядок");
      });
  };

  const moveCategory = (fromId: string, toId: string) => {
    const list = categories.filter((c) => c.direction === direction);
    const from = list.findIndex((c) => c.id === fromId);
    const to = list.findIndex((c) => c.id === toId);
    if (from < 0 || to < 0) return;
    const ordered = moveIndex(list, from, to);
    persistCategoryOrder([...categories.filter((c) => c.direction !== direction), ...ordered]);
  };

  const moveArticle = (fromId: string, toId: string, categoryId: string | null) => {
    const list = articles.filter((a) => a.direction === direction);
    const from = list.findIndex((a) => a.id === fromId);
    const to = list.findIndex((a) => a.id === toId);
    if (from < 0) return;
    const moved = list[from];
    if (!moved) return;
    const withCategory = list.map((a) => (a.id === fromId ? { ...a, category_id: categoryId } : a));
    const nextList = to < 0 ? withCategory : moveIndex(withCategory, from, to);
    persistArticleOrder([...articles.filter((a) => a.direction !== direction), ...nextList]);
  };

  const dropOnCategory = (categoryId: string | null, event: DragEvent) => {
    event.preventDefault();
    const payload = parseDrag(event);
    setDragOver(null);
    if (!payload) return;
    if (payload.kind === "category" && categoryId) {
      moveCategory(payload.id, categoryId);
      return;
    }
    if (payload.kind === "article") {
      const targetArticle = articles.find((a) => a.id === payload.id);
      if (!targetArticle) return;
      moveArticle(payload.id, payload.id, categoryId);
    }
  };

  const dropOnArticle = (article: FinanceArticle, event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = parseDrag(event);
    setDragOver(null);
    if (!payload || payload.kind !== "article") return;
    moveArticle(payload.id, article.id, article.category_id);
  };

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-muted-foreground">
        Перетащите строку за иконку, чтобы поменять порядок. Категории — группы для отчётов, статья
        выбирается в форме операции. Деятельность задаёт раздел ДДС. Снимите «В прибыли» для
        депозитов, займов, капитальных вложений и вывода денег — они останутся в движении денег, но
        не попадут в прибыль.
      </p>

      <div className="flex rounded-lg border border-[#e8edf2] bg-white p-0.5 w-fit">
        {(
          [
            ["out", "Расход"],
            ["in", "Приход"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              direction === value
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:text-slate-800",
            )}
            onClick={() => setDirection(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {catalogQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const catKey = group.category?.id ?? "none";
            return (
              <div
                key={catKey}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(`cat:${catKey}`);
                }}
                onDrop={(event) => dropOnCategory(group.category?.id ?? null, event)}
                className={cn(
                  "rounded-lg border border-[#e8edf2] bg-white",
                  dragOver === `cat:${catKey}` ? "ring-2 ring-teal-600" : "",
                )}
              >
                <div
                  draggable={Boolean(group.category)}
                  onDragStart={(event) => {
                    if (!group.category) return;
                    if ((event.target as HTMLElement).closest("input,button")) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.setData(
                      "text/plain",
                      JSON.stringify({ kind: "category", id: group.category.id }),
                    );
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  className="flex items-center gap-2 border-b border-[#e8edf2] px-2 py-2"
                >
                  {group.category ? (
                    <span className="grid size-8 shrink-0 cursor-grab place-items-center text-muted-foreground active:cursor-grabbing">
                      <GripVertical className="size-4" />
                    </span>
                  ) : (
                    <span className="size-8" />
                  )}
                  {group.category ? (
                    <Input
                      className="h-9 border-[#e8edf2] font-medium"
                      aria-label={`Название категории ${group.category.name}`}
                      defaultValue={group.category.name}
                      key={`${group.category.id}:${group.category.name}`}
                      onBlur={(event) => {
                        const next = event.target.value.trim();
                        if (!next || !group.category || next === group.category.name) return;
                        saveCat.mutate({ id: group.category.id, name: next });
                      }}
                    />
                  ) : (
                    <p className="flex-1 text-sm font-medium text-slate-500">Без категории</p>
                  )}
                  {group.category ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm("Удалить категорию? Статьи останутся без группы.")) {
                          deleteCat.mutate(group.category!.id);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-1 p-2">
                  {group.articles.map((article) => (
                    <div
                      key={article.id}
                      draggable
                      onDragStart={(event) => {
                        if ((event.target as HTMLElement).closest("input,button")) {
                          event.preventDefault();
                          return;
                        }
                        event.dataTransfer.setData(
                          "text/plain",
                          JSON.stringify({ kind: "article", id: article.id }),
                        );
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setDragOver(`art:${article.id}`);
                      }}
                      onDrop={(event) => dropOnArticle(article, event)}
                      className={cn(
                        "flex flex-wrap items-center gap-2 rounded-md border border-transparent px-1 py-1",
                        dragOver === `art:${article.id}`
                          ? "ring-2 ring-teal-600"
                          : "hover:border-[#e8edf2]",
                      )}
                    >
                      <span className="grid size-8 shrink-0 cursor-grab place-items-center text-muted-foreground active:cursor-grabbing">
                        <GripVertical className="size-4" />
                      </span>
                      <Input
                        className="h-9 min-w-40 flex-1 border-[#e8edf2]"
                        aria-label={`Название статьи ${article.name}`}
                        defaultValue={article.name}
                        key={`${article.id}:${article.name}`}
                        onBlur={(event) => {
                          const next = event.target.value.trim();
                          if (!next || next === article.name) return;
                          saveArt.mutate({
                            id: article.id,
                            name: next,
                            category_id: article.category_id,
                          });
                        }}
                      />
                      <select
                        aria-label={`Категория статьи ${article.name}`}
                        value={article.category_id ?? ""}
                        disabled={saveArt.isPending}
                        className="h-9 max-w-[180px] rounded-md border border-border bg-white px-2 text-sm"
                        onChange={(event) =>
                          saveArt.mutate({
                            id: article.id,
                            name: article.name,
                            category_id: event.target.value || null,
                          })
                        }
                      >
                        <option value="">Без категории</option>
                        {categories
                          .filter((category) => category.direction === direction)
                          .map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                      </select>
                      <select
                        aria-label={`Деятельность статьи ${article.name}`}
                        className="h-9 rounded-md border bg-white px-2 text-sm"
                        value={article.cash_flow_type ?? "operating"}
                        disabled={saveArt.isPending}
                        onChange={(event) =>
                          saveArt.mutate({
                            id: article.id,
                            name: article.name,
                            category_id: article.category_id,
                            cash_flow_type: event.target.value as NonNullable<
                              FinanceArticle["cash_flow_type"]
                            >,
                          })
                        }
                      >
                        <option value="operating">Операционная</option>
                        <option value="investing">Инвестиционная</option>
                        <option value="financing">Финансовая</option>
                      </select>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={
                            article.affects_profit ??
                            !["deposit_in", "deposit_out"].includes(article.code ?? "")
                          }
                          disabled={saveArt.isPending}
                          onChange={(event) =>
                            saveArt.mutate({
                              id: article.id,
                              name: article.name,
                              category_id: article.category_id,
                              affects_profit: event.target.checked,
                            })
                          }
                        />
                        В прибыли
                      </label>
                      <Button
                        aria-label={`Удалить статью ${article.name}`}
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm("Удалить статью? В операциях она станет пустой.")) {
                            deleteArt.mutate(article.id);
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}

                  <div className="flex items-center gap-2 px-1 pt-1">
                    <Input
                      className="h-9 border-[#e8edf2]"
                      placeholder="Новая статья"
                      value={newArticle[catKey] ?? ""}
                      onChange={(event) =>
                        setNewArticle((current) => ({ ...current, [catKey]: event.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!(newArticle[catKey] ?? "").trim() || saveArt.isPending}
                      onClick={() =>
                        saveArt.mutate({
                          id: null,
                          name: (newArticle[catKey] ?? "").trim(),
                          category_id: group.category?.id ?? null,
                          position: articles.filter((a) => a.direction === direction).length,
                        })
                      }
                    >
                      <Plus className="mr-1 size-4" />
                      Добавить
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Категорий пока нет — добавьте первую.</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[#e8edf2] bg-white p-3">
            <Input
              className="h-9 min-w-[12rem] flex-1 border-[#e8edf2]"
              placeholder="Новая категория"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
            />
            <Button
              type="button"
              disabled={!newCategory.trim() || saveCat.isPending}
              onClick={() =>
                saveCat.mutate({
                  id: null,
                  name: newCategory.trim(),
                  position: categories.filter((c) => c.direction === direction).length,
                })
              }
            >
              <Plus className="mr-1.5 size-4" />
              Добавить категорию
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
