import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slugifyName } from "@/lib/seo";
import {
  type SiteArticle,
  type SiteArticleListItem,
  type SiteArticleStatus,
} from "@/lib/site-articles";

const ARTICLE_COLUMNS =
  "id, status, title, slug, excerpt, body, seo_title, seo_description, cover_url, property_id, published_at, created_by, source, created_at, updated_at";

function mapArticle(
  row: Record<string, unknown>,
  propertyTitle: string | null = null,
): SiteArticle {
  return {
    id: String(row["id"]),
    status: row["status"] as SiteArticleStatus,
    title: String(row["title"] ?? ""),
    slug: String(row["slug"] ?? ""),
    excerpt: String(row["excerpt"] ?? ""),
    body: String(row["body"] ?? ""),
    seo_title: String(row["seo_title"] ?? ""),
    seo_description: String(row["seo_description"] ?? ""),
    cover_url: String(row["cover_url"] ?? ""),
    property_id: (row["property_id"] as string | null) ?? null,
    property_title: propertyTitle,
    published_at: (row["published_at"] as string | null) ?? null,
    created_by: String(row["created_by"] ?? ""),
    source: row["source"] === "assistant" ? "assistant" : "manual",
    created_at: String(row["created_at"]),
    updated_at: String(row["updated_at"]),
  };
}

async function propertyTitles(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await supabaseAdmin
    .from("properties")
    .select("id, title, ref_id")
    .in("id", unique);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const ref = Number(row.ref_id);
    const title = String(row.title ?? "");
    map.set(String(row.id), ref > 0 ? `#${ref} ${title}` : title);
  }
  return map;
}

