import { createFileRoute } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/site";

/**
 * YML-фид объектов аренды для Яндекс Справочник / Яндекс Бизнес (товары и услуги).
 * Формат YML — не путать с /api/public/feeds/yandex.xml (YRL для Недвижимости).
 *
 * Ссылку вставляют в кабинете: О компании → Товары и услуги → источник YML-фид.
 * Документация: https://yandex.ru/support/business-priority/ru/manage/price-list#yml-fid
 */
export const Route = createFileRoute("/api/public/feeds/yandex-spravochnik.yml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const {
            computeSpravochnikFeedSelection,
            buildSpravochnikFeedYml,
          } = await import("@/lib/yandex-spravochnik-feed.server");
          // Карточки и фото на публичном домене: preview закрыт паролем страницы.
          const origin = SITE_ORIGIN;
          const selection = await computeSpravochnikFeedSelection();
          const yml = buildSpravochnikFeedYml(selection, origin);
          return new Response(yml, {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=300",
            },
          });
        } catch (e) {
          console.error("Yandex Spravochnik feed failed:", e);
          return new Response("Feed unavailable", { status: 500 });
        }
      },
    },
  },
});
