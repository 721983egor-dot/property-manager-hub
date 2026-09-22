import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Copy, Loader2, Pencil, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { SocialMediaPicker } from "@/components/SocialMediaPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelSocialStory,
  deleteSocialStory,
  draftSocialStoryFromPost,
  publishSocialStory,
  saveSocialStory,
} from "@/lib/social.functions";
import {
  PLATFORM_LABEL,
  SOCIAL_PLATFORMS,
  STORY_PLATFORM_INFO,
  platformLabel,
  statusLabel,
  type SocialPlatform,
  type SocialPost,
  type SocialStory,
} from "@/lib/social";
import { socialMediaDisplayUrl, type SocialMediaItem } from "@/lib/social-media";

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

export function SocialStoriesPanel({
  stories,
  posts,
  defaultPlatforms,
  onChange,
}: {
  stories: SocialStory[];
  posts: SocialPost[];
  defaultPlatforms: SocialPlatform[];
  onChange: () => void;
}) {
  const [mode, setMode] = useState<"list" | "compose">("list");
  const [editing, setEditing] = useState<SocialStory | null>(null);

  if (mode === "compose") {
    return (
      <ComposeStoryTab
        key={editing?.id ?? "new-story"}
        initial={editing}
        posts={posts}
        defaultPlatforms={defaultPlatforms}
        onPublished={() => {
          setEditing(null);
          setMode("list");
          onChange();
        }}
        onDraftSaved={(story) => {
          setEditing(story);
          onChange();
        }}
        onCancel={() => {
          setEditing(null);
          setMode("list");
        }}
      />
    );
  }

  return (
    <StoriesListTab
      stories={stories}
      onChange={onChange}
      onCreate={() => {
        setEditing(null);
        setMode("compose");
      }}
      onEdit={(story) => {
        setEditing(story);
        setMode("compose");
      }}
    />
  );
}

