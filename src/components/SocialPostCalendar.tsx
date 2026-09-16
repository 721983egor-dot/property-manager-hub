import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { platformLabel, statusLabel, type SocialPost } from "@/lib/social";
import { MONTHS, toISODate } from "@/lib/rentals";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

function postDate(post: SocialPost) {
  const iso = post.scheduled_at || post.published_at;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function postDayKey(post: SocialPost) {
  const d = postDate(post);
  return d ? toISODate(d) : null;
}

function tone(status: SocialPost["status"]) {
  if (status === "scheduled" || status === "publishing") return "bg-primary text-primary-foreground";
  if (status === "published") return "bg-emerald-100 text-emerald-900";
  if (status === "failed") return "bg-destructive/15 text-destructive";
  return "bg-muted text-foreground";
}

export function SocialPostCalendar({
  posts,
  onEdit,
  onOpenDay,
}: {
  posts: SocialPost[];
  onEdit: (post: SocialPost) => void;
  onOpenDay?: (iso: string) => void;
}) {
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => toISODate(new Date()));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const today = toISODate(new Date());

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list: { iso: string; inMonth: boolean; date: Date }[] = [];
    for (let i = 0; i < startPad; i++) {
      const d = new Date(year, month, i - startPad + 1);
      list.push({ iso: toISODate(d), inMonth: false, date: d });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      list.push({ iso: toISODate(d), inMonth: true, date: d });
    }
    while (list.length % 7 !== 0) {
      const d = new Date(year, month, daysInMonth + (list.length - startPad - daysInMonth) + 1);
      list.push({ iso: toISODate(d), inMonth: false, date: d });
    }
    return list;
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, SocialPost[]>();
    for (const post of posts) {
      const key = postDayKey(post);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(post);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ta = postDate(a)?.getTime() ?? 0;
        const tb = postDate(b)?.getTime() ?? 0;
        return ta - tb;
      });
    }
    return map;
  }, [posts]);

  const dayPosts = byDay.get(selected) ?? [];
  const monthCount = cells.filter((c) => c.inMonth).reduce((n, c) => n + (byDay.get(c.iso)?.length ?? 0), 0);
  const undatedDrafts = useMemo(
    () => posts.filter((p) => (p.status === "draft" || p.status === "failed") && !postDayKey(p)),
    [posts],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            {MONTHS[month]} {year}
          </h2>
          <p className="text-sm text-muted-foreground">
            {monthCount
              ? `${monthCount} ${monthCount === 1 ? "пост" : monthCount < 5 ? "поста" : "постов"} в этом месяце`
              : "В этом месяце пока пусто"}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            aria-label="Предыдущий месяц"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Сегодня
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            aria-label="Следующий месяц"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-1 py-2 text-center text-[11px] font-medium text-muted-foreground">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const list = byDay.get(cell.iso) ?? [];
            const isSelected = selected === cell.iso;
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => {
                  setSelected(cell.iso);
                  onOpenDay?.(cell.iso);
                }}
                className={cn(
                  "min-h-[88px] border-b border-r border-border p-1.5 text-left align-top last:border-r-0",
                  !cell.inMonth && "bg-muted/20 text-muted-foreground",
                  isSelected && "bg-primary/5 ring-1 ring-inset ring-primary",
                  cell.iso === today && !isSelected && "bg-amber-50/60",
                )}
              >
                <span className={cn("text-xs font-medium", cell.iso === today && "text-primary")}>
                  {cell.date.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {list.slice(0, 3).map((post) => (
                    <span
                      key={post.id}
                      className={cn("block truncate rounded px-1 py-0.5 text-[10px] leading-tight", tone(post.status))}
                    >
                      {postDate(post)?.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}{" "}
                      {post.topic || "Без темы"}
                    </span>
                  ))}
                  {list.length > 3 ? (
                    <span className="block px-1 text-[10px] text-muted-foreground">ещё {list.length - 3}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">
          {new Date(selected + "T12:00:00").toLocaleDateString("ru-RU", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        {!dayPosts.length ? (
          <p className="text-sm text-muted-foreground">На этот день ничего не запланировано.</p>
        ) : (
          <ul className="space-y-2">
            {dayPosts.map((post) => (
              <li key={post.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{post.topic || "Без темы"}</p>
                    <p className="text-xs text-muted-foreground">
                      {statusLabel(post.status)}
                      {postDate(post)
                        ? ` · ${postDate(post)!.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                      {" · "}
                      {post.targets.map((t) => platformLabel(t.platform)).join(", ")}
                    </p>
                  </div>
                  {(post.status === "draft" || post.status === "failed") && (
                    <Button type="button" size="sm" variant="outline" onClick={() => onEdit(post)}>
                      Править
                    </Button>
                  )}
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{post.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {undatedDrafts.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Черновики без даты</p>
          <ul className="space-y-2">
            {undatedDrafts.map((post) => (
              <li key={post.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
                <div>
                  <p className="font-medium">{post.topic || "Без темы"}</p>
                  <p className="text-xs text-muted-foreground">
                    {statusLabel(post.status)}
                    {" · "}
                    {post.targets.map((t) => platformLabel(t.platform)).join(", ")}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => onEdit(post)}>
                  Править
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
