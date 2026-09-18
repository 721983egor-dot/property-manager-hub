import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram-chat/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { telegramChatWebhookSecret, getTelegramChatBotToken } =
          await import("@/lib/messengers/telegram-chat.server");
        const token = await getTelegramChatBotToken();
        if (!token) return new Response("Not configured", { status: 503 });

        const expected = await telegramChatWebhookSecret();
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!expected || actual.length !== expected.length || actual !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json()) as { update_id?: number };
        if (typeof update.update_id !== "number") return Response.json({ ok: true });

        try {
          const { handleTelegramChatUpdate } =
            await import("@/lib/messengers/telegram-chat.server");
          await handleTelegramChatUpdate(update as never);
        } catch (e) {
          console.error("telegram-chat update failed", e);
          return Response.json({ ok: false }, { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
