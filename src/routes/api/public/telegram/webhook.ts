import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { webhookSecret } = await import("@/lib/telegram/api.server");
        const expected = await webhookSecret();
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (actual.length !== expected.length || actual !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json()) as { update_id?: number };
        if (typeof update.update_id !== "number") return Response.json({ ok: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("telegram_updates")
          .insert({ update_id: update.update_id });
        // Дубль доставки — уже обработали.
        if (error) return Response.json({ ok: true, duplicate: true });

        try {
          const { handleTelegramUpdate } = await import("@/lib/telegram/assistant.server");
          await handleTelegramUpdate(update as never);
        } catch (e) {
          console.error("telegram update failed", e);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
