import { createFileRoute } from "@tanstack/react-router";

/**
 * Ежедневная синхронизация статистики и сообщений ЦИАН.
 * Вызывается планировщиком с заголовком x-cron-secret.
 */
export const Route = createFileRoute("/api/public/cron/cian-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_CRON_SECRET"] ?? "";
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!secret || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { cianRequest } = await import("@/lib/cian.server");

        const { data: listings, error } = await supabaseAdmin
          .from("property_listings")
          .select("property_id, external_id")
          .eq("platform", "cian")
          .eq("published", true);
        if (error) return new Response(error.message, { status: 500 });

        const to = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);

        let synced = 0;
        const errors: string[] = [];

        for (const row of (listings ?? []) as { property_id: string; external_id: string }[]) {
          if (!row.external_id) continue;
          try {
            const payload = await cianRequest<Record<string, unknown>>(
              "/get-offers-statistics/",
              {
                body: {
                  offerIds: [Number(row.external_id) || row.external_id],
                  dateFrom: from,
                  dateTo: to,
                },
              },
            );
            const rows = Array.isArray(payload["items"])
              ? (payload["items"] as Record<string, unknown>[])
              : Array.isArray(payload["statistics"])
                ? (payload["statistics"] as Record<string, unknown>[])
                : [];
            const toInt = (v: unknown) => {
              const n = Number(v);
              return Number.isFinite(n) ? Math.round(n) : 0;
            };
            const upserts = rows
              .map((r) => ({
                property_id: row.property_id,
                platform: "cian" as const,
                date: String(r["date"] ?? "").slice(0, 10),
                impressions: toInt(r["showsCount"] ?? r["impressions"]),
                views: toInt(r["viewsCount"] ?? r["views"]),
                contact_views: toInt(r["phoneShowsCount"] ?? r["contactViews"]),
                calls: toInt(r["callsCount"] ?? r["calls"]),
                messages: toInt(r["messagesCount"] ?? r["messages"]),
                favorites: toInt(r["favoritesCount"] ?? r["favorites"]),
              }))
              .filter((r) => r.date.length === 10);

            if (upserts.length > 0) {
              await supabaseAdmin
                .from("listing_stats")
                .upsert(upserts, { onConflict: "property_id,platform,date" });
            }
            await supabaseAdmin
              .from("property_listings")
              .update({ last_synced_at: new Date().toISOString(), sync_status: "synced", sync_error: "" })
              .eq("property_id", row.property_id)
              .eq("platform", "cian");
            synced += 1;
          } catch (e) {
            errors.push(e instanceof Error ? e.message : "unknown");
          }
        }

        return Response.json({ ok: true, synced, errors: errors.slice(0, 5) });
      },
    },
  },
});
