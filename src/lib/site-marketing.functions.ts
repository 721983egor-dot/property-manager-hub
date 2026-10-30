import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attributionSchema, sanitizeAttribution } from "./marketing-attribution";

const eventSchema = z.object({
  id: z.string().uuid(),
  eventType: z.enum(["page_view", "phone_click", "telegram_click", "whatsapp_click"]),
  attribution: attributionSchema,
});
export const trackSiteMarketingEvent = createServerFn({ method: "POST" })
  .inputValidator((data: z.input<typeof eventSchema>) => eventSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const attribution = sanitizeAttribution(data.attribution);
    // The public website only. Preview/local tests must never contaminate live reports.
    const host = new URL(attribution.page).hostname;
    if (!["residence-more.ru", "www.residence-more.ru"].includes(host)) return { ok: false };
    const { count, error: countError } = await db
      .from("site_marketing_events")
      .select("id", { count: "exact", head: true })
      .eq("visitor_id", attribution.visitor_id)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if (countError) throw new Error("Аналитика временно недоступна");
    if ((count ?? 0) >= 60) return { ok: false };
    const { error } = await db.from("site_marketing_events").insert({
      id: data.id,
      event_type: data.eventType,
      visitor_id: attribution.visitor_id,
      attribution,
    });
    if (error && error.code !== "23505") throw new Error("Не удалось записать событие");
    return { ok: true };
  });
