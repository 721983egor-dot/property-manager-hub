import { createFileRoute } from "@tanstack/react-router";

/** Лёгкая проверка «приложение живо» — используется страницей обновления системы. */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () =>
        {
          try {
            const { telegramCall, webhookSecret } = await import("@/lib/telegram/api.server");
            const expectedUrl = "https://rm-os.residence-more.ru/api/public/telegram/webhook";
            const info = await telegramCall<{ url?: string }>("getWebhookInfo", {});
            if (info.url !== expectedUrl) {
              await telegramCall("setWebhook", {
                url: expectedUrl,
                secret_token: await webhookSecret(),
                allowed_updates: ["message", "edited_message", "callback_query"],
              });
            }
          } catch (error) {
            console.error("Telegram bootstrap during health check failed", error);
          }
          return new Response(JSON.stringify({ ok: true, at: new Date().toISOString() }), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
          });
        },
    },
  },
});
