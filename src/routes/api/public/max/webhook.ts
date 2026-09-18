import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/max/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getMaxBotToken, getMaxWebhookSecret, handleMaxUpdate } = await import(
          "@/lib/messengers/max.server"
        );
        const token = await getMaxBotToken();
        if (!token) return new Response("Not configured", { status: 503 });

        const expected = await getMaxWebhookSecret();
        const actual = request.headers.get("X-Max-Bot-Api-Secret") ?? "";
        if (!expected || actual !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json()) as Record<string, unknown>;
        try {
          await handleMaxUpdate(update as never);
        } catch (e) {
          console.error("max update failed", e);
          return Response.json({ ok: false }, { status: 500 });
        }
        // MAX ждёт 200 быстро.
        return Response.json({ ok: true });
      },
    },
  },
});
