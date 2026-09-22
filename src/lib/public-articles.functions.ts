import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { SiteArticle, SiteArticleListItem } from "@/lib/site-articles";

export async function loadPublicArticles(): Promise<SiteArticleListItem[]> {
  const { loadPublishedArticles } = await import("@/lib/site-articles.server");
  return loadPublishedArticles();
}

export async function loadPublicArticle(slug: string): Promise<SiteArticle | null> {
  const { loadPublishedArticleBySlug } = await import("@/lib/site-articles.server");
  return loadPublishedArticleBySlug(slug);
}

export const listPublicArticles = createServerFn({ method: "POST" }).handler(loadPublicArticles);

export const getPublicArticle = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => ({
    slug: String(input?.slug ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    if (!data.slug) return null;
    return loadPublicArticle(data.slug);
  });

export function publicArticlesQueryOptions() {
  return queryOptions({
    queryKey: ["public-articles"],
    queryFn: () => listPublicArticles(),
  });
}

export function publicArticleQueryOptions(slug: string) {
  return queryOptions({
    queryKey: ["public-article", slug],
    queryFn: () => getPublicArticle({ data: { slug } }),
  });
}
