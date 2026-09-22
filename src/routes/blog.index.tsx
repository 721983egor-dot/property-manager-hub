import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import {
  publicArticlesQueryOptions,
} from "@/lib/public-articles.functions";
import { SITE_ORIGIN } from "@/lib/site";

export const Route = createFileRoute("/blog/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(publicArticlesQueryOptions());
  },
  head: () => {
    const url = `${SITE_ORIGIN}/blog`;
    const image = `${SITE_ORIGIN}/og-cover.jpg`;
    const title = "Статьи о жизни в Сочи — Резиденция&Море";
    const description =
      "Длинные материалы о Сочи, переезде и аренде от «Резиденция & Море». Не лента соцсетей — только крупные тексты.";
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
  component: BlogIndexPage,
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

function BlogIndexPage() {
  const { data: articles } = useSuspenseQuery(publicArticlesQueryOptions());

  return (
    <div className="font-site">
      <section className="relative overflow-hidden bg-site-navy">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--color-site-gold)_0%,_transparent_55%)] opacity-20" />
        <div className="relative mx-auto max-w-[1280px] px-5 py-20 md:px-6 md:py-28">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
            Резиденция&Море
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.1] text-white md:text-5xl">
            Статьи
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 md:text-lg">
            Большие материалы о Сочи, переезде и жизни у моря — без короткой ленты соцсетей.
          </p>
        </div>
      </section>

      <section className="bg-white py-16 md:py-20">
        <div className="mx-auto max-w-[860px] px-5 md:px-6">
          {!articles.length ? (
            <p className="text-center text-site-muted">Пока нет опубликованных статей.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-site-line">
              {articles.map((article) => (
                <li key={article.id} className="py-8 first:pt-0 last:pb-0">
                  <Link
                    to="/blog/$slug"
                    params={{ slug: article.slug }}
                    className="group block"
                  >
                    {article.published_at ? (
                      <time className="text-xs font-medium uppercase tracking-wider text-site-muted">
                        {formatDate(article.published_at)}
                      </time>
                    ) : null}
                    <h2 className="mt-2 text-2xl font-bold text-site-navy transition-colors group-hover:text-site-gold md:text-3xl">
                      {article.title}
                    </h2>
                    {article.excerpt ? (
                      <p className="mt-3 max-w-2xl leading-relaxed text-site-muted">
                        {article.excerpt}
                      </p>
                    ) : null}
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-site-navy group-hover:text-site-gold">
                      Читать
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
