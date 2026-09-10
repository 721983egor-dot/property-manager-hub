import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const bodySchema = z.object({
  telegramApiKey: z.string().min(1),
  lovableApiKey: z.string().min(1),
});

function validToken(actual: string, expected: string) {
  const actualHash = createHash("sha256").update(actual).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export const Route = createFileRoute("/api/public/system/telegram-bootstrap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["DEPLOY_AGENT_TOKEN"];
        const authorization = request.headers.get("authorization") ?? "";
        const actual = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
        if (!expected || !actual || !validToken(actual, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request", { status: 400 });

        const { saveTelegramRuntimeCredentials } = await import(
          "@/lib/telegram/runtime-credentials.server"
        );
        await saveTelegramRuntimeCredentials(parsed.data);

        const { telegramCall, webhookSecret } = await import("@/lib/telegram/api.server");
        const url = "https://rm-os.residence-more.ru/api/public/telegram/webhook";
        await telegramCall("setWebhook", {
          url,
          secret_token: await webhookSecret(),
          allowed_updates: ["message", "edited_message", "callback_query"],
        });
        return Response.json({ ok: true, url });
      },
    },
  },
});