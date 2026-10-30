import { attributionSchema, attributionChannel } from "./marketing-attribution";
export type MarketingRecord = { attribution: unknown; visitor_id?: string; event_type?: string };
export function summarizeMarketing(
  events: MarketingRecord[],
  leads: MarketingRecord[],
  chats: MarketingRecord[],
) {
  const groups = new Map<
    string,
    {
      channel: string;
      campaign: string;
      kind: string;
      visitors: Set<string>;
      views: number;
      contactClicks: number;
      leads: number;
      chats: number;
    }
  >();
  let unattributedLeads = 0;
  function group(row: MarketingRecord) {
    const parsed = attributionSchema.safeParse(row.attribution);
    if (!parsed.success) return null;
    const a = parsed.data,
      channel = attributionChannel(a),
      campaign = a.last_touch.utm_campaign || "Без UTM-кампании";
    const key = JSON.stringify([channel, campaign, a.kind]);
    if (!groups.has(key))
      groups.set(key, {
        channel,
        campaign,
        kind: a.kind,
        visitors: new Set(),
        views: 0,
        contactClicks: 0,
        leads: 0,
        chats: 0,
      });
    return { value: groups.get(key)!, attribution: a };
  }
  for (const row of events) {
    const g = group(row);
    if (!g) continue;
    if (row.event_type === "page_view") {
      g.value.views++;
      g.value.visitors.add(g.attribution.visitor_id);
    } else g.value.contactClicks++;
  }
  for (const row of leads) {
    const g = group(row);
    if (g) g.value.leads++;
    else unattributedLeads++;
  }
  for (const row of chats) {
    const g = group(row);
    if (g) g.value.chats++;
  }
  return {
    unattributedLeads,
    rows: [...groups.values()]
      .map(({ visitors, ...g }) => ({ ...g, visitors: visitors.size }))
      .sort((a, b) => b.leads - a.leads || b.visitors - a.visitors),
  };
}
