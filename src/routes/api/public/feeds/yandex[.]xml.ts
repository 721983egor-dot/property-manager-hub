import { createFileRoute } from "@tanstack/react-router";

/**
 * XML-фид объектов для Яндекс Недвижимости (формат YRL).
 * Ссылку на этот адрес один раз вставляют в кабинете Яндекс Недвижимости,
 * дальше площадка сама забирает файл и обновляет объявления.
 */
export const Route = createFileRoute("/api/public/feeds/yandex.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { computeYandexFeedSelection, buildYandexFeedXml } = await import(
            "@/lib/yandex-feed.server"
          );
          const origin = new URL(request.url).origin;
          const selection = await computeYandexFeedSelection();
          const xml = buildYandexFeedXml(selection, origin);
          return new Response(xml, {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              // Яндекс забирает фид периодически; кэш на 5 минут
              // защищает базу от лишних запросов.
              "Cache-Control": "public, max-age=300",
            },
          });
        } catch (e) {
          console.error("Yandex feed failed:", e);
          return new Response("Feed unavailable", { status: 500 });
        }
      },
    },
  },
});
