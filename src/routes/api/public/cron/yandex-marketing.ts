import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/cron/yandex-marketing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const keys = [
          process.env["CRON_SECRET"],
          process.env["LOVABLE_CRON_SECRET"],
          process.env["DEPLOY_AGENT_TOKEN"],
        ].filter((v): v is string => Boolean(v));
        if (!keys.includes(request.headers.get("x-cron-secret") ?? ""))
          return new Response("Unauthorized", { status: 401 });
        try {
          return Response.json(
            await (await import("@/lib/yandex-marketing/service.server")).syncYandexMarketing(),
          );
        } catch {
          return Response.json(
            { ok: false, error: "Не удалось обновить рекламную статистику" },
            { status: 500 },
          );
        }
      },
    },
  },
});
