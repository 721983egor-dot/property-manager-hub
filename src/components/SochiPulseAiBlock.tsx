import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  ExternalLink,
  HeartPulse,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Sun,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatText } from "@/components/ChatText";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantChatMessage } from "@/lib/assistant.functions";
import {
  askSocialAssistant,
  getSochiPulse,
  runSocialAssistantAction,
} from "@/lib/social.functions";
import {
  pulseKindLabel,
  pulsePostStatusLabel,
  type SochiPulseItem,
  type SochiPulseWeatherPayload,
} from "@/lib/sochi-pulse";

function formatWhen(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hideTime = date.getHours() === 0 && date.getMinutes() === 0;
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(hideTime ? {} : { hour: "2-digit", minute: "2-digit" }),
  });
}

function dayLabel(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" });
}

function weatherIcon(code: number) {
  if (code === 0 || code === 1) return Sun;
  if (code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 71 && code < 80) return CloudSnow;
  if (code >= 95) return CloudLightning;
  return CloudRain;
}

function postedBadge(item: SochiPulseItem) {
  const published = item.relatedPosts.find((p) => p.status === "published");
  const queued = item.relatedPosts.find((p) => p.status === "scheduled" || p.status === "publishing");
  const draft = item.relatedPosts.find((p) => p.status === "draft" || p.status === "failed");
  return published ?? queued ?? draft ?? null;
}

function pulsePrompt(item: SochiPulseItem) {
  const extra =
    item.kind === "event"
      ? [
          item.startsAt ? `Когда: ${formatWhen(item.startsAt)}` : "",
          item.payload["place"] ? `Где: ${String(item.payload["place"])}` : "",
          item.payload["price"] ? `Цена билета: ${String(item.payload["price"])}` : "",
          item.summary,
        ]
          .filter(Boolean)
          .join("\n")
      : item.summary;
  return `Напиши черновик поста Residence More по пункту пульса Сочи. Не публикуй — только proposeSocialPost с publishNow=false и pulseItemId="${item.id}".

Тип: ${pulseKindLabel(item.kind)}
Заголовок: ${item.title}
${extra}
Источник: ${item.source}
${item.url ? `Ссылка: ${item.url}` : ""}
id пульса: ${item.id}

Если по этой теме уже есть пост — сначала скажи. Тон: жизнь у моря и долгосрочная аренда, без выдуманных фактов.`;
}

function PostedMark({ item }: { item: SochiPulseItem }) {
  const related = postedBadge(item);
  if (!related) return null;
  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
      {pulsePostStatusLabel(related.status)}
    </span>
  );
}

