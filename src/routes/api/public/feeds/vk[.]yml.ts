import { createFileRoute } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/site";

/**
 * YML-фид объектов аренды для товаров сообщества ВКонтакте.
 * Отдельный от Справочника: в description есть ссылка на карточку,
 * категории названы как аренда/недвижимость, до 10 фото.
 *
 * Документация VK: https://vk.ru/faq21697
 */
export const Route = createFileRoute("/api/public/feeds/vk.yml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const {
            computeSpravochnikFeedSelection,
            buildVkFeedYml,
          } = await import("@/lib/yandex-spravochnik-feed.server");
          // Карточки и фото на публичном домене: preview закрыт паролем страницы.
          const origin = SITE_ORIGIN;
          const selection = await computeSpravochnikFeedSelection();
          const yml = buildVkFeedYml(selection, origin);
          return new Response(yml, {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=300",
            },
          });
        } catch (e) {
          console.error("VK products feed failed:", e);
          return new Response("Feed unavailable", { status: 500 });
        }
      },
    },
  },
});
