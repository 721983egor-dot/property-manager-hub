import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { AssistantAction } from "@/lib/ai/types";

export type PropertyRef = { id: string; ref_id: number; title: string };

/** Полная карточка — только для getPropertyDetails. */
export const PROPERTY_COLUMNS =
  "id, ref_id, title, internal_name, type, status, address, complex_name, complex_id, rooms, bathrooms, beds_count, area, land_area, floor, total_floors, price_month, seasonal_pricing, summer_price_month, deposit, commission, utilities_month, description, rent_terms, availability_note, photos, published, service_type, management_fee_type, management_fee_value, repair_type, location_description, card_highlights, appliances, extra_features, outdoor_spaces, bathroom_features, created_at, updated_at";

/** Лёгкий список для поиска/индекса — без photos и длинных текстов. */
export const PROPERTY_LIST_COLUMNS =
  "id, ref_id, title, internal_name, type, status, address, complex_name, complex_id, rooms, bathrooms, area, floor, total_floors, price_month, deposit, commission, published, service_type, created_at, updated_at";

export function propertyLabel(p: {
  ref_id: number;
  title: string;
  internal_name?: string | null;
}) {
  const internal = String(p.internal_name ?? "").trim();
  return internal
    ? `${internal} (№${p.ref_id})`
    : `${p.ref_id} — ${p.title}`;
}

const SEARCH_STOP_WORDS = new Set(["кв", "квартира", "квт", "корп", "корпус", "дом", "жк", "этаж"]);

/** Латиница, которую часто путают с кириллицей во внутренних кодах (ЛБ2 / LB2, 35к16 / 35k16). */
const LAT_TO_CYR: Record<string, string> = {
  a: "а",
  b: "б",
  c: "с",
  e: "е",
  h: "н",
  k: "к",
  m: "м",
  o: "о",
  p: "р",
  t: "т",
  x: "х",
  y: "у",
};

