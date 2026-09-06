import { createFileRoute } from "@tanstack/react-router";

/**
 * Ежедневная синхронизация статистики ЦИАН по связанным объектам.
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
        const { fetchOfferStatsByDays } = await import("@/lib/cian.server");

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
          const offerId = Number(row.external_id);
          if (!row.external_id || !Number.isFinite(offerId)) continue;
          try {
            const days = await fetchOfferStatsByDays(offerId, from, to);
            if (days.length > 0) {
              await supabaseAdmin.from("listing_stats").upsert(
                days.map((d) => ({
                  property_id: row.property_id,
                  platform: "cian" as const,
                  ...d,
                })),
                { onConflict: "property_id,platform,date" },
              );
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
