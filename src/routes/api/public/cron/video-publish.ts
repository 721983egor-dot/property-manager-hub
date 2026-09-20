import { createFileRoute } from "@tanstack/react-router";

/** Повторяет зависшую выкладку на YouTube и VK, если кнопка «Выложить» оборвалась. */
export const Route = createFileRoute("/api/public/cron/video-publish")({
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
          const { processPendingPropertyVideos } = await import("@/lib/video-hosts.server");
          const results = await processPendingPropertyVideos(3);
          return Response.json({ ok: true, results });
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "video-publish failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
