import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { summarizeMarketing, type MarketingRecord } from "./marketing-report";
import { requestScheduleActor } from "./scheduled-actions/actor.server";
export async function marketingReport(days = 30) {
  await requestScheduleActor();
  days = Math.max(1, Math.min(366, Math.floor(days)));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  async function collect(
    table: "site_marketing_events" | "leads" | "chat_threads",
    columns: string,
  ) {
    const rows: MarketingRecord[] = [];
    let truncated = false;
    for (let offset = 0; offset < 10000; offset += 1000) {
      const base =
        table === "chat_threads"
          ? db.from("chat_threads").select(columns, { count: "exact" }).eq("source", "site")
          : db.from(table).select(columns, { count: "exact" });
      const query = base
        .gte("created_at", since)
        .order("created_at")
        .order("id")
        .range(offset, offset + 999);
      const result = await query;
      if (result.error)
        throw new Error("Не удалось загрузить рекламную аналитику: " + result.error.message);
      const batch = (result.data ?? []) as unknown as MarketingRecord[];
      rows.push(...batch);
      truncated = (result.count ?? 0) > rows.length;
      if (!truncated || batch.length === 0) break;
    }
    return { rows, truncated };
  }
  const [events, leads, chats] = await Promise.all([
    collect("site_marketing_events", "attribution,visitor_id,event_type,created_at,id"),
    collect("leads", "attribution,created_at,id"),
    collect("chat_threads", "attribution,created_at,id"),
  ]);
  return {
    days,
    truncated: events.truncated || leads.truncated || chats.truncated,
    ...summarizeMarketing(events.rows, leads.rows, chats.rows),
  };
}
