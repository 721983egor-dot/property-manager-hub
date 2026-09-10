import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

function validToken(actual: string, expected: string) {
  return timingSafeEqual(
    createHash("sha256").update(actual).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

export const Route = createFileRoute("/api/public/system/telegram-credentials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const expected = process.env["DEPLOY_AGENT_TOKEN"];
        const authorization = request.headers.get("authorization") ?? "";
        const actual = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
        if (!expected || !actual || !validToken(actual, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const lovableApiKey = process.env["LOVABLE_API_KEY"];
        const telegramApiKey = process.env["TELEGRAM_API_KEY"];
        if (!lovableApiKey || !telegramApiKey) {
          return new Response("Credentials unavailable", { status: 503 });
        }
        return Response.json({ lovableApiKey, telegramApiKey });
      },
    },
  },
});