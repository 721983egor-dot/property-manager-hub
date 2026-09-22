/** Смешанный KPI «залетел»: охват + реакции + заявки (proxy), без жёстких порогов. */

export const CONTENT_MIX_KEYS = [
  "life_sochi",
  "relocation",
  "property",
  "company",
  "other",
] as const;

export type ContentMixKey = (typeof CONTENT_MIX_KEYS)[number];

export const CONTENT_MIX_LABEL: Record<ContentMixKey, string> = {
  life_sochi: "Жизнь в Сочи",
  relocation: "Переезд",
  property: "Объект",
  company: "Компания",
  other: "Другое",
};

/** Целевой микс из плана (доли старта). */
export const CONTENT_MIX_TARGET: Record<Exclude<ContentMixKey, "other">, number> = {
  life_sochi: 0.3,
  relocation: 0.2,
  property: 0.3,
  company: 0.2,
};

export type HitRelativeTier = "top" | "above" | "mid" | "quiet";

export const HIT_TIER_LABEL: Record<HitRelativeTier, string> = {
  top: "В топе периода",
  above: "Выше среднего",
  mid: "Середина",
  quiet: "Тише остальных",
};

export type SocialHitPostRow = {
  postId: string;
  topic: string;
  status: string;
  publishedAt: string | null;
  propertyId: string | null;
  propertyTitle: string | null;
  mix: ContentMixKey;
  mixSource: "manual" | "inferred";
  platforms: string[];
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  /** Proxy: lead_submit по объекту + сделки с property_id в окне после публикации. */
  leadProxy: number;
  leadProxyNote: string;
  manualHit: boolean;
  hitNote: string;
  /** 0…1 относительный смешанный балл внутри выборки. */
  score: number;
  tier: HitRelativeTier;
  reachNorm: number;
  reactionsNorm: number;
  leadsNorm: number;
};

export type SocialHitMixSlice = {
  mix: ContentMixKey;
  label: string;
  posts: number;
  share: number;
  target: number | null;
  avgScore: number;
  topPosts: number;
};

export type SocialHitRecommendation = {
  mix: ContentMixKey;
  label: string;
  reason: string;
  suggestedTopics: string[];
};

export type SocialHitAnalytics = {
  days: number;
  leadWindowDays: number;
  postsAnalyzed: number;
  formulaNote: string;
  leadsProxyNote: string;
  rows: SocialHitPostRow[];
  mix: SocialHitMixSlice[];
  recommendations: SocialHitRecommendation[];
};

const RELOCATION_RE =
  /переезд|релокац|переехать|как жить|аренда без|документы|регистрац|переезжа/i;
const COMPANY_RE =
  /residence more|резиденс|команда|наш процесс|мы помога|агентств|как мы работа/i;
const LIFE_RE =
  /сочи|погода|афиша|пляж|набережн|событи|новост|район|локальн|жизнь в/i;

export function inferContentMix(input: {
  contentMix?: string | null;
  propertyId?: string | null;
  pulseItemId?: string | null;
  articleId?: string | null;
  topic?: string;
  body?: string;
}): { mix: ContentMixKey; source: "manual" | "inferred" } {
  const manual = input.contentMix?.trim();
  if (manual && (CONTENT_MIX_KEYS as readonly string[]).includes(manual)) {
    return { mix: manual as ContentMixKey, source: "manual" };
  }
  if (input.propertyId) return { mix: "property", source: "inferred" };
  if (input.pulseItemId) return { mix: "life_sochi", source: "inferred" };
  const hay = `${input.topic ?? ""} ${input.body ?? ""}`;
  if (RELOCATION_RE.test(hay)) return { mix: "relocation", source: "inferred" };
  if (COMPANY_RE.test(hay)) return { mix: "company", source: "inferred" };
  if (LIFE_RE.test(hay) || input.articleId) return { mix: "life_sochi", source: "inferred" };
  return { mix: "other", source: "inferred" };
}

