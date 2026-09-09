import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, History, MessageSquare, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAccess } from "@/hooks/useAccess";
import {
  addDealComment,
  deleteDealComment,
  describeDealChanges,
  fetchDealComments,
  fetchDealHistory,
  fetchDealShowings,
  formatDateTime,
  type ChangeLine,
} from "@/lib/deals";

type Props = {
  dealId: string;
  /** Человеко-понятное значение поля сделки в истории. */
  resolve: (field: string, value: unknown) => string;
  /** Название объекта по идентификатору — для плиток показов. */
  propertyLabel?: (id: string) => string;
};

type Filter = "all" | "comments" | "history";

type Item = {
  id: string;
  kind: "comment" | "history" | "showing";
  at: string;
  title: string;
  author: string;
  body?: string;
  lines?: ChangeLine[];
  removable?: boolean;
};

/** Правая колонка карточки сделки: единая лента комментариев, показов и изменений. */
export function DealTimeline({ dealId, resolve, propertyLabel }: Props) {
  const queryClient = useQueryClient();
  const { profile, isAdmin } = useAccess();
  const [filter, setFilter] = useState<Filter>("all");
  const [body, setBody] = useState("");

  const comments = useQuery({
    queryKey: ["deal-comments", dealId],
    queryFn: () => fetchDealComments(dealId),
  });
  const history = useQuery({
    queryKey: ["deal-history", dealId],
    queryFn: () => fetchDealHistory(dealId),
  });
  const showings = useQuery({
    queryKey: ["deal-showings", dealId],
    queryFn: () => fetchDealShowings(dealId),
  });

  const add = useMutation({
    mutationFn: () =>
      addDealComment(dealId, body, {
        id: profile?.id ?? null,
        name: profile?.full_name || profile?.email || "Сотрудник",
      }),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["deal-comments", dealId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось добавить комментарий"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDealComment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deal-comments", dealId] }),
    onError: () => toast.error("Не удалось удалить комментарий"),
  });

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    for (const c of comments.data ?? []) {
      list.push({
        id: `c-${c.id}`,
        kind: "comment",
        at: c.created_at,
        title: "Комментарий",
        author: c.author_name || "Сотрудник",
        body: c.body,
        removable: isAdmin || c.author_id === profile?.id,
      });
    }
    for (const s of showings.data ?? []) {
      list.push({
        id: `s-${s.id}`,
        kind: "showing",
        at: s.created_at,
        title: `Показ: ${propertyLabel?.(s.property_id) ?? "объект"}`,
        author: s.author_name || "Сотрудник",
        body: [new Date(s.shown_at).toLocaleDateString("ru-RU"), s.note].filter(Boolean).join(" · "),
      });
    }
    for (const entry of history.data ?? []) {
      list.push({
        id: `h-${entry.id}`,
        kind: "history",
        at: entry.created_at,
        title:
          entry.action === "insert"
            ? "Сделка создана"
            : entry.action === "delete"
              ? "Сделка удалена"
              : "Изменение",
        author: entry.actor_email || "Система",
        lines: describeDealChanges(entry, resolve),
      });
    }
    return list.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [comments.data, showings.data, history.data, resolve, propertyLabel, isAdmin, profile?.id]);

  const visible = items.filter((i) =>
    filter === "all" ? true : filter === "comments" ? i.kind === "comment" : i.kind !== "comment",
  );

  return (
    <div className="flex min-h-[24rem] flex-col rounded-lg border border-border bg-muted/30">
      <div className="flex gap-1 border-b border-border p-1">
        <TabButton active={filter === "all"} onClick={() => setFilter("all")}>
          Всё
        </TabButton>
        <TabButton active={filter === "comments"} onClick={() => setFilter("comments")}>
          <MessageSquare className="size-4" />
          Комментарии
        </TabButton>
        <TabButton active={filter === "history"} onClick={() => setFilter("history")}>
          <History className="size-4" />
          История
        </TabButton>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="grid gap-2">
          <Textarea
            rows={3}
            value={body}
            placeholder="Что обсудили с клиентом?"
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!body.trim() || add.isPending}
              onClick={() => add.mutate()}
            >
              <Send className="size-4" />
              Добавить
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto">
          {(comments.isLoading || history.isLoading) && (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          )}
          {!comments.isLoading && !history.isLoading && !visible.length && (
            <p className="text-sm text-muted-foreground">Записей пока нет.</p>
          )}
          {visible.map((item) => (
            <div key={item.id} className="rounded-md border border-border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {item.kind === "comment" ? (
                    <MessageSquare className="size-3.5 text-muted-foreground" />
                  ) : item.kind === "showing" ? (
                    <Eye className="size-3.5 text-muted-foreground" />
                  ) : (
                    <History className="size-3.5 text-muted-foreground" />
                  )}
                  {item.title}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {formatDateTime(item.at)}
                  {item.removable && (
                    <button
                      type="button"
                      title="Удалить"
                      className="rounded p-1 hover:bg-muted hover:text-destructive"
                      onClick={() => remove.mutate(item.id.slice(2))}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{item.author}</p>
              {item.body ? (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.body}</p>
              ) : null}
              {item.lines && item.lines.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {item.lines.map((l) => (
                    <li key={l.label} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground">{l.label}:</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{l.from}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{l.to}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/60",
      )}
    >
      {children}
    </button>
  );
}