function normalizeSlugInput(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  const fromTranslit = slugifyName(trimmed);
  if (fromTranslit) return fromTranslit;
  return trimmed
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Уникальный slug: translit + суффикс при коллизии. */
export async function ensureUniqueArticleSlug(baseRaw: string, excludeId?: string): Promise<string> {
  const base = normalizeSlugInput(baseRaw) || "statya";
  let candidate = base;
  for (let i = 0; i < 40; i++) {
    let q = supabaseAdmin.from("site_articles").select("id").eq("slug", candidate).limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function loadSiteArticles(limit = 80): Promise<SiteArticle[]> {
  const { data, error } = await supabaseAdmin
    .from("site_articles")
    .select(ARTICLE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const titles = await propertyTitles(
    rows.map((r) => String(r["property_id"] ?? "")).filter(Boolean),
  );
  return rows.map((row) =>
    mapArticle(row, row["property_id"] ? titles.get(String(row["property_id"])) ?? null : null),
  );
}

export async function loadSiteArticleById(id: string): Promise<SiteArticle | null> {
  const { data, error } = await supabaseAdmin
    .from("site_articles")
    .select(ARTICLE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  const titles = await propertyTitles(row["property_id"] ? [String(row["property_id"])] : []);
  return mapArticle(
    row,
    row["property_id"] ? titles.get(String(row["property_id"])) ?? null : null,
  );
}

export async function loadPublishedArticles(): Promise<SiteArticleListItem[]> {
  const { data, error } = await supabaseAdmin
    .from("site_articles")
    .select("id, title, slug, excerpt, cover_url, published_at, seo_title, seo_description")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    slug: String(row.slug ?? ""),
    excerpt: String(row.excerpt ?? ""),
    cover_url: String(row.cover_url ?? ""),
    published_at: (row.published_at as string | null) ?? null,
    seo_title: String(row.seo_title ?? ""),
    seo_description: String(row.seo_description ?? ""),
  }));
}

export async function loadPublishedArticleBySlug(slug: string): Promise<SiteArticle | null> {
  const wanted = slug.trim().toLowerCase();
  if (!wanted) return null;
  const { data, error } = await supabaseAdmin
    .from("site_articles")
    .select(ARTICLE_COLUMNS)
    .eq("slug", wanted)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  const titles = await propertyTitles(row["property_id"] ? [String(row["property_id"])] : []);
  return mapArticle(
    row,
    row["property_id"] ? titles.get(String(row["property_id"])) ?? null : null,
  );
}

export type SaveSiteArticleInput = {
  id?: string;
  title: string;
  slug?: string;
  excerpt?: string;
  body: string;
  seoTitle?: string;
  seoDescription?: string;
  coverUrl?: string;
  propertyId?: string | null;
  publish?: boolean;
  createdBy?: string;
  source?: "manual" | "assistant";
};

export async function saveSiteArticle(input: SaveSiteArticleInput): Promise<SiteArticle> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("Укажите заголовок статьи");
  if (!body) throw new Error("Текст статьи пустой");

  const publish = Boolean(input.publish);
  const slugSeed = normalizeSlugInput(input.slug ?? "") || title;
  const slug = await ensureUniqueArticleSlug(slugSeed, input.id);

  const excerpt =
    (input.excerpt ?? "").trim() ||
    body
      .replace(/[#>*_`\[\]()]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    title,
    slug,
    excerpt,
    body,
    seo_title: (input.seoTitle ?? "").trim() || title,
    seo_description: (input.seoDescription ?? "").trim() || excerpt.slice(0, 160),
    cover_url: (input.coverUrl ?? "").trim(),
    property_id: input.propertyId || null,
    source: input.source === "assistant" ? "assistant" : "manual",
    updated_at: now,
  };

  if (input.createdBy != null) row["created_by"] = input.createdBy;

  if (publish) {
    row["status"] = "published";
    row["published_at"] = now;
  } else if (!input.id) {
    row["status"] = "draft";
    row["published_at"] = null;
  }

  if (input.id) {
    if (publish) {
      row["status"] = "published";
      const existing = await loadSiteArticleById(input.id);
      if (existing && !existing.published_at) row["published_at"] = now;
      else if (existing?.published_at) row["published_at"] = existing.published_at;
    }
    const { error } = await supabaseAdmin.from("site_articles").update(row as never).eq("id", input.id);
    if (error) throw new Error(error.message);
    const saved = await loadSiteArticleById(input.id);
    if (!saved) throw new Error("Статья не найдена после сохранения");
    return saved;
  }

  const { data, error } = await supabaseAdmin
    .from("site_articles")
    .insert(row as never)
    .select(ARTICLE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return mapArticle(data as unknown as Record<string, unknown>);
}

export async function publishSiteArticle(id: string): Promise<SiteArticle> {
  const article = await loadSiteArticleById(id);
  if (!article) throw new Error("Статья не найдена");
  if (!article.title.trim() || !article.body.trim()) {
    throw new Error("Перед публикацией нужны заголовок и текст");
  }
  if (!article.slug.trim()) {
    throw new Error("Перед публикацией нужен slug");
  }
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("site_articles")
    .update({
      status: "published",
      published_at: article.published_at || now,
      updated_at: now,
    } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
  const saved = await loadSiteArticleById(id);
  if (!saved) throw new Error("Статья не найдена");
  return saved;
}

export async function unpublishSiteArticle(id: string): Promise<SiteArticle> {
  const { error } = await supabaseAdmin
    .from("site_articles")
    .update({
      status: "draft",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
  const saved = await loadSiteArticleById(id);
  if (!saved) throw new Error("Статья не найдена");
  return saved;
}

export async function archiveSiteArticle(id: string): Promise<SiteArticle> {
  const { error } = await supabaseAdmin
    .from("site_articles")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
  const saved = await loadSiteArticleById(id);
  if (!saved) throw new Error("Статья не найдена");
  return saved;
}

export async function deleteSiteArticle(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("site_articles").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Короткая выжимка статьи → черновик соцпоста (тело), без авто-публикации. */
export function buildSocialExcerptFromArticle(article: SiteArticle): {
  topic: string;
  body: string;
  articleId: string;
  propertyId: string | null;
} {
  const plain = article.body
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`]/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const hook = article.excerpt.trim() || plain.slice(0, 220);
  const linkLine = `Читать на сайте: https://residence-more.ru/blog/${article.slug}`;
  const body = `${hook}\n\n${linkLine}`.trim();
  return {
    topic: article.title.slice(0, 120),
    body,
    articleId: article.id,
    propertyId: article.property_id,
  };
}
