import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Перенос ключей площадок (ЦИАН, Яндекс) на рабочий сервер.
 * Вызывается из среды разработки с токеном deploy-агента.
 */
const bodySchema = z.object({
  keys: z.record(z.string(), z.string().min(4)),
});

function validToken(actual: string, expected: string) {
  const a = createHash("sha256").update(actual).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/system/platform-keys")({
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

        const { setPlatformSecret } = await import("@/lib/platform-secrets.server");
        const saved: string[] = [];
        for (const [name, value] of Object.entries(parsed.data.keys)) {
          if (!/^[A-Z0-9_]+$/.test(name)) continue;
          await setPlatformSecret(name, value);
          saved.push(name);
        }
        return Response.json({ ok: true, saved });
      },
    },
  },
});
