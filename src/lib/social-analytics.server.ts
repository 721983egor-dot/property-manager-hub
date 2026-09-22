import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildMixRecommendations,
  buildMixSlices,
  HIT_FORMULA_NOTE,
  LEADS_PROXY_NOTE,
  inferContentMix,
  scoreHitRows,
  type ContentMixKey,
  type SocialHitAnalytics,
  type SocialHitPostRow,
} from "@/lib/social-analytics";
import type { SocialPlatform } from "@/lib/social";

const LEAD_WINDOW_DAYS = 14;

type PostRow = {
  id: string;
  status: string;
  topic: string;
  body: string;
  property_id: string | null;
  pulse_item_id: string | null;
  article_id: string | null;
  content_mix: string | null;
  manual_hit: boolean;
  hit_note: string;
  published_at: string | null;
  created_at: string;
};

type StatsAgg = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
};

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

async function loadPublishedPosts(days: number): Promise<PostRow[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const columnsWithHit =
    "id, status, topic, body, property_id, pulse_item_id, article_id, content_mix, manual_hit, hit_note, published_at, created_at";
  const columnsBase =
    "id, status, topic, body, property_id, pulse_item_id, article_id, published_at, created_at";

  let { data, error } = await supabaseAdmin
    .from("social_posts")
    .select(columnsWithHit)
    .eq("status", "published")
    .or(`published_at.gte.${since},and(published_at.is.null,created_at.gte.${since})`)
    .order("published_at", { ascending: false })
    .limit(120);

  if (error && /content_mix|manual_hit|hit_note/i.test(error.message)) {
    const fallback = await supabaseAdmin
      .from("social_posts")
      .select(columnsBase)
      .eq("status", "published")
      .or(`published_at.gte.${since},and(published_at.is.null,created_at.gte.${since})`)
      .order("published_at", { ascending: false })
      .limit(120);
    data = (fallback.data ?? []).map((row) => ({
      ...row,
      content_mix: null,
      manual_hit: false,
      hit_note: "",
    })) as PostRow[];
    error = fallback.error;
  }
  if (error) throw new Error(error.message);
  return (data ?? []) as PostRow[];
}

async function loadStatsByPost(postIds: string[]): Promise<Map<string, StatsAgg>> {
  const map = new Map<string, StatsAgg>();
  if (!postIds.length) return map;
  const { data, error } = await supabaseAdmin
    .from("social_post_stats")
    .select("post_id, views, likes, comments, shares, reach")
    .in("post_id", postIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const id = String(row.post_id);
    const cur = map.get(id) ?? { views: 0, likes: 0, comments: 0, shares: 0, reach: 0 };
    cur.views += Number(row.views) || 0;
    cur.likes += Number(row.likes) || 0;
    cur.comments += Number(row.comments) || 0;
    cur.shares += Number(row.shares) || 0;
    cur.reach += Number(row.reach) || 0;
    map.set(id, cur);
  }
  return map;
}

async function loadPlatformsByPost(postIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!postIds.length) return map;
  const { data } = await supabaseAdmin
    .from("social_post_targets")
    .select("post_id, platform")
    .in("post_id", postIds);
  for (const row of data ?? []) {
    const id = String(row.post_id);
    const list = map.get(id) ?? [];
    list.push(String(row.platform));
    map.set(id, list);
  }
  return map;
}

async function loadPropertyTitles(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data } = await supabaseAdmin.from("properties").select("id, title, ref_id").in("id", ids);
  for (const row of data ?? []) {
    const title = String(row.title ?? "").trim() || `Объект ${row.ref_id}`;
    map.set(String(row.id), title);
  }
  return map;
}

/** Proxy заявок: lead_submit + deals по property_id в окне после публикации. */
async function loadLeadProxyByProperty(
  posts: { postId: string; propertyId: string | null; publishedAt: string | null; createdAt: string }[],
  windowDays: number,
): Promise<Map<string, { count: number; note: string }>> {
  const result = new Map<string, { count: number; note: string }>();
  const propertyIds = [...new Set(posts.map((p) => p.propertyId).filter(Boolean))] as string[];
  if (!propertyIds.length) return result;

  const minFrom = posts.reduce((min, p) => {
    const iso = p.publishedAt || p.createdAt;
    return !min || iso < min ? iso : min;
  }, "");
  const maxTo = new Date(Date.now() + windowDays * 86400000).toISOString();

  const [{ data: events }, { data: deals }] = await Promise.all([
    supabaseAdmin
      .from("property_events")
      .select("property_id, occurred_at")
      .eq("event_type", "lead_submit")
      .in("property_id", propertyIds)
      .gte("occurred_at", minFrom || new Date(0).toISOString())
      .lte("occurred_at", maxTo),
    supabaseAdmin
      .from("deals")
      .select("property_id, created_at")
      .in("property_id", propertyIds)
      .gte("created_at", minFrom || new Date(0).toISOString())
      .lte("created_at", maxTo),
  ]);

  const eventsByProp = new Map<string, string[]>();
  for (const row of events ?? []) {
    const pid = String(row.property_id);
    const list = eventsByProp.get(pid) ?? [];
    list.push(String(row.occurred_at));
    eventsByProp.set(pid, list);
  }
  const dealsByProp = new Map<string, string[]>();
  for (const row of deals ?? []) {
    if (!row.property_id) continue;
    const pid = String(row.property_id);
    const list = dealsByProp.get(pid) ?? [];
    list.push(String(row.created_at));
    dealsByProp.set(pid, list);
  }

  for (const post of posts) {
    if (!post.propertyId) continue;
    const start = post.publishedAt || post.createdAt;
    const end = addDaysIso(start, windowDays);
    const leads = (eventsByProp.get(post.propertyId) ?? []).filter((t) => t >= start && t <= end).length;
    const dealCount = (dealsByProp.get(post.propertyId) ?? []).filter((t) => t >= start && t <= end).length;
    const count = leads + dealCount;
    const bits: string[] = [];
    if (leads) bits.push(`${leads} заявок с сайта`);
    if (dealCount) bits.push(`${dealCount} сделок`);
    result.set(post.postId, {
      count,
      note: bits.length
        ? `Proxy за ${windowDays} дн. после публикации: ${bits.join(", ")}`
        : `Нет lead_submit/сделок по объекту за ${windowDays} дн. после публикации`,
    });
  }
  return result;
}

