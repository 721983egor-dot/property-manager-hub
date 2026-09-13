import { createFileRoute } from "@tanstack/react-router";

/**
 * Периодическая выгрузка броней апарт-отеля N-11 из Bnovo API v1.
 */
export const Route = createFileRoute("/api/public/cron/bnovo-sync")({
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
          const { syncBnovoBookings } = await import("@/lib/bnovo-sync.server");
          const result = await syncBnovoBookings();
          return Response.json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Bnovo sync failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
