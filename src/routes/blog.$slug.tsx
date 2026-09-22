import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";

import { publicArticleQueryOptions } from "@/lib/public-articles.functions";
import type { SiteArticle } from "@/lib/site-articles";
import { SITE_ORIGIN } from "@/lib/site";
import { SiteLeadForm } from "@/components/site/SiteLeadForm";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ context, params }) => {
    const article = await context.queryClient.ensureQueryData(
      publicArticleQueryOptions(params.slug),
    );
    if (!article) throw notFound();
    return article;
  },
  head: ({ loaderData, params }) => {
    const article = loaderData as SiteArticle | undefined;
    if (!article) return {};
    const title = `${article.seo_title || article.title} — Резиденция&Море`;
    const description = article.seo_description || article.excerpt || article.title;
    const url = `${SITE_ORIGIN}/blog/${params.slug}`;
    const image = article.cover_url || `${SITE_ORIGIN}/og-cover.jpg`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: BlogArticlePage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center font-site">
      <h1 className="text-2xl font-semibold text-site-navy">Статья не найдена</h1>
      <Link to="/blog" className="mt-4 inline-block text-sm font-semibold text-site-navy hover:text-site-gold">
        ← К списку статей
      </Link>
    </div>
  ),
});

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function BlogArticlePage() {
  const { slug } = Route.useParams();
  const { data: article } = useSuspenseQuery(publicArticleQueryOptions(slug));
  if (!article) return null;

  return (
    <div className="font-site">
      <article>
        <header className="relative overflow-hidden bg-site-navy">
          {article.cover_url ? (
            <>
              <img
                src={article.cover_url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-site-navy/92 via-site-navy/75 to-site-navy/45" />
            </>
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--color-site-gold)_0%,_transparent_55%)] opacity-20" />
          )}
          <div className="relative mx-auto max-w-[860px] px-5 py-16 md:px-6 md:py-24">
            <Link
              to="/blog"
              className="text-xs font-semibold uppercase tracking-[0.18em] text-site-gold hover:text-white"
            >
              ← Все статьи
            </Link>
            {article.published_at ? (
              <time className="mt-5 block text-sm text-white/70">{formatDate(article.published_at)}</time>
            ) : null}
            <h1 className="mt-3 text-3xl font-bold leading-[1.15] text-white md:text-5xl">
              {article.title}
            </h1>
            {article.excerpt ? (
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/80 md:text-lg">
                {article.excerpt}
              </p>
            ) : null}
          </div>
        </header>

        <div className="bg-white py-12 md:py-16">
          <div className="mx-auto max-w-[720px] px-5 md:px-6">
            <div
              className={[
                "text-base leading-relaxed text-site-navy/90 md:text-lg",
                "[&_h1]:mt-10 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-site-navy",
                "[&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-site-navy",
                "[&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-site-navy",
                "[&_p]:mt-4 [&_p]:leading-relaxed",
                "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5",
                "[&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5",
                "[&_a]:font-medium [&_a]:text-site-navy [&_a]:underline [&_a]:decoration-site-gold [&_a]:underline-offset-4",
                "[&_blockquote]:mt-4 [&_blockquote]:border-l-2 [&_blockquote]:border-site-gold [&_blockquote]:pl-4 [&_blockquote]:text-site-muted",
                "[&_img]:mt-6 [&_img]:w-full [&_img]:rounded-lg",
                "[&_strong]:font-semibold [&_strong]:text-site-navy",
              ].join(" ")}
            >
              <ReactMarkdown>{article.body}</ReactMarkdown>
            </div>
          </div>
        </div>
      </article>

      <section className="bg-site-navy-soft py-16">
        <div className="mx-auto max-w-[720px] px-5 md:px-6">
          <h2 className="text-2xl font-bold text-site-navy md:text-3xl">Подберём жильё в Сочи</h2>
          <p className="mt-3 text-site-muted">
            Оставьте контакты — расскажем про объекты и условия аренды.
          </p>
          <div className="mt-8">
            <SiteLeadForm source={`blog:${article.slug}`} />
          </div>
        </div>
      </section>
    </div>
  );
}
