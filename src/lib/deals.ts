import { supabase } from "@/integrations/supabase/client";

export type DealStageKind = "open" | "won" | "lost";

export type DealStage = {
  id: string;
  name: string;
  color: string;
  position: number;
  kind: DealStageKind;
};

export type DealFieldType = "text" | "number" | "select" | "date" | "checkbox";

export const FIELD_TYPES: { value: DealFieldType; label: string }[] = [
  { value: "text", label: "Текст" },
  { value: "number", label: "Число" },
  { value: "select", label: "Список" },
  { value: "date", label: "Дата" },
  { value: "checkbox", label: "Галочка" },
];

export type DealField = {
  id: string;
  key: string;
  label: string;
  field_type: DealFieldType;
  options: string[];
  position: number;
  show_in_card: boolean;
  archived: boolean;
};

export type Deal = {
  id: string;
  title: string;
  stage_id: string;
  client_id: string | null;
  property_id: string | null;
  lead_id: string | null;
  responsible_id: string | null;
  source: string;
  budget: number | null;
  adults: number;
  children: number;
  comment: string;
  custom: Record<string, unknown>;
  position: number;
  created_at: string;
};

export const DEAL_SOURCES = [
  "Сайт",
  "Авито",
  "ЦИАН",
  "Яндекс Недвижимость",
  "Telegram",
  "WhatsApp",
  "Рекомендация",
  "Звонок",
  "Другое",
];

const DEAL_COLUMNS =
  "id, title, stage_id, client_id, property_id, lead_id, responsible_id, source, budget, adults, children, comment, custom, position, created_at";

/* ---------------- стадии ---------------- */

export async function fetchDealStages(): Promise<DealStage[]> {
  const { data, error } = await supabase
    .from("deal_stages")
    .select("id, name, color, position, kind")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DealStage[];
}

export type StageInput = { name: string; color: string; kind: DealStageKind; position: number };

export async function saveDealStage(id: string | null, input: StageInput) {
  if (id) {
    const { error } = await supabase.from("deal_stages").update(input as never).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("deal_stages")
    .insert(input as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteDealStage(id: string) {
  const { error } = await supabase.from("deal_stages").delete().eq("id", id);
  if (error) throw new Error("Нельзя удалить стадию, пока в ней есть сделки");
}

/* ---------------- поля ---------------- */

export async function fetchDealFields(): Promise<DealField[]> {
  const { data, error } = await supabase
    .from("deal_fields")
    .select("id, key, label, field_type, options, position, show_in_card, archived")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DealField[];
}

export type FieldInput = {
  key: string;
  label: string;
  field_type: DealFieldType;
  options: string[];
  position: number;
  show_in_card: boolean;
  archived: boolean;
};

export async function saveDealField(id: string | null, input: FieldInput) {
  if (id) {
    const { error } = await supabase.from("deal_fields").update(input as never).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("deal_fields")
    .insert(input as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteDealField(id: string) {
  const { error } = await supabase.from("deal_fields").delete().eq("id", id);
  if (error) throw error;
}

/** Ключ поля из названия — латиницей, чтобы удобно фильтровать и анализировать. */
export function slugifyFieldKey(label: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
    й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
    у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
    э: "e", ю: "yu", я: "ya",
  };
  const slug = label
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || `field_${Date.now()}`;
}

/* ---------------- сделки ---------------- */

export async function fetchDeals(): Promise<Deal[]> {
  const { data, error } = await supabase
    .from("deals")
    .select(DEAL_COLUMNS)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((d) => ({
    ...(d as Deal),
    custom: ((d as { custom: unknown }).custom ?? {}) as Record<string, unknown>,
  }));
}

export type DealInput = {
  title: string;
  stage_id: string;
  client_id: string | null;
  property_id: string | null;
  responsible_id: string | null;
  source: string;
  budget: number | null;
  adults: number;
  children: number;
  comment: string;
  custom: Record<string, unknown>;
};

export async function saveDeal(id: string | null, input: DealInput) {
  if (id) {
    const { error } = await supabase.from("deals").update(input as never).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("deals")
    .insert(input as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteDeal(id: string) {
  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) throw error;
}

export async function moveDeal(id: string, stageId: string, position: number) {
  const { error } = await supabase
    .from("deals")
    .update({ stage_id: stageId, position } as never)
    .eq("id", id);
  if (error) throw error;
}

export function formatBudget(value: number | null) {
  return value == null ? "—" : `${value.toLocaleString("ru-RU")} ₽`;
}

export function guestsLabel(adults: number, children: number) {
  const parts: string[] = [];
  if (adults > 0) parts.push(`${adults} взр.`);
  if (children > 0) parts.push(`${children} дет.`);
  return parts.length ? parts.join(" + ") : "—";
}

export function customValueLabel(field: DealField, value: unknown) {
  if (value == null || value === "") return "—";
  if (field.field_type === "checkbox") return value ? "Да" : "Нет";
  if (field.field_type === "number") return Number(value).toLocaleString("ru-RU");
  if (field.field_type === "date") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("ru-RU");
  }
  return String(value);
}
