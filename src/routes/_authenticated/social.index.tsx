import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  CalendarClock,
  Copy,
  Loader2,
  Send,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AdminOnly } from "@/components/AdminOnly";
import { ChatText } from "@/components/ChatText";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantChatMessage } from "@/lib/assistant.functions";
import {
  askSocialAssistant,
  cancelSocialPost,
  deleteSocialPost,
  getSocialBoard,
  listPostmypostProjects,
  mapSocialChannel,
  publishSocialPost,
  runSocialAssistantAction,
  saveSocialBrand,
  saveSocialConnection,
  saveSocialPost,
  syncSocialChannels,
  syncSocialStats,
} from "@/lib/social.functions";
import {
  SOCIAL_PLATFORMS,
  PLATFORM_LABEL,
  platformLabel,
  statusLabel,
  type SocialPlatform,
  type SocialPost,
} from "@/lib/social";

export const Route = createFileRoute("/_authenticated/social/")({
  head: () => ({
    meta: [
      { title: "Соцсети — RM OS" },
      {
        name: "description",
        content:
          "Instagram, ВКонтакте, Telegram и Макс: тексты, публикация через Postmypost и статистика.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <SocialPage />
    </AdminOnly>
  ),
});

type Tab = "posts" | "compose" | "ai" | "brand" | "connect";

const TABS: { key: Tab; label: string }[] = [
  { key: "posts", label: "Лента" },
  { key: "compose", label: "Пост" },
  { key: "ai", label: "ИИ" },
  { key: "brand", label: "Голос" },
  { key: "connect", label: "Подключение" },
];

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function SocialPage() {
  const queryClient = useQueryClient();
  const loadBoard = useServerFn(getSocialBoard);
  const [tab, setTab] = useState<Tab>("posts");

  const boardQuery = useQuery({
    queryKey: ["social-board"],
    queryFn: () => loadBoard({ data: undefined }),
  });
  const board = boardQuery.data;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["social-board"] });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <Share2 className="size-7 text-primary" />
            Соцсети
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Instagram, ВКонтакте, Telegram и Макс. Публикация и статистика — через Postmypost.
            ИИ здесь тот же Ассистент RM OS, только в режиме редактора.
          </p>
        </div>
      </header>

      {boardQuery.isLoading ? (
        <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Загружаем ленту…
        </div>
      ) : boardQuery.error ? (
        <p className="mt-6 text-sm text-destructive">
          {(boardQuery.error as Error).message || "Не удалось загрузить раздел. Примените обновление системы с миграцией соцсетей."}
        </p>
      ) : board ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {board.stats.map((row) => (
              <Card key={row.platform}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{PLATFORM_LABEL[row.platform]}</CardTitle>
                  <CardDescription>
                    {board.channels.find((c) => c.platform === row.platform)?.postmypost_account_id
                      ? "Postmypost"
                      : row.platform === "max"
                        ? "Копировать вручную"
                        : "Не подключён"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="text-2xl font-semibold tabular-nums">{row.views.toLocaleString("ru-RU")}</p>
                  <p className="mt-1 text-muted-foreground">
                    просмотры · {row.likes} лайк. · {row.comments} комм.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  tab === item.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {tab === "posts" && <PostsTab boardPosts={board.posts} onChange={refresh} />}
            {tab === "compose" && (
              <ComposeTab
                defaultPlatforms={board.channels.filter((c) => c.enabled).map((c) => c.platform)}
                onSaved={() => {
                  refresh();
                  setTab("posts");
                }}
              />
            )}
            {tab === "ai" && <AiTab onChange={refresh} />}
            {tab === "brand" && (
              <BrandTab
                initial={board.brand}
                skills={board.skills.map((s) => s.text)}
                onSaved={refresh}
              />
            )}
            {tab === "connect" && <ConnectTab board={board} onSaved={refresh} />}
          </div>
        </>
      ) : null}
    </div>
  );
}

function PostsTab({
  boardPosts,
  onChange,
}: {
  boardPosts: SocialPost[];
  onChange: () => void;
}) {
  const publishFn = useServerFn(publishSocialPost);
  const cancelFn = useServerFn(cancelSocialPost);
  const deleteFn = useServerFn(deleteSocialPost);
  const syncFn = useServerFn(syncSocialStats);
  const [filter, setFilter] = useState<"all" | SocialPost["status"]>("all");

  const posts = boardPosts.filter((p) => (filter === "all" ? true : p.status === filter));

  const publishMut = useMutation({
    mutationFn: (id: string) => publishFn({ data: { id, immediate: true } }),
    onSuccess: (r) => {
      toast.success(r.message);
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success(r.message);
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Удалено");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const syncMut = useMutation({
    mutationFn: () => syncFn({ data: undefined }),
    onSuccess: () => {
      toast.success("Статистика обновлена");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "draft", "scheduled", "published", "failed"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {key === "all" ? "Все" : statusLabel(key)}
          </button>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
        >
          {syncMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Обновить статистику
        </Button>
      </div>

      {!posts.length ? (
        <p className="text-sm text-muted-foreground">Постов пока нет — создайте первый или попросите ИИ набросать рубрики.</p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{post.topic || "Без темы"}</CardTitle>
                    <CardDescription>
                      {statusLabel(post.status)}
                      {post.scheduled_at ? ` · ${new Date(post.scheduled_at).toLocaleString("ru-RU")}` : ""}
                      {post.property_title ? ` · ${post.property_title}` : ""}
                      {post.source === "assistant" ? " · ИИ" : ""}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {post.targets.map((t) => (
                      <span
                        key={t.id}
                        className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium"
                      >
                        {platformLabel(t.platform)}
                      </span>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="whitespace-pre-wrap text-sm">{post.body}</p>
                {post.last_error ? <p className="text-sm text-destructive">{post.last_error}</p> : null}
                <div className="flex flex-wrap gap-2">
                  {(post.status === "draft" || post.status === "failed") && (
                    <Button size="sm" onClick={() => publishMut.mutate(post.id)} disabled={publishMut.isPending}>
                      Опубликовать
                    </Button>
                  )}
                  {post.status === "scheduled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelMut.mutate(post.id)}
                      disabled={cancelMut.isPending}
                    >
                      Снять с очереди
                    </Button>
                  )}
                  {post.targets.some((t) => t.platform === "max") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(post.body);
                        toast.success("Текст скопирован для Макс");
                      }}
                    >
                      <Copy className="size-4" />
                      Копировать для Макс
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMut.mutate(post.id)}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ComposeTab({
  defaultPlatforms,
  onSaved,
}: {
  defaultPlatforms: SocialPlatform[];
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveSocialPost);
  const [topic, setTopic] = useState("");
  const [body, setBody] = useState("");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(
    defaultPlatforms.length ? defaultPlatforms : [...SOCIAL_PLATFORMS],
  );
  const [scheduled, setScheduled] = useState("");

  const toggle = (platform: SocialPlatform) => {
    setPlatforms((cur) =>
      cur.includes(platform) ? cur.filter((p) => p !== platform) : [...cur, platform],
    );
  };

  const saveMut = useMutation({
    mutationFn: (publish: boolean) =>
      saveFn({
        data: {
          topic,
          body,
          platforms,
          scheduledAt: fromLocalInput(scheduled),
          publish,
        },
      }),
    onSuccess: () => {
      toast.success("Сохранено");
      setTopic("");
      setBody("");
      setScheduled("");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Новый пост</CardTitle>
        <CardDescription>
          Один текст на все сети. ИИ в соседней вкладке поможет сформулировать и адаптировать.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Тема</Label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Свободная квартира у моря" />
        </div>
        <div className="space-y-2">
          <Label>Текст</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder="Напишите пост или попросите ИИ…"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_PLATFORMS.map((platform) => (
            <button
              key={platform}
              type="button"
              onClick={() => toggle(platform)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                platforms.includes(platform)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {PLATFORM_LABEL[platform]}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CalendarClock className="size-4" />
            Отложить (необязательно)
          </Label>
          <Input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => saveMut.mutate(false)} disabled={saveMut.isPending}>
            Черновик
          </Button>
          <Button onClick={() => saveMut.mutate(true)} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {scheduled ? "В очередь Postmypost" : "Опубликовать"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AiTab({ onChange }: { onChange: () => void }) {
  const askFn = useServerFn(askSocialAssistant);
  const runFn = useServerFn(runSocialAssistantAction);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [actions, setActions] = useState<{ id: string; tool: string; summary: string; input: string }[]>([]);

  const send = async () => {
    const text = draft.trim();
    if (!text || pending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setDraft("");
    setPending(true);
    setError("");
    setMessages(next);
    try {
      const reply = await askFn({ data: { messages: next } });
      if (reply.error) setError(reply.error);
      if (reply.text) setMessages([...next, { role: "assistant", content: reply.text }]);
      setActions(reply.actions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось спросить ИИ");
    } finally {
      setPending(false);
    }
  };

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
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Редактор соцсетей
          </CardTitle>
          <CardDescription>
            Не отдельный бот: тот же Ассистент RM OS, но с голосом бренда, лентой постов и объектами.
            Попросите рубрики на месяц, текст про объект или адаптацию под Instagram и Макс.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-md border border-border p-3">
            {!messages.length && (
              <p className="text-sm text-muted-foreground">
                Например: «Придумай 8 тем на неделю про долгосрочную аренду в Сочи» или «Пост про Карат 1802 для Instagram и VK».
              </p>
            )}
            {messages.map((m, i) => (
              <div key={`${m.role}-${i}`} className={m.role === "user" ? "text-right" : ""}>
                <div
                  className={`inline-block max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  <ChatText text={m.content} />
                </div>
              </div>
            ))}
            {pending ? <p className="text-xs text-muted-foreground">Думаю…</p> : null}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {actions.map((action) => (
            <div key={action.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
              <p className="min-w-0 flex-1 text-sm">{action.summary}</p>
              <Button size="sm" onClick={() => confirmMut.mutate(action)} disabled={confirmMut.isPending}>
                Подтвердить
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Напишите задачу редактору…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Button className="self-end" onClick={() => void send()} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Как учится</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Напишите «запомни: в Instagram не ставим ссылки в текст» — правило сохранится.</p>
          <p>Голос бренда задаётся во вкладке «Голос» и подставляется в каждый ответ.</p>
          <p>Статистика Postmypost подтягивается в ленту, чтобы следующие тексты опирались на то, что уже выходило.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function BrandTab({
  initial,
  skills,
  onSaved,
}: {
  initial: {
    voice: string;
    audience: string;
    hashtags: string;
    forbidden: string;
    cta: string;
    examples: string;
  };
  skills: string[];
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveSocialBrand);
  const [brand, setBrand] = useState(initial);
  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: brand }),
    onSuccess: () => {
      toast.success("Голос бренда сохранён");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Голос бренда</CardTitle>
        <CardDescription>
          Это память редактора. ИИ читает эти поля каждый раз, когда пишет пост.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(
          [
            ["voice", "Как говорим", "Спокойно, по-человечески, без пафоса застройщика"],
            ["audience", "Для кого", "Семьи и пары, которые снимают квартиру в Сочи надолго"],
            ["hashtags", "Хештеги", "#residencemore #сочиаренда"],
            ["forbidden", "Чего не пишем", "Не обещаем «лучшую цену на рынке», не пишем «срочно»"],
            ["cta", "Призыв", "Напишите в директ или оставьте заявку на сайте"],
            ["examples", "Примеры постов, которые нам нравятся", ""],
          ] as const
        ).map(([key, label, placeholder]) => (
          <div key={key} className="space-y-2">
            <Label>{label}</Label>
            <Textarea
              rows={key === "examples" ? 6 : 3}
              value={brand[key]}
              placeholder={placeholder}
              onChange={(e) => setBrand({ ...brand, [key]: e.target.value })}
            />
          </div>
        ))}
        {skills.length ? (
          <div>
            <p className="mb-2 text-sm font-medium">Выученные правила</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {skills.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Сохранить
        </Button>
      </CardContent>
    </Card>
  );
}

function ConnectTab({
  board,
  onSaved,
}: {
  board: {
    connected: boolean;
    projectId: number | null;
    channels: {
      platform: SocialPlatform;
      name: string;
      enabled: boolean;
      postmypost_account_id: number | null;
      last_error: string;
    }[];
    postmypostAccounts: { id: number; name: string; channel: string }[];
  };
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveSocialConnection);
  const projectsFn = useServerFn(listPostmypostProjects);
  const syncFn = useServerFn(syncSocialChannels);
  const mapFn = useServerFn(mapSocialChannel);
  const [token, setToken] = useState("");
  const [projectId, setProjectId] = useState(board.projectId ? String(board.projectId) : "");
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          token: token.trim() || undefined,
          projectId: projectId ? Number(projectId) : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Сохранено");
      setToken("");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const loadProjects = useMutation({
    mutationFn: () => projectsFn({ data: { token: token.trim() || undefined } }),
    onSuccess: (rows) => {
      setProjects(rows);
      if (rows.length === 1) setProjectId(String(rows[0].id));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const syncMut = useMutation({
    mutationFn: () => syncFn({ data: undefined }),
    onSuccess: (r) => {
      toast.success(`Сопоставлено каналов: ${r.matched}`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mapMut = useMutation({
    mutationFn: (input: { platform: SocialPlatform; accountId: number | null }) => mapFn({ data: input }),
    onSuccess: () => {
      toast.success("Канал обновлён");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accountOptions = useMemo(
    () => [{ id: 0, name: "Не выбран", channel: "" }, ...board.postmypostAccounts],
    [board.postmypostAccounts],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Postmypost</CardTitle>
          <CardDescription>
            Токен берётся в кабинете Postmypost → Access Tokens. Проект — тот, где подключены Instagram,
            VK и Telegram. Макс в API Postmypost пока нет: текст копируется в группу, либо привяжите webhook-аккаунт.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API-токен</Label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={board.connected ? "Токен уже сохранён — вставьте новый, чтобы заменить" : "Bearer-токен"}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => loadProjects.mutate()} disabled={loadProjects.isPending}>
              Загрузить проекты
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              Сохранить
            </Button>
          </div>
          {(projects.length > 0 || board.projectId) && (
            <div className="space-y-2">
              <Label>Проект</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Выберите проект</option>
                {(projects.length ? projects : [{ id: board.projectId ?? 0, name: `Проект ${board.projectId}` }]).map(
                  (p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name} ({p.id})
                    </option>
                  ),
                )}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Каналы</CardTitle>
          <CardDescription>Сопоставьте аккаунты Postmypost с сетями Residence More.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            {syncMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Подобрать аккаунты автоматически
          </Button>
          {board.channels.map((channel) => (
            <div key={channel.platform} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center">
              <div className="min-w-[8rem] text-sm font-medium">{PLATFORM_LABEL[channel.platform]}</div>
              <select
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                value={channel.postmypost_account_id ?? 0}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  mapMut.mutate({ platform: channel.platform, accountId: id > 0 ? id : null });
                }}
              >
                {accountOptions.map((a) => (
                  <option key={`${channel.platform}-${a.id}`} value={a.id}>
                    {a.name}
                    {a.channel ? ` · ${a.channel}` : ""}
                  </option>
                ))}
              </select>
              {channel.last_error ? <p className="text-xs text-destructive">{channel.last_error}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
