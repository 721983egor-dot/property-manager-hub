import { createFileRoute } from "@tanstack/react-router";

/**
 * XML-фид объектов для автозагрузки ЦИАН.
 * Ссылку на этот адрес один раз вставляют в кабинете ЦИАН («Автозагрузка»),
 * дальше площадка сама забирает файл и обновляет объявления.
 */
export const Route = createFileRoute("/api/public/feeds/cian.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { computeFeedSelection, buildFeedXml } = await import("@/lib/cian-feed.server");
          const origin = new URL(request.url).origin;
          const selection = await computeFeedSelection();
          const xml = buildFeedXml(selection, origin);
          return new Response(xml, {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              // ЦИАН забирает фид несколько раз в день; кэш на 5 минут
              // защищает базу от лишних запросов.
              "Cache-Control": "public, max-age=300",
            },
          });
        } catch (e) {
          console.error("CIAN feed failed:", e);
          return new Response("Feed unavailable", { status: 500 });
        }
      },
    },
  },
});