export function SochiPulseAiBlock({ onChange }: { onChange: () => void }) {
  const queryClient = useQueryClient();
  const loadPulse = useServerFn(getSochiPulse);
  const [seed, setSeed] = useState<{ nonce: number; text: string } | null>(null);

  const pulseQuery = useQuery({
    queryKey: ["sochi-pulse"],
    queryFn: () => loadPulse({ data: { force: false } }),
  });

  const refreshMut = useMutation({
    mutationFn: () => loadPulse({ data: { force: true } }),
    onSuccess: (board) => {
      queryClient.setQueryData(["sochi-pulse"], board);
      toast.success("Пульс обновлён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const board = pulseQuery.data;
  const weatherPayload = board?.weather?.payload as SochiPulseWeatherPayload | undefined;
  const WeatherIcon = weatherIcon(Number(weatherPayload?.code ?? 1));

  const writePost = (item: SochiPulseItem) => {
    setSeed({ nonce: Date.now(), text: pulsePrompt(item) });
  };

  const afterAi = () => {
    onChange();
    void queryClient.invalidateQueries({ queryKey: ["sochi-pulse"] });
  };

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="size-5 text-primary" />
            Пульс Сочи
          </CardTitle>
          <CardDescription>
            Погода, новости и события города. ИИ пишет черновик поста по выбранной теме — публиковать
            будете сами из ленты.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending || pulseQuery.isLoading}
        >
          {refreshMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Обновить
        </Button>
      </CardHeader>
      <CardContent>
        {pulseQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Собираем пульс города…
          </div>
        ) : pulseQuery.error ? (
          <p className="text-sm text-destructive">
            {(pulseQuery.error as Error).message || "Не удалось загрузить пульс Сочи"}
          </p>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_1fr]">
            <div className="min-w-0 space-y-4">
              {board?.errors.length ? (
                <p className="text-xs text-destructive">{board.errors.join(" · ")}</p>
              ) : null}
              {board?.fetchedAt ? (
                <p className="text-[11px] text-muted-foreground">
                  Обновлено {new Date(board.fetchedAt).toLocaleString("ru-RU")}
                </p>
              ) : null}

              {board?.weather ? (
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <WeatherIcon className="size-9 text-primary" />
                      <div>
                        <p className="text-lg font-semibold leading-tight">{board.weather.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{board.weather.summary}</p>
                      </div>
                    </div>
                    <PostedMark item={board.weather} />
                  </div>
                  {weatherPayload?.forecast && weatherPayload.forecast.length > 1 ? (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {weatherPayload.forecast.slice(1, 5).map((day) => (
                        <div key={day.date} className="rounded-lg bg-background px-2 py-1.5 text-center">
                          <p className="text-[10px] uppercase text-muted-foreground">{dayLabel(day.date)}</p>
                          <p className="text-sm font-medium">
                            {day.max}°<span className="text-muted-foreground">/{day.min}°</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <Button size="sm" className="mt-3" variant="outline" onClick={() => writePost(board.weather!)}>
                    Написать пост про погоду
                  </Button>
                </div>
              ) : null}

              <PulseList
                title="Новости"
                empty="Свежих новостей пока нет"
                items={board?.news ?? []}
                onWrite={writePost}
              />
              <PulseList
                title="События"
                empty="Ближайших событий не нашли"
                items={board?.events ?? []}
                onWrite={writePost}
                event
              />
            </div>

            <PulseAiChat seed={seed} onChange={afterAi} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PulseList({
  title,
  empty,
  items,
  onWrite,
  event,
}: {
  title: string;
  empty: string;
  items: SochiPulseItem[];
  onWrite: (item: SochiPulseItem) => void;
  event?: boolean;
}) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {event ? <CalendarDays className="size-4 text-primary" /> : <Sparkles className="size-4 text-primary" />}
        {title}
      </h3>
      {!items.length ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug">{item.title}</p>
                <PostedMark item={item} />
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summary}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {item.source}
                {event && item.startsAt ? ` · ${formatWhen(item.startsAt)}` : ""}
                {!event && item.publishedAt ? ` · ${formatWhen(item.publishedAt)}` : ""}
                {item.payload["place"] ? ` · ${String(item.payload["place"])}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onWrite(item)}>
                  Написать пост
                </Button>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-3" />
                    Источник
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PulseAiChat({
  seed,
  onChange,
}: {
  seed: { nonce: number; text: string } | null;
  onChange: () => void;
}) {
  const askFn = useServerFn(askSocialAssistant);
  const runFn = useServerFn(runSocialAssistantAction);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const messagesRef = useRef<AssistantChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [actions, setActions] = useState<{ id: string; tool: string; summary: string; input: string }[]>([]);
  const sentNonce = useRef(0);

  const sendText = async (text: string) => {
    const value = text.trim();
    if (!value || pending) return;
    const next = [...messagesRef.current, { role: "user" as const, content: value }];
    setDraft("");
    setPending(true);
    setError("");
    messagesRef.current = next;
    setMessages(next);
    try {
      const reply = await askFn({ data: { messages: next } });
      if (reply.error) setError(reply.error);
      if (reply.text) {
        const withReply = [...next, { role: "assistant" as const, content: reply.text }];
        messagesRef.current = withReply;
        setMessages(withReply);
      }
      setActions(reply.actions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось спросить ИИ");
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (!seed || sentNonce.current === seed.nonce || pending) return;
    sentNonce.current = seed.nonce;
    void sendText(seed.text);
    // nonce + pending are the triggers; sendText reads messagesRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, pending]);

  const confirmMut = useMutation({
    mutationFn: (action: { id: string; tool: string; summary: string; input: string }) =>
      runFn({ data: { action } }),
    onSuccess: (r) => {
      toast[r.ok ? "success" : "error"](r.message);
      setActions([]);
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-[32rem] flex-col rounded-xl border border-border xl:sticky xl:top-4">
      <div className="border-b border-border px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" />
          Редактор
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Выберите тему слева или напишите сами. Подтверждение сохраняет черновик, не публикует.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {!messages.length && (
          <p className="text-sm text-muted-foreground">
            Например: «Пост про сегодняшнюю погоду» или нажмите «Написать пост» у новости.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={`${m.role}-${i}`} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={`inline-block max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              <ChatText
              text={
                m.role === "user" && m.content.includes("id пульса:")
                  ? `Напиши пост про: ${m.content.match(/Заголовок: (.+)/)?.[1] ?? "пункт пульса"}`
                  : m.content
              }
            />
            </div>
          </div>
        ))}
        {pending ? <p className="text-xs text-muted-foreground">Думаю…</p> : null}
      </div>
      <div className="space-y-3 border-t border-border p-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {actions.map((action) => (
          <div key={action.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
            <p className="min-w-0 flex-1 text-sm">{action.summary}</p>
            <Button size="sm" onClick={() => confirmMut.mutate(action)} disabled={confirmMut.isPending}>
              Добавить в черновики
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Задача редактору или уточнение к теме…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendText(draft);
              }
            }}
          />
          <Button className="self-end" onClick={() => void sendText(draft)} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