/** Сырые компоненты смешанного сигнала (до нормализации). */
export function hitRawComponents(stats: {
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  leadProxy: number;
}) {
  const reachRaw = Math.max(stats.reach, stats.views, 0);
  const reactionsRaw =
    Math.max(stats.likes, 0) + 2 * Math.max(stats.comments, 0) + 3 * Math.max(stats.shares, 0);
  const leadsRaw = Math.max(stats.leadProxy, 0);
  return { reachRaw, reactionsRaw, leadsRaw };
}

function norm(value: number, max: number) {
  if (max <= 0) return 0;
  return value / max;
}

/**
 * Смешанный балл без абсолютных порогов:
 * score = 0.40·охват_n + 0.35·реакции_n + 0.25·заявки_n
 * + мягкий бонус за ручную пометку (не «порог», а сигнал менеджера).
 */
export function scoreHitRows<
  T extends {
    views: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    leadProxy: number;
    manualHit: boolean;
  },
>(
  rows: T[],
): Array<
  T & {
    score: number;
    reachNorm: number;
    reactionsNorm: number;
    leadsNorm: number;
    tier: HitRelativeTier;
  }
> {
  const raws = rows.map((r) => hitRawComponents(r));
  const maxReach = Math.max(0, ...raws.map((r) => r.reachRaw));
  const maxReact = Math.max(0, ...raws.map((r) => r.reactionsRaw));
  const maxLeads = Math.max(0, ...raws.map((r) => r.leadsRaw));

  const scored = rows.map((row, i) => {
    const raw = raws[i]!;
    const reachNorm = norm(raw.reachRaw, maxReach);
    const reactionsNorm = norm(raw.reactionsRaw, maxReact);
    const leadsNorm = norm(raw.leadsRaw, maxLeads);
    let score = 0.4 * reachNorm + 0.35 * reactionsNorm + 0.25 * leadsNorm;
    if (row.manualHit) score = Math.min(1, score + 0.12);
    return { ...row, score, reachNorm, reactionsNorm, leadsNorm, tier: "mid" as HitRelativeTier };
  });

  const order = scored
    .map((row, index) => ({ index, score: row.score }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const rankOf = new Map(order.map((item, rank) => [item.index, rank]));
  const n = scored.length;
  const noSignal = maxReach + maxReact + maxLeads === 0;

  return scored.map((row, index) => {
    const idx = rankOf.get(index) ?? index;
    let tier: HitRelativeTier = "mid";
    if (n <= 1) tier = row.score > 0 ? "top" : "quiet";
    else if (noSignal && !row.manualHit) tier = "quiet";
    else if (idx / Math.max(n - 1, 1) <= 0.2 || idx === 0) tier = "top";
    else if (idx / Math.max(n - 1, 1) <= 0.5) tier = "above";
    else if (idx / Math.max(n - 1, 1) >= 0.8) tier = "quiet";
    else tier = "mid";
    return { ...row, tier };
  });
}

export function buildMixSlices(rows: SocialHitPostRow[]): SocialHitMixSlice[] {
  const byMix = new Map<ContentMixKey, SocialHitPostRow[]>();
  for (const key of CONTENT_MIX_KEYS) byMix.set(key, []);
  for (const row of rows) {
    byMix.get(row.mix)!.push(row);
  }
  const total = rows.length || 1;
  return CONTENT_MIX_KEYS.map((mix) => {
    const list = byMix.get(mix) ?? [];
    const avgScore = list.length
      ? list.reduce((s, r) => s + r.score, 0) / list.length
      : 0;
    const target =
      mix === "other" ? null : (CONTENT_MIX_TARGET[mix as Exclude<ContentMixKey, "other">] ?? null);
    return {
      mix,
      label: CONTENT_MIX_LABEL[mix],
      posts: list.length,
      share: list.length / total,
      target,
      avgScore,
      topPosts: list.filter((r) => r.tier === "top").length,
    };
  });
}

export function buildMixRecommendations(rows: SocialHitPostRow[]): SocialHitRecommendation[] {
  if (!rows.length) {
    return [
      {
        mix: "life_sochi",
        label: CONTENT_MIX_LABEL.life_sochi,
        reason: "Пока мало опубликованных постов со статистикой — начните с локальных тем Сочи.",
        suggestedTopics: ["Погода и сезон", "Район и прогулки", "Афиша выходных"],
      },
    ];
  }

  const slices = buildMixSlices(rows).filter((s) => s.mix !== "other");
  const ranked = [...slices].sort((a, b) => b.avgScore - a.avgScore || b.topPosts - a.topPosts);
  const best = ranked[0];
  const weakHit = ranked.filter((s) => s.posts > 0 && s.avgScore < (best?.avgScore ?? 0) * 0.55);
  const underTarget = slices.filter(
    (s) => s.target != null && s.share + 0.001 < s.target * 0.7 && s.posts < rows.length * s.target!,
  );

  const out: SocialHitRecommendation[] = [];
  if (best && best.posts > 0) {
    out.push({
      mix: best.mix,
      label: best.label,
      reason: `В периоде лучше остальных тянет рубрика «${best.label}» (относительный балл ${(best.avgScore * 100).toFixed(0)}%). Имеет смысл чуть усилить её в календаре при лимите 1–2 поста/день.`,
      suggestedTopics: topicHintsForMix(best.mix, rows),
    });
  }
  for (const s of underTarget.slice(0, 2)) {
    if (out.some((r) => r.mix === s.mix)) continue;
    out.push({
      mix: s.mix,
      label: s.label,
      reason: `Доля «${s.label}» ниже целевого микса (~${Math.round((s.target ?? 0) * 100)}%). Добавьте 1 тему в очередь, если топ не перегружен другой рубрикой.`,
      suggestedTopics: topicHintsForMix(s.mix, rows),
    });
  }
  for (const s of weakHit.slice(0, 1)) {
    if (out.some((r) => r.mix === s.mix)) continue;
    out.push({
      mix: s.mix,
      label: s.label,
      reason: `«${s.label}» публиковали, но относительно охвата/реакций/заявок сигнал слабее — смените угол или формат, не обязательно наращивать частоту.`,
      suggestedTopics: topicHintsForMix(s.mix, rows),
    });
  }
  return out.slice(0, 4);
}

function topicHintsForMix(mix: ContentMixKey, rows: SocialHitPostRow[]) {
  const tops = rows
    .filter((r) => r.mix === mix && (r.tier === "top" || r.tier === "above"))
    .map((r) => r.topic || "Без темы")
    .slice(0, 3);
  if (tops.length) return tops;
  switch (mix) {
    case "life_sochi":
      return ["Утро на набережной", "Что посмотреть в районе", "Погода недели"];
    case "relocation":
      return ["Чек-лист переезда", "Как снять без сюрпризов", "Документы и сроки"];
    case "property":
      return ["Новый объект из каталога", "Видео-тур по квартире", "ЖК и расположение"];
    case "company":
      return ["Как мы подбираем", "За кулисами показа", "Отзыв клиента (с разрешения)"];
    default:
      return ["Свободная тема под запрос"];
  }
}

export const HIT_FORMULA_NOTE =
  "Смешанный балл = 40% относительный охват (reach или views) + 35% реакции (лайки + 2×комменты + 3×репосты) + 25% proxy-заявки. Нормализация внутри выборки периода — без абсолютных порогов. Ручная пометка «залетел» даёт мягкий +0.12 к баллу.";

export const LEADS_PROXY_NOTE =
  "Прямой связки post→lead в CRM нет. Proxy: события lead_submit и сделки с тем же property_id в окне после публикации; иначе 0. Можно отметить пост вручную.";
