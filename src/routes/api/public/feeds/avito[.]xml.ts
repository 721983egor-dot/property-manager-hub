import { createFileRoute } from "@tanstack/react-router";

/**
 * XML-фид объектов для автозагрузки Авито.
 * Ссылку на этот адрес один раз вставляют в кабинете Авито Pro («Автозагрузка»),
 * дальше площадка сама забирает файл и обновляет объявления.
 */
export const Route = createFileRoute("/api/public/feeds/avito.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { computeAvitoFeedSelection, buildAvitoFeedXml } = await import(
            "@/lib/avito-feed.server"
          );
          const origin = new URL(request.url).origin;
          const selection = await computeAvitoFeedSelection();
          const xml = buildAvitoFeedXml(selection, origin);
          return new Response(xml, {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=300",
            },
          });
        } catch (e) {
          console.error("Avito feed failed:", e);
          return new Response("Feed unavailable", { status: 500 });
        }
      },
    },
  },
});