function StoriesListTab({
  stories,
  onChange,
  onCreate,
  onEdit,
}: {
  stories: SocialStory[];
  onChange: () => void;
  onCreate: () => void;
  onEdit: (story: SocialStory) => void;
}) {
  const publishFn = useServerFn(publishSocialStory);
  const cancelFn = useServerFn(cancelSocialStory);
  const deleteFn = useServerFn(deleteSocialStory);
  const [filter, setFilter] = useState<"all" | SocialStory["status"]>("all");

  const list = stories.filter((s) => (filter === "all" ? true : s.status === filter));

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
        <Button size="sm" className="ml-auto" onClick={onCreate}>
          Новая сторис
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Отдельный поток от ленты постов. Instagram и VK — через Postmypost; Telegram — если аккаунт через
        приложение (не бот); Макс — всегда заготовка «опубликовать вручную».
      </p>

      {!list.length ? (
        <p className="text-sm text-muted-foreground">
          Сторис пока нет — создайте сами или сгенерируйте из поста.
        </p>
      ) : (
        <div className="space-y-3">
          {list.map((story) => (
            <Card key={story.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{story.topic || "Без темы"}</CardTitle>
                    <CardDescription>
                      {statusLabel(story.status)}
                      {story.scheduled_at
                        ? ` · ${new Date(story.scheduled_at).toLocaleString("ru-RU")}`
                        : ""}
                      {story.from_post_topic ? ` · из поста «${story.from_post_topic}»` : ""}
                      {story.property_title ? ` · ${story.property_title}` : ""}
                      {story.source === "assistant" ? " · ИИ" : ""}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {story.targets.map((t) => (
                      <span
                        key={t.id}
                        className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium"
                        title={t.last_error || STORY_PLATFORM_INFO[t.platform].hint}
                      >
                        {platformLabel(t.platform)}
                        {t.delivery === "manual" || t.status === "manual_ready" ? " · вручную" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {story.body ? <p className="whitespace-pre-wrap text-sm">{story.body}</p> : null}
                {story.media?.length ? (
                  <div className="flex gap-2 overflow-x-auto">
                    {story.media.map((item) =>
                      item.kind === "video" ? (
                        <video
                          key={item.path}
                          src={item.url || socialMediaDisplayUrl(item.path)}
                          className="h-28 w-16 shrink-0 rounded-md bg-muted object-cover"
                          muted
                        />
                      ) : (
                        <img
                          key={item.path}
                          src={item.url || socialMediaDisplayUrl(item.path)}
                          alt=""
                          className="h-28 w-16 shrink-0 rounded-md bg-muted object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ),
                    )}
                  </div>
                ) : null}
                {story.last_error ? <p className="text-sm text-amber-700 dark:text-amber-400">{story.last_error}</p> : null}
                <div className="flex flex-wrap gap-2">
                  {(story.status === "draft" || story.status === "failed") && (
                    <Button size="sm" variant="outline" onClick={() => onEdit(story)}>
                      <Pencil className="size-4" />
                      Править
                    </Button>
                  )}
                  {(story.status === "draft" || story.status === "failed") && (
                    <Button
                      size="sm"
                      onClick={() => publishMut.mutate(story.id)}
                      disabled={publishMut.isPending}
                    >
                      Опубликовать
                    </Button>
                  )}
                  {story.status === "scheduled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelMut.mutate(story.id)}
                      disabled={cancelMut.isPending}
                    >
                      Снять с очереди
                    </Button>
                  )}
                  {story.targets.some((t) => t.delivery === "manual" || t.status === "manual_ready") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(story.body || story.topic);
                        toast.success("Текст скопирован — опубликуйте сторис вручную в приложении");
                      }}
                    >
                      <Copy className="size-4" />
                      Копировать для ручной публикации
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMut.mutate(story.id)}
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

function ComposeStoryTab({
  initial,
  posts,
  defaultPlatforms,
  onPublished,
  onDraftSaved,
  onCancel,
}: {
  initial?: SocialStory | null;
  posts: SocialPost[];
  defaultPlatforms: SocialPlatform[];
  onPublished: () => void;
  onDraftSaved: (story: SocialStory) => void;
  onCancel: () => void;
}) {
  const saveFn = useServerFn(saveSocialStory);
  const fromPostFn = useServerFn(draftSocialStoryFromPost);
  const [storyId, setStoryId] = useState(initial?.id ?? "");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(
    initial?.targets.length
      ? initial.targets.map((t) => t.platform)
      : defaultPlatforms.length
        ? defaultPlatforms
        : [...SOCIAL_PLATFORMS],
  );
  const [scheduled, setScheduled] = useState(toLocalInput(initial?.scheduled_at ?? null));
  const [media, setMedia] = useState<SocialMediaItem[]>(initial?.media ?? []);
  const [fromPostId, setFromPostId] = useState(initial?.from_post_id ?? "");
  const [propertyId, setPropertyId] = useState(initial?.property_id ?? "");

  const draftPosts = useMemo(
    () => posts.filter((p) => p.status === "draft" || p.status === "published" || p.status === "scheduled"),
    [posts],
  );

  const toggle = (platform: SocialPlatform) => {
    setPlatforms((cur) =>
      cur.includes(platform) ? cur.filter((p) => p !== platform) : [...cur, platform],
    );
  };

  const fromPostMut = useMutation({
    mutationFn: () => {
      if (!fromPostId) throw new Error("Выберите пост");
      return fromPostFn({ data: { postId: fromPostId } });
    },
    onSuccess: (draft) => {
      setTopic(draft.topic);
      setBody(draft.body);
      setFromPostId(draft.fromPostId);
      setPropertyId(draft.propertyId ?? "");
      setMedia(draft.media);
      if (draft.platforms.length) setPlatforms(draft.platforms);
      toast.success(
        draft.media.length
          ? "Сторис из поста: подпись и медиа подтянуты — можно править"
          : "Сторис из поста: добавьте фото или видео",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (publish: boolean) =>
      saveFn({
        data: {
          ...(storyId ? { id: storyId } : {}),
          topic,
          body,
          platforms,
          scheduledAt: fromLocalInput(scheduled),
          publish,
          fromPostId: fromPostId || null,
          propertyId: propertyId || null,
          media: media.map((item) => ({
            path: item.path,
            kind: item.kind,
            mime: item.mime,
            bytes: item.bytes,
            width: item.width,
            height: item.height,
            durationSec: item.durationSec,
          })),
        },
      }),
    onSuccess: (saved, publish) => {
      if (publish) {
        toast.success(saved.last_error || (saved.scheduled_at ? "В очереди Postmypost" : "Отправлено"));
        onPublished();
        return;
      }
      toast.success("Черновик сторис сохранён");
      setStoryId(saved.id);
      onDraftSaved(saved);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editing = Boolean(storyId);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,28rem)_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Черновик сторис" : "Новая сторис"}</CardTitle>
          <CardDescription>
            Создайте сами или сгенерируйте из поста ленты, затем поправьте текст и медиа.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3">
            <Label>Из поста ленты</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={fromPostId}
              onChange={(e) => setFromPostId(e.target.value)}
            >
              <option value="">Без привязки к посту</option>
              {draftPosts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.topic || p.body.slice(0, 48) || p.id.slice(0, 8)} · {statusLabel(p.status)}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!fromPostId || fromPostMut.isPending}
              onClick={() => fromPostMut.mutate()}
            >
              {fromPostMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Сгенерировать из поста
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Тема</Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Короткая тема" />
          </div>
          <div className="space-y-2">
            <Label>Подпись</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Короткий текст для сторис"
            />
          </div>

          <SocialMediaPicker items={media} onChange={(next) => setMedia(next.slice(0, 1))} />
          <p className="text-xs text-muted-foreground">Для сторис — один файл (фото или видео).</p>

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
                title={STORY_PLATFORM_INFO[platform].hint}
              >
                {PLATFORM_LABEL[platform]}
                {STORY_PLATFORM_INFO[platform].delivery === "manual" ? " · вручную" : ""}
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
              {editing ? "Сохранить черновик" : "Черновик"}
            </Button>
            <Button onClick={() => saveMut.mutate(true)} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {scheduled ? "В очередь" : "Опубликовать"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              К списку сторис
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-3">
        <h2 className="text-base font-semibold">Каналы и ограничения</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {SOCIAL_PLATFORMS.map((platform) => (
            <li key={platform} className="rounded-md border border-border/60 px-3 py-2">
              <span className="font-medium text-foreground">{PLATFORM_LABEL[platform]}</span>
              {" — "}
              {STORY_PLATFORM_INFO[platform].hint}
            </li>
          ))}
        </ul>
        {media[0] ? (
          <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
            {media[0].kind === "video" ? (
              <video
                src={media[0].url || socialMediaDisplayUrl(media[0].path)}
                className="mx-auto max-h-[28rem] w-auto"
                controls
              />
            ) : (
              <img
                src={media[0].url || socialMediaDisplayUrl(media[0].path)}
                alt=""
                className="mx-auto max-h-[28rem] w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            )}
            {body ? <p className="border-t border-border px-3 py-2 text-sm">{body}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Добавьте фото или видео — так сторис уйдёт в Postmypost.</p>
        )}
      </div>
    </div>
  );
}
