import { createFileRoute } from "@tanstack/react-router";

/**
 * Частый опрос входящих сообщений Telegram и MAX для раздела «Чаты».
 * На Бегете внешние вебхуки часто недоступны — боты сами забирают апдейты.
 */
export const Route = createFileRoute("/api/public/cron/messenger-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["CRON_SECRET"] ?? process.env["LOVABLE_CRON_SECRET"] ?? "";
        const deployToken = process.env["DEPLOY_AGENT_TOKEN"] ?? "";
        const provided = request.headers.get("x-cron-secret") ?? "";
        const allowed = [secret, deployToken].filter((s) => s.length > 0);
        if (allowed.length === 0 || !allowed.includes(provided)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { pollMessengerInboxes } = await import("@/lib/messengers/poll.server");
          const result = await pollMessengerInboxes();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("messenger-poll failed", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "poll failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
