import { useAccess } from "@/hooks/useAccess";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getScheduledActions, changeScheduledAction } from "@/lib/scheduled-actions/functions";
import { scheduledTime, type ScheduledRow } from "@/lib/scheduled-actions/model";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
const names: Record<ScheduledRow["state"], string> = {
  pending: "Запланировано",
  running: "Выполняется",
  done: "Выполнено",
  cancelled: "Отменено",
  failed: "Не выполнено",
  needs_review: "Проверьте результат",
};
const localTime = (iso: string) =>
  new Date(Date.parse(iso) + 3 * 3600000).toISOString().slice(0, 16);
export function ScheduledAssistantActions() {
  const { profile } = useAccess();
  const load = useServerFn(getScheduledActions),
    change = useServerFn(changeScheduledAction),
    cache = useQueryClient();
  const q = useQuery({
    queryKey: ["scheduled-assistant-actions", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => load(),
    refetchInterval: 15000,
  });
  const [edit, setEdit] = useState<string | null>(null),
    [time, setTime] = useState(""),
    [busy, setBusy] = useState<string | null>(null),
    [history, setHistory] = useState(false);
  const all = q.data?.actions ?? [],
    pending = all
      .filter((r) => r.state === "pending" || r.state === "running")
      .sort((a, b) => a.run_at.localeCompare(b.run_at));
  const rows = history
    ? all.filter((r) => r.state !== "pending" && r.state !== "running")
    : pending;
  async function manage(row: ScheduledRow, action: "cancel" | "reschedule") {
    setBusy(row.id);
    try {
      const runAt =
        action === "reschedule" ? new Date(time + ":00+03:00").toISOString() : undefined;
      const message = await change({
        data: { id: row.id, version: row.version, action, ...(runAt ? { runAt } : {}) },
      });
      toast.success(message);
      setEdit(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось изменить поручение");
    } finally {
      setBusy(null);
      void cache.invalidateQueries({ queryKey: ["scheduled-assistant-actions"] });
    }
  }
  return (
    <section className="mx-auto max-w-4xl px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Clock className="size-5" />
            Отложенные поручения
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Подтверждённые действия выполняются в выбранное время по Москве. Результаты остаются
            здесь и приходят в связанный личный Telegram.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          <RefreshCw className="size-4" />
          Обновить
        </Button>
      </div>
      <div className="my-5 flex gap-2">
        <Button variant={!history ? "default" : "outline"} onClick={() => setHistory(false)}>
          Ожидают · {pending.length}
        </Button>
        <Button variant={history ? "default" : "outline"} onClick={() => setHistory(true)}>
          История
        </Button>
      </div>
      {q.isPending ? (
        <p>Загрузка поручений…</p>
      ) : q.error ? (
        <p role="alert" className="text-destructive">
          Не удалось загрузить поручения: {q.error.message}
        </p>
      ) : !rows.length ? (
        <div className="rounded-lg border bg-card p-6">
          <h3 className="font-medium">
            {history ? "История пока пуста" : "Нет отложенных поручений"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Напишите Ассистенту, что сделать и когда. Он покажет действие и время, а вы подтвердите
            постановку в очередь.
          </p>
          <p className="mt-3 text-sm">
            Например: «Завтра в 10:00 обнови цену объекта…» или «В пятницу в 12:00 создай задачу
            менеджеру…»
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="text-sm font-medium">{scheduledTime(row.run_at)}</p>
                <span
                  className={`rounded-full px-2 py-1 text-xs ${row.state === "done" ? "bg-emerald-50 text-emerald-800" : row.state === "needs_review" || row.state === "failed" ? "bg-amber-50 text-amber-900" : "bg-muted text-muted-foreground"}`}
                >
                  {names[row.state]}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{row.summary}</p>
              {row.result && (
                <p className="mt-3 whitespace-pre-wrap rounded bg-muted/50 p-3 text-sm">
                  {row.result}
                </p>
              )}
              {row.finished_at && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Завершено: {scheduledTime(row.finished_at)}
                </p>
              )}
              {row.state === "pending" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {edit === row.id ? (
                    <>
                      <label className="text-xs">
                        Новое время · Москва
                        <Input
                          aria-label="Новое время поручения"
                          type="datetime-local"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                        />
                      </label>
                      <Button
                        size="sm"
                        disabled={!!busy || !time}
                        onClick={() => void manage(row, "reschedule")}
                      >
                        Подтвердить перенос
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>
                        Не менять
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => {
                          setEdit(row.id);
                          setTime(localTime(row.run_at));
                        }}
                      >
                        Перенести
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!!busy}
                        onClick={() => void manage(row, "cancel")}
                      >
                        Отменить поручение
                      </Button>
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
