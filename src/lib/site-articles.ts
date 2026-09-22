/** Длинные материалы на публичный сайт (не зеркало соцпостов). */

export const SITE_ARTICLE_STATUSES = ["draft", "published", "archived"] as const;
export type SiteArticleStatus = (typeof SITE_ARTICLE_STATUSES)[number];

export const SITE_ARTICLE_STATUS_LABEL: Record<SiteArticleStatus, string> = {
  draft: "Черновик",
  published: "Опубликована",
  archived: "В архиве",
};

export type SiteArticle = {
  id: string;
  status: SiteArticleStatus;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  seo_title: string;
  seo_description: string;
  cover_url: string;
  property_id: string | null;
  property_title: string | null;
  published_at: string | null;
  created_by: string;
  source: "manual" | "assistant";
  created_at: string;
  updated_at: string;
};

/** Карточка в списке блога (без полного body). */
export type SiteArticleListItem = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  cover_url: string;
  published_at: string | null;
  seo_title: string;
  seo_description: string;
};

export function articleStatusLabel(value: string) {
  return SITE_ARTICLE_STATUS_LABEL[value as SiteArticleStatus] ?? value;
}

export function articlePublicPath(slug: string) {
  return `/blog/${slug}`;
}