export function normalizeSearch(value: unknown): string {
  return String(value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

export function compactKey(value: unknown): string {
  return normalizeSearch(value)
    .split("")
    .map((ch) => LAT_TO_CYR[ch] ?? ch)
    .join("")
    .replace(/\s+/g, "");
}

export function significantTokens(query: string): string[] {
  return normalizeSearch(query)
    .split(" ")
    .filter((word) => word.length >= 2 && !SEARCH_STOP_WORDS.has(word));
}

/** Значение для PostgREST `.or()` / `.filter()` — обязательно в кавычках. */
export function postgrestValue(value: string): string {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function propertyOrFilter(term: string): string {
  const like = postgrestValue(`%${term}%`);
  return [
    `title.ilike.${like}`,
    `internal_name.ilike.${like}`,
    `address.ilike.${like}`,
    `complex_name.ilike.${like}`,
    `description.ilike.${like}`,
    `location_description.ilike.${like}`,
  ].join(",");
}

type ScoredProperty = { property: Record<string, unknown>; score: number };

/** Локальный поиск: внутренние имена вроде «Карат 1802» и «ЛБ2 35к16, кв 12». */
export function scoreProperties(
  properties: Record<string, unknown>[],
  query: string,
): ScoredProperty[] {
  const normalizedRef = normalizeSearch(query);
  if (!normalizedRef) {
    return properties.map((property) => ({ property, score: 1 }));
  }
  const queryCompact = compactKey(query);
  const tokens = significantTokens(query);
  const words = tokens.length ? tokens : normalizedRef.split(" ").filter((word) => word.length >= 2);
  return properties
    .map((property) => {
      const internal = String(property["internal_name"] ?? "");
      const internalNorm = normalizeSearch(internal);
      const internalCompact = compactKey(internal);
      const fields = [
        property["title"],
        property["internal_name"],
        property["address"],
        property["complex_name"],
        property["description"],
        property["location_description"],
        property["ref_id"],
      ].map(normalizeSearch);
      const fieldsCompact = fields.map((field) => compactKey(field)).filter(Boolean);
      const tokenIn = (haystack: string) =>
        words.length > 0 && words.every((word) => haystack.includes(word) || haystack.includes(compactKey(word)));

      let score = 0;
      if (queryCompact && internalCompact === queryCompact) score = 8;
      else if (queryCompact.length >= 4 && internalCompact.includes(queryCompact)) score = 7;
      else if (
        queryCompact.length >= 4 &&
        internalCompact.length >= 4 &&
        queryCompact.includes(internalCompact)
      )
        score = 6;
      else if (internalCompact && tokenIn(internalNorm + " " + internalCompact)) score = 5;
      else if (fields.some((field) => field === normalizedRef)) score = 4;
      else if (fields.some((field) => field.includes(normalizedRef)) || fieldsCompact.some((field) => field.includes(queryCompact)))
        score = 3;
      else if (words.length > 0 && words.every((word) => fields.some((field) => field.includes(word))))
        score = 2;
      else if (words.length > 0 && words.some((word) => fields.some((field) => field.includes(word))))
        score = 1;
      return { property, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
}

export async function loadAllProperties(
  admin: typeof supabaseAdmin,
  columns = PROPERTY_LIST_COLUMNS,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  const page = 500;
  for (let from = 0; from < 10000; from += page) {
    const { data, error } = await admin
      .from("properties")
      .select(columns)
      .order("ref_id", { ascending: true })
      .range(from, from + page - 1);
    if (error) {
      console.error("loadAllProperties failed", error.message);
      throw new Error(`Не удалось загрузить объекты: ${error.message}`);
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < page) break;
  }
  return all;
}

/** Режет длинные .in(...) — иначе PostgREST/fetch падает на слишком длинном URL. */
export async function selectInChunks<T extends Record<string, unknown>>(
  table: string,
  columns: string,
  key: string,
  ids: string[],
  chunkSize = 80,
): Promise<T[]> {
  if (!ids.length) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabaseAdmin
      .from(table as never)
      .select(columns)
      .in(key, chunk);
    if (error) {
      console.error(`selectInChunks ${table} failed`, error.message);
      throw new Error(error.message);
    }
    out.push(...((data ?? []) as unknown as T[]));
  }
  return out;
}

/** Общий контекст для всех инструментов Ассистента. */
export type AssistantToolContext = {
  admin: typeof supabaseAdmin;
  /** Все объекты (кэш на один запрос Ассистента). */
  allProperties: () => Promise<Record<string, unknown>[]>;
  /** Найти объект по номеру (ref_id), названию или внутреннему названию. */
  findProperty: (ref: string) => Promise<Record<string, unknown> | null>;
  /** Найти клиента по имени или телефону. */
  findClient: (ref: string) => Promise<Record<string, unknown> | null>;
  /** Зарегистрировать предложенное действие (подтверждает менеджер). */
  propose: (action: {
    tool: string;
    summary: string;
    input: Record<string, unknown>;
  }) => AssistantAction;
};

export function createToolContext(actions: AssistantAction[]): AssistantToolContext {
  let propertyCache: Record<string, unknown>[] | null = null;
  const allProperties = async () => {
    if (!propertyCache) propertyCache = await loadAllProperties(supabaseAdmin);
    return propertyCache;
  };

  return {
    admin: supabaseAdmin,
    allProperties,
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

      const scored = scoreProperties(await allProperties(), ref).filter((row) => row.score >= 2);
      return scored[0]?.property ?? null;
    },

    findClient: async (ref: string) => {
      const needle = String(ref ?? "").trim();
      if (!needle) return null;
      const digits = needle.replace(/\D/g, "");
      const clean = needle.replace(/[%,()*]/g, "");
      const words = normalizeSearch(clean)
        .split(" ")
        .filter((w) => w.length >= 2);
      const parts = [
        `full_name.ilike.%${clean}%`,
        `phone.ilike.%${clean}%`,
        `comment.ilike.%${clean}%`,
      ];
      // По словам: «Сафонов» и «Юрий» по отдельности — клиенты до CRM тоже находятся.
      for (const word of words.slice(0, 4)) {
        parts.push(`full_name.ilike.%${word}%`);
      }
      if (digits.length >= 4) parts.push(`phone.ilike.%${digits.slice(-10)}%`);
      const { data, error } = await supabaseAdmin
        .from("clients")
        .select("*")
        .or(parts.join(","))
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) {
        console.error("findClient failed", error.message);
        return null;
      }
      const rows = (data ?? []) as Record<string, unknown>[];
      if (!rows.length) return null;
      const norm = normalizeSearch(needle);
      const scored = rows
        .map((client) => {
          const name = normalizeSearch(client["full_name"]);
          const phone = String(client["phone"] ?? "").replace(/\D/g, "");
          const comment = normalizeSearch(client["comment"]);
          const nameWords = name.split(" ").filter(Boolean);
          let score = 0;
          if (name === norm) score = 8;
          else if (name.includes(norm) || norm.includes(name)) score = 6;
          else if (
            words.length >= 2 &&
            words.every((w) => nameWords.some((nw) => nw.includes(w) || w.includes(nw)))
          )
            score = 7;
          else if (words.some((w) => name.includes(w))) score = 4;
          else if (digits.length >= 4 && phone.includes(digits.slice(-10))) score = 5;
          else if (comment.includes(norm)) score = 2;
          else score = 1;
          return { client, score };
        })
        .sort((a, b) => b.score - a.score);
      return scored[0]?.client ?? null;
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
