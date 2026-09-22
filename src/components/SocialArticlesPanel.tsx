import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, Pencil, Send, Share2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteSiteArticle,
  draftSocialPostFromArticle,
  publishSiteArticle,
  saveSiteArticle,
  unpublishSiteArticle,
} from "@/lib/social.functions";
import {
  articlePublicPath,
  articleStatusLabel,
  type SiteArticle,
} from "@/lib/site-articles";
import { SITE_ORIGIN } from "@/lib/site";
import type { SocialPost } from "@/lib/social";

export function SocialArticlesPanel({
  articles,
  onChange,
  onPostDrafted,
}: {
  articles: SiteArticle[];
  onChange: () => void;
  /** После «выжимки в соцсеть» — открыть редактор поста. */
  onPostDrafted?: (post: SocialPost) => void;
}) {
  const [mode, setMode] = useState<"list" | "compose">("list");
  const [editing, setEditing] = useState<SiteArticle | null>(null);

  if (mode === "compose") {
    return (
      <ComposeArticleTab
        key={editing?.id ?? "new-article"}
        initial={editing}
        onSaved={(article) => {
          setEditing(article);
          onChange();
        }}
        onPublished={() => {
          setEditing(null);
          setMode("list");
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
    <ArticlesListTab
      articles={articles}
      onChange={onChange}
      {...(onPostDrafted ? { onPostDrafted } : {})}
      onCreate={() => {
        setEditing(null);
        setMode("compose");
      }}
      onEdit={(article) => {
        setEditing(article);
        setMode("compose");
      }}
    />
  );
}

function ArticlesListTab({
  articles,
  onChange,
  onCreate,
  onEdit,
  onPostDrafted,
}: {
  articles: SiteArticle[];
  onChange: () => void;
  onCreate: () => void;
  onEdit: (article: SiteArticle) => void;
  onPostDrafted?: (post: SocialPost) => void;
}) {
  const publishFn = useServerFn(publishSiteArticle);
  const unpublishFn = useServerFn(unpublishSiteArticle);
  const deleteFn = useServerFn(deleteSiteArticle);
  const excerptFn = useServerFn(draftSocialPostFromArticle);
  const [filter, setFilter] = useState<"all" | SiteArticle["status"]>("all");

  const list = useMemo(
    () => articles.filter((a) => (filter === "all" ? true : a.status === filter)),
    [articles, filter],
  );

  const publishMut = useMutation({
    mutationFn: (id: string) => publishFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success(r.message);
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unpublishMut = useMutation({
    mutationFn: (id: string) => unpublishFn({ data: { id } }),
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
  const excerptMut = useMutation({
    mutationFn: (id: string) => excerptFn({ data: { articleId: id } }),
    onSuccess: (post) => {
      toast.success("Черновик поста из статьи создан");
      onChange();
      onPostDrafted?.(post);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "draft", "published", "archived"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                filter === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {key === "all" ? "Все" : articleStatusLabel(key)}
            </button>
          ))}
        </div>
        <Button type="button" onClick={onCreate}>
          Новая статья
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Только крупные материалы на сайт (/blog). Короткие соцпосты сюда не попадают. Выжимка в
        соцсеть — отдельный черновик поста со ссылкой на статью.
      </p>

      {!list.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Пока нет статей</CardTitle>
            <CardDescription>
              Напишите длинный материал про Сочи, переезд или объект — и опубликуйте на сайте.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((article) => (
            <Card key={article.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{article.title || "Без названия"}</CardTitle>
                    <CardDescription className="mt-1">
                      {articleStatusLabel(article.status)}
                      {article.slug ? ` · /blog/${article.slug}` : ""}
                      {article.property_title ? ` · ${article.property_title}` : ""}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => onEdit(article)}>
                      <Pencil className="size-3.5" />
                      Править
                    </Button>
                    {article.status === "published" ? (
                      <>
                        <Button type="button" size="sm" variant="outline" asChild>
                          <a
                            href={`${SITE_ORIGIN}${articlePublicPath(article.slug)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="size-3.5" />
                            На сайте
                          </a>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={excerptMut.isPending}
                          onClick={() => excerptMut.mutate(article.id)}
                        >
                          {excerptMut.isPending ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Share2 className="size-3.5" />
                          )}
                          В соцсеть
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={unpublishMut.isPending}
                          onClick={() => unpublishMut.mutate(article.id)}
                        >
                          Снять
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={publishMut.isPending}
                        onClick={() => publishMut.mutate(article.id)}
                      >
                        {publishMut.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Send className="size-3.5" />
                        )}
                        Опубликовать
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        if (confirm("Удалить статью?")) deleteMut.mutate(article.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {article.excerpt ? (
                <CardContent className="pt-0 text-sm text-muted-foreground line-clamp-2">
                  {article.excerpt}
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ComposeArticleTab({
  initial,
  onSaved,
  onPublished,
  onCancel,
}: {
  initial: SiteArticle | null;
  onSaved: (article: SiteArticle) => void;
  onPublished: () => void;
  onCancel: () => void;
}) {
  const saveFn = useServerFn(saveSiteArticle);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [seoTitle, setSeoTitle] = useState(initial?.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seo_description ?? "");
  const [coverUrl, setCoverUrl] = useState(initial?.cover_url ?? "");

  const saveMut = useMutation({
    mutationFn: (publish: boolean) =>
      saveFn({
        data: {
          ...(initial?.id ? { id: initial.id } : {}),
          title,
          slug,
          excerpt,
          body,
          seoTitle,
          seoDescription,
          coverUrl,
          propertyId: initial?.property_id ?? null,
          publish,
        },
      }),
    onSuccess: (article, publish) => {
      toast.success(publish ? "Статья опубликована" : "Черновик сохранён");
      onSaved(article);
      if (publish) onPublished();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{initial ? "Редактирование статьи" : "Новая статья"}</h2>
          <p className="text-sm text-muted-foreground">
            Markdown в тексте. На сайте — /blog/… После публикации можно сделать выжимку в соцсеть.
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={onCancel}>
          К списку
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div className="grid gap-2">
            <Label htmlFor="article-title">Заголовок</Label>
            <Input
              id="article-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Как жить в Сочи зимой"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="article-slug">Slug (URL)</Label>
              <Input
                id="article-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="zhizn-v-sochi-zimoy"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="article-cover">Обложка (URL)</Label>
              <Input
                id="article-cover"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="article-excerpt">Краткое описание</Label>
            <Textarea
              id="article-excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              placeholder="Для списка и SEO (если пусто — из начала текста)"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="article-body">Текст</Label>
            <Textarea
              id="article-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              className="font-mono text-sm"
              placeholder="Длинный материал. Можно Markdown: заголовки, списки, ссылки."
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="article-seo-title">SEO title</Label>
              <Input
                id="article-seo-title"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                placeholder="По умолчанию = заголовок"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="article-seo-desc">SEO description</Label>
              <Input
                id="article-seo-desc"
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                placeholder="По умолчанию = excerpt"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate(false)}
            >
              {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Сохранить черновик
            </Button>
            <Button type="button" disabled={saveMut.isPending} onClick={() => saveMut.mutate(true)}>
              {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Опубликовать на сайте
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
