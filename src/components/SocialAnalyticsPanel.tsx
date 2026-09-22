import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getSocialHitAnalytics,
  syncSocialStats,
  updateSocialPostHitMeta,
} from "@/lib/social.functions";
import {
  CONTENT_MIX_KEYS,
  CONTENT_MIX_LABEL,
  HIT_TIER_LABEL,
  type ContentMixKey,
  type SocialHitPostRow,
} from "@/lib/social-analytics";
import { platformLabel } from "@/lib/social";

const DAY_OPTIONS = [14, 30, 60] as const;

function scorePct(score: number) {
  return `${Math.round(score * 100)}%`;
}

function tierClass(tier: SocialHitPostRow["tier"]) {
  if (tier === "top") return "bg-emerald-100 text-emerald-900";
  if (tier === "above") return "bg-sky-100 text-sky-900";
  if (tier === "quiet") return "bg-muted text-muted-foreground";
  return "bg-amber-50 text-amber-950";
}

export function SocialAnalyticsPanel() {
  const queryClient = useQueryClient();
  const loadFn = useServerFn(getSocialHitAnalytics);
  const syncFn = useServerFn(syncSocialStats);
  const saveFn = useServerFn(updateSocialPostHitMeta);
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(30);

  const query = useQuery({
    queryKey: ["social-hit-analytics", days],
    queryFn: () => loadFn({ data: { days } }),
  });

  const syncMut = useMutation({
    mutationFn: () => syncFn({ data: undefined }),
    onSuccess: (r) => {
      toast.success(`Статистика: ${r.stats} записей`);
      queryClient.invalidateQueries({ queryKey: ["social-hit-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["social-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (input: {
      postId: string;
      contentMix?: ContentMixKey | null;
      manualHit?: boolean;
      hitNote?: string;
    }) => saveFn({ data: input }),
    onSuccess: () => {
      toast.success("Сохранено");
      queryClient.invalidateQueries({ queryKey: ["social-hit-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["social-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = query.data;
  const top = useMemo(() => data?.rows.slice(0, 12) ?? [], [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <TrendingUp className="size-5 text-primary" />
            Разбор: что «залетело»
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Смешанный сигнал без жёстких порогов: относительный рейтинг по охвату, реакциям и
            proxy-заявкам. Влияет на подсказки тем и микса (1–2 поста в день).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                days === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {d} дн.
            </button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={syncMut.isPending}
            onClick={() => syncMut.mutate()}
          >
            {syncMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Обновить статистику
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Считаем смешанный рейтинг…
        </div>
      ) : query.error ? (
        <p className="text-sm text-destructive">
          {(query.error as Error).message || "Не удалось загрузить разбор"}
        </p>
      ) : data ? (
        <>
          <p className="text-xs text-muted-foreground">
            {data.formulaNote} {data.leadsProxyNote} Постов в разборе: {data.postsAnalyzed}.
          </p>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.mix
              .filter((m) => m.mix !== "other" || m.posts > 0)
              .map((m) => (
                <Card key={m.mix}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{m.label}</CardTitle>
                    <CardDescription>
                      {m.posts} пост.
                      {m.target != null
                        ? ` · цель ~${Math.round(m.target * 100)}%`
                        : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <p className="text-2xl font-semibold tabular-nums">
                      {Math.round(m.share * 100)}%
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      ср. балл {scorePct(m.avgScore)}
                      {m.topPosts ? ` · в топе ${m.topPosts}` : ""}
                    </p>
                  </CardContent>
                </Card>
              ))}
          </div>

          {data.recommendations.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-primary" />
                  Подсказки для календаря / микса
                </CardTitle>
                <CardDescription>
                  Read-only ориентиры. Ассистент может предложить черновик или сохранить метку.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recommendations.map((rec) => (
                  <div key={`${rec.mix}-${rec.reason.slice(0, 24)}`} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-medium">{rec.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{rec.reason}</p>
                    {rec.suggestedTopics.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Темы: {rec.suggestedTopics.join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Рейтинг постов
            </h3>
            {top.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Нет опубликованных постов за период. После публикации и синка Postmypost здесь появится
                разбор.
              </p>
            ) : (
              top.map((row) => (
                <HitPostCard
                  key={`${row.postId}-${row.manualHit}-${row.hitNote}-${row.mix}-${row.mixSource}`}
                  row={row}
                  busy={saveMut.isPending}
                  onSave={(patch) => saveMut.mutate({ postId: row.postId, ...patch })}
                />
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function HitPostCard({
  row,
  busy,
  onSave,
}: {
  row: SocialHitPostRow;
  busy: boolean;
  onSave: (patch: {
    contentMix?: ContentMixKey | null;
    manualHit?: boolean;
    hitNote?: string;
  }) => void;
}) {
  const [note, setNote] = useState(row.hitNote);
  const [mix, setMix] = useState<ContentMixKey | "">(row.mixSource === "manual" ? row.mix : "");

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold leading-snug">{row.topic}</CardTitle>
            <CardDescription className="mt-1">
              {CONTENT_MIX_LABEL[row.mix]}
              {row.mixSource === "inferred" ? " · авто" : " · вручную"}
              {row.propertyTitle ? ` · ${row.propertyTitle}` : ""}
              {row.platforms.length
                ? ` · ${row.platforms.map((p) => platformLabel(p)).join(", ")}`
                : ""}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tierClass(row.tier)}`}>
              {HIT_TIER_LABEL[row.tier]}
            </span>
            <span className="text-sm font-semibold tabular-nums">{scorePct(row.score)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric
            label="Охват"
            value={Math.max(row.reach, row.views).toLocaleString("ru-RU")}
            hint={`${scorePct(row.reachNorm)} от макс.`}
          />
          <Metric
            label="Реакции"
            value={`${row.likes + row.comments + row.shares}`}
            hint={`${row.likes} лайк. · ${row.comments} комм. · ${row.shares} реп. · ${scorePct(row.reactionsNorm)}`}
          />
          <Metric
            label="Заявки (proxy)"
            value={String(row.leadProxy)}
            hint={scorePct(row.leadsNorm)}
          />
          <Metric label="Пометка" value={row.manualHit ? "Залетело" : "—"} hint="вручную" />
        </div>
        <p className="text-xs text-muted-foreground">{row.leadProxyNote}</p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Рубрика</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={mix}
              onChange={(e) => setMix(e.target.value as ContentMixKey | "")}
            >
              <option value="">Авто</option>
              {CONTENT_MIX_KEYS.map((key) => (
                <option key={key} value={key}>
                  {CONTENT_MIX_LABEL[key]}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            variant={row.manualHit ? "default" : "outline"}
            disabled={busy}
            onClick={() => onSave({ manualHit: !row.manualHit })}
          >
            {row.manualHit ? "Снять «залетел»" : "Отметить «залетел»"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              onSave({
                contentMix: mix || null,
                hitNote: note,
              })
            }
          >
            Сохранить рубрику / вывод
          </Button>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Вывод (для себя / Ассистента)</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Почему сработало / что повторить…"
            className="text-sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-2.5 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
