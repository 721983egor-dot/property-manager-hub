import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { AssistantAction } from "@/lib/ai/types";

export type PropertyRef = { id: string; ref_id: number; title: string };

export const PROPERTY_COLUMNS =
  "id, ref_id, title, internal_name, type, status, address, complex_name, complex_id, rooms, bathrooms, beds_count, area, land_area, floor, total_floors, price_month, seasonal_pricing, summer_price_month, deposit, commission, utilities_month, description, rent_terms, availability_note, photos, published, service_type, management_fee_type, management_fee_value, repair_type, location_description, card_highlights, appliances, extra_features, outdoor_spaces, bathroom_features, created_at, updated_at";

export function propertyLabel(p: { ref_id: number; title: string }) {
  return `${p.ref_id} — ${p.title}`;
}

/** Общий контекст для всех инструментов Ассистента. */
export type AssistantToolContext = {
  admin: typeof supabaseAdmin;
  /** Найти объект по номеру (ref_id) или части названия/адреса. */
  findProperty: (ref: string) => Promise<Record<string, unknown> | null>;
  /** Найти клиента по имени или телефону. */
  findClient: (ref: string) => Promise<Record<string, unknown> | null>;
  /** Зарегистрировать предложенное действие (подтверждает менеджер). */
  propose: (action: { tool: string; summary: string; input: Record<string, unknown> }) => AssistantAction;
};

export function createToolContext(actions: AssistantAction[]): AssistantToolContext {
  return {
    admin: supabaseAdmin,
    findProperty: async (ref: string) => {
      const asNumber = Number(ref);
      if (Number.isFinite(asNumber) && ref.trim() !== "") {
        const { data } = await supabaseAdmin
          .from("properties")
          .select(PROPERTY_COLUMNS)
          .eq("ref_id", asNumber)
          .limit(1);
        if ((data ?? []).length) return (data ?? [])[0] as Record<string, unknown>;
      }
      const clean = (t: string) => t.replace(/[%,()*]/g, "");
      const attempt = async (term: string) => {
        const like = `%${clean(term)}%`;
        const { data } = await supabaseAdmin
          .from("properties")
          .select(PROPERTY_COLUMNS)
          .or(
            `title.ilike.${like},internal_name.ilike.${like},address.ilike.${like},complex_name.ilike.${like}`,
          )
          .limit(1);
        return ((data ?? [])[0] ?? null) as Record<string, unknown> | null;
      };
      const whole = await attempt(ref);
      if (whole) return whole;
      for (const word of ref.split(/[\s,;]+/).filter((w) => w.length >= 3)) {
        const found = await attempt(word);
        if (found) return found;
      }
      return null;
    },

    findClient: async (ref: string) => {
      const term = `%${ref}%`;
      const { data } = await supabaseAdmin
        .from("clients")
        .select("*")
        .or(`full_name.ilike.${term},phone.ilike.${term}`)
        .limit(1);
      return ((data ?? [])[0] ?? null) as Record<string, unknown> | null;
    },
    propose: (action) => {
      const full: AssistantAction = {
        tool: action.tool,
        summary: action.summary,
        input: JSON.stringify(action.input),
        id: `${Date.now()}-${actions.length}`,
      };
      actions.push(full);
      return full;
    },
  };
}
