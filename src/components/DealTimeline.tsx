import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, MessageSquare, Send, Trash2 } from "lucide-react";
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
  formatDateTime,
} from "@/lib/deals";

type Props = {
  dealId: string;
  /** Человеко-понятное значение поля сделки в истории. */
  resolve: (field: string, value: unknown) => string;
};

type Tab = "comments" | "history";

/** Правая колонка карточки сделки: комментарии сотрудников и история изменений. */
export function DealTimeline({ dealId, resolve }: Props) {
  const queryClient = useQueryClient();
  const { profile, isAdmin } = useAccess();
  const [tab, setTab] = useState<Tab>("comments");
  const [body, setBody] = useState("");

  const comments = useQuery({
    queryKey: ["deal-comments", dealId],
    queryFn: () => fetchDealComments(dealId),
  });
  const history = useQuery({
    queryKey: ["deal-history", dealId],
    queryFn: () => fetchDealHistory(dealId),
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

  return (
    <div className="flex min-h-[24rem] flex-col rounded-lg border border-border bg-muted/30">
      <div className="flex gap-1 border-b border-border p-1">
        <TabButton active={tab === "comments"} onClick={() => setTab("comments")}>
          <MessageSquare className="size-4" />
          Комментарии
          {comments.data?.length ? (
            <span className="rounded bg-background px-1.5 text-xs">{comments.data.length}</span>
          ) : null}
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>
          <History className="size-4" />
          История
        </TabButton>
      </div>

      {tab === "comments" ? (
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
            {comments.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
            {!comments.isLoading && !(comments.data ?? []).length && (
              <p className="text-sm text-muted-foreground">Комментариев пока нет.</p>
            )}
            {(comments.data ?? []).map((c) => (
              <div key={c.id} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">{c.author_name || "Сотрудник"}</div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{formatDateTime(c.created_at)}</span>
                    {(isAdmin || c.author_id === profile?.id) && (
                      <button
                        type="button"
                        title="Удалить"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        onClick={() => remove.mutate(c.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {history.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {!history.isLoading && !(history.data ?? []).length && (
            <p className="text-sm text-muted-foreground">Изменений пока нет.</p>
          )}
          {(history.data ?? []).map((entry) => {
            const lines = describeDealChanges(entry, resolve);
            return (
              <div key={entry.id} className="rounded-md border border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {entry.action === "insert"
                      ? "Сделка создана"
                      : entry.action === "delete"
                        ? "Сделка удалена"
                        : "Изменение"}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</span>
                </div>
                {entry.actor_email && (
                  <p className="text-xs text-muted-foreground">{entry.actor_email}</p>
                )}
                {lines.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {lines.map((l) => (
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
            );
          })}
        </div>
      )}
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