export async function loadSocialHitAnalytics(days = 30): Promise<SocialHitAnalytics> {
  const period = Math.min(Math.max(days, 7), 90);
  const posts = await loadPublishedPosts(period);
  const postIds = posts.map((p) => p.id);
  const propertyIds = posts.map((p) => p.property_id).filter(Boolean) as string[];

  const [statsMap, platformsMap, titles, leadMap] = await Promise.all([
    loadStatsByPost(postIds),
    loadPlatformsByPost(postIds),
    loadPropertyTitles(propertyIds),
    loadLeadProxyByProperty(
      posts.map((p) => ({
        postId: p.id,
        propertyId: p.property_id,
        publishedAt: p.published_at,
        createdAt: p.created_at,
      })),
      LEAD_WINDOW_DAYS,
    ),
  ]);

  const base = posts.map((p) => {
    const stats = statsMap.get(p.id) ?? { views: 0, likes: 0, comments: 0, shares: 0, reach: 0 };
    const lead = leadMap.get(p.id);
    const inferred = inferContentMix({
      contentMix: p.content_mix,
      propertyId: p.property_id,
      pulseItemId: p.pulse_item_id,
      articleId: p.article_id,
      topic: p.topic,
      body: p.body,
    });
    return {
      postId: p.id,
      topic: p.topic || p.body.slice(0, 60) || "Без темы",
      status: p.status,
      publishedAt: p.published_at,
      propertyId: p.property_id,
      propertyTitle: p.property_id ? titles.get(p.property_id) ?? null : null,
      mix: inferred.mix,
      mixSource: inferred.source,
      platforms: platformsMap.get(p.id) ?? [],
      views: stats.views,
      reach: stats.reach,
      likes: stats.likes,
      comments: stats.comments,
      shares: stats.shares,
      leadProxy: lead?.count ?? 0,
      leadProxyNote: p.property_id
        ? lead?.note ?? LEADS_PROXY_NOTE
        : "Нет объекта у поста — proxy заявок недоступен; отметьте вручную при необходимости",
      manualHit: Boolean(p.manual_hit),
      hitNote: String(p.hit_note ?? ""),
    };
  });

  const scored = scoreHitRows(base);
  const rows: SocialHitPostRow[] = [...scored].sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic, "ru"));

  return {
    days: period,
    leadWindowDays: LEAD_WINDOW_DAYS,
    postsAnalyzed: rows.length,
    formulaNote: HIT_FORMULA_NOTE,
    leadsProxyNote: LEADS_PROXY_NOTE,
    rows,
    mix: buildMixSlices(rows),
    recommendations: buildMixRecommendations(rows),
  };
}

export async function updateSocialPostHitMeta(input: {
  postId: string;
  contentMix?: ContentMixKey | null;
  manualHit?: boolean;
  hitNote?: string;
}): Promise<void> {
  const postId = input.postId.trim();
  if (!postId) throw new Error("Не указан пост");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.contentMix !== undefined) {
    patch["content_mix"] = input.contentMix;
  }
  if (input.manualHit !== undefined) {
    patch["manual_hit"] = Boolean(input.manualHit);
  }
  if (input.hitNote !== undefined) {
    patch["hit_note"] = String(input.hitNote ?? "").trim().slice(0, 500);
  }

  const { error } = await supabaseAdmin.from("social_posts").update(patch).eq("id", postId);
  if (error) {
    if (/content_mix|manual_hit|hit_note/i.test(error.message)) {
      throw new Error("Нужна миграция аналитики соцсетей (content_mix / manual_hit). Обновите preview.");
    }
    throw new Error(error.message);
  }
}

export function compactHitAnalyticsForAssistant(board: SocialHitAnalytics) {
  return {
    days: board.days,
    postsAnalyzed: board.postsAnalyzed,
    formula: board.formulaNote,
    leadsProxy: board.leadsProxyNote,
    top: board.rows.slice(0, 8).map((r) => ({
      id: r.postId,
      topic: r.topic,
      mix: r.mix,
      tier: r.tier,
      score: Number(r.score.toFixed(3)),
      reach: Math.max(r.reach, r.views),
      reactions: r.likes + r.comments + r.shares,
      leadProxy: r.leadProxy,
      manualHit: r.manualHit,
      hitNote: r.hitNote || undefined,
      property: r.propertyTitle || undefined,
    })),
    mix: board.mix.map((m) => ({
      mix: m.mix,
      posts: m.posts,
      share: Number(m.share.toFixed(2)),
      target: m.target,
      avgScore: Number(m.avgScore.toFixed(3)),
      topPosts: m.topPosts,
    })),
    recommendations: board.recommendations,
  };
}

export type { SocialPlatform };
