import { createServerFn } from "@tanstack/react-start";

export type PropertyEventType =
  | "page_view"
  | "contact_click"
  | "lead_submit"
  | "selection_add";

const EVENT_TYPES: PropertyEventType[] = [
  "page_view",
  "contact_click",
  "lead_submit",
  "selection_add",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Окно дедупликации повторных событий одного посетителя, минут. */
const DEDUPE_MINUTES = 30;

type TrackInput = {
  propertyId: string;
  eventType: PropertyEventType;
  visitorHash?: string;
  referrer?: string;
};

/**
 * Запись анонимного события по объекту с публичного сайта.
 * Без персональных данных: только идентификатор объекта, тип события
 * и случайный идентификатор посетителя из localStorage.
 */
export const trackPropertyEvent = createServerFn({ method: "POST" })
  .inputValidator((input: TrackInput) => {
    if (!input || !UUID_RE.test(input.propertyId)) {
      throw new Error("Некорректный объект");
    }
    if (!EVENT_TYPES.includes(input.eventType)) {
      throw new Error("Некорректный тип события");
    }
    return {
      propertyId: input.propertyId,
      eventType: input.eventType,
      visitorHash: (input.visitorHash ?? "").slice(0, 64),
      referrer: (input.referrer ?? "").slice(0, 300),
    };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.visitorHash) {
      const since = new Date(Date.now() - DEDUPE_MINUTES * 60_000).toISOString();
      const { data: recent } = await supabaseAdmin
        .from("property_events")
        .select("id")
        .eq("property_id", data.propertyId)
        .eq("event_type", data.eventType)
        .eq("visitor_hash", data.visitorHash)
        .gte("occurred_at", since)
        .limit(1);
      if (recent && recent.length > 0) return { ok: true, deduped: true };
    }

    const { error } = await supabaseAdmin.from("property_events").insert({
      property_id: data.propertyId,
      event_type: data.eventType,
      visitor_hash: data.visitorHash,
      referrer: data.referrer,
      source: "site",
    });
    if (error) throw new Error(error.message);
    return { ok: true, deduped: false };
  });

type StatsInput = { propertyId: string; from: string; to: string };

export type DayPoint = {
  date: string;
  page_view: number;
  contact_click: number;
  lead_submit: number;
  selection_add: number;
};

export type PropertyStats = {
  totals: Omit<DayPoint, "date">;
  days: DayPoint[];
};

/** Агрегированная статистика по объекту за период (по дням). */
export const getPropertyStats = createServerFn({ method: "POST" })
  .inputValidator((input: StatsInput) => {
    if (!input || !UUID_RE.test(input.propertyId)) throw new Error("Некорректный объект");
    return { propertyId: input.propertyId, from: input.from, to: input.to };
  })
  .handler(async ({ data }): Promise<PropertyStats> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("property_events")
      .select("event_type, occurred_at")
      .eq("property_id", data.propertyId)
      .gte("occurred_at", `${data.from}T00:00:00.000Z`)
      .lte("occurred_at", `${data.to}T23:59:59.999Z`)
      .order("occurred_at", { ascending: true })
      .limit(50_000);
    if (error) throw new Error(error.message);

    const empty = () => ({ page_view: 0, contact_click: 0, lead_submit: 0, selection_add: 0 });
    const byDay = new Map<string, DayPoint>();

    const start = new Date(`${data.from}T00:00:00.000Z`);
    const end = new Date(`${data.to}T00:00:00.000Z`);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, { date: key, ...empty() });
    }

    const totals = empty();
    for (const row of rows ?? []) {
      const key = String(row.occurred_at).slice(0, 10);
      const type = row.event_type as PropertyEventType;
      const point = byDay.get(key) ?? { date: key, ...empty() };
      point[type] += 1;
      byDay.set(key, point);
      totals[type] += 1;
    }

    return {
      totals,
      days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  });
