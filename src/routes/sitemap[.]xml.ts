import { createFileRoute } from "@tanstack/react-router";

import { loadPublicComplexes, loadPublishedProperties } from "@/lib/public-catalog.functions";
import { buildSitemapXml, complexSlug, complexUrl, propertyUrl } from "@/lib/seo";
import { SITE_ORIGIN } from "@/lib/site";

function isoDay(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const [properties, complexes] = await Promise.all([
            loadPublishedProperties(),
            loadPublicComplexes(),
          ]);
          const staticPages = [
            { loc: `${SITE_ORIGIN}/`, changefreq: "daily", priority: "1.0" },
            { loc: `${SITE_ORIGIN}/rent`, changefreq: "daily", priority: "0.9" },
            { loc: `${SITE_ORIGIN}/about`, changefreq: "monthly", priority: "0.5" },
            { loc: `${SITE_ORIGIN}/management`, changefreq: "monthly", priority: "0.5" },
            { loc: `${SITE_ORIGIN}/contacts`, changefreq: "monthly", priority: "0.4" },
          ];
          const complexPages = complexes
            .filter((c) => properties.some((p) => p.complex_id === c.id) || c.show_in_site_filter)
            .map((c) => ({
              loc: complexUrl(complexSlug(c, complexes)),
              lastmod: isoDay(c.updated_at),
              changefreq: "daily",
              priority: "0.8",
            }));
          const propertyPages = properties.map((p) => ({
            loc: propertyUrl(p),
            lastmod: isoDay(p.updated_at),
            changefreq: "daily",
            priority: "0.7",
          }));
          const xml = buildSitemapXml([...staticPages, ...complexPages, ...propertyPages]);
          return new Response(xml, {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=300",
            },
          });
        } catch (error) {
          console.error("Sitemap failed:", error);
          return new Response("Sitemap unavailable", { status: 500 });
        }
      },
    },
  },
});
