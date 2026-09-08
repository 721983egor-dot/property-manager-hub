import { createFileRoute } from "@tanstack/react-router";

/** Лёгкая проверка «приложение живо» — используется страницей обновления системы. */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ ok: true, at: new Date().toISOString() }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        }),
    },
  },
});
