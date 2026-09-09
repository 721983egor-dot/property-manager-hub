import { supabase } from "@/integrations/supabase/client";
import { markPropertyRented, saveBooking } from "@/lib/bookings";


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
  start_date: string | null;
  end_date: string | null;
  closed_property_id: string | null;
  price_month: number | null;
  deposit: number | null;
  commission: number | null;
  payment_day: number | null;
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
  "id, title, stage_id, client_id, property_id, lead_id, responsible_id, source, budget, adults, children, comment, custom, position, created_at, start_date, end_date, closed_property_id, price_month, deposit, commission, payment_day";


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

/** Превращает заявку с сайта в сделку: находит или создаёт клиента и ставит первую стадию. */
export async function convertLeadToDeal(lead: {
  id: string;
  name: string;
  phone: string;
  topic: string;
  message: string;
}) {
  const stages = await fetchDealStages();
  const stage = stages.find((s) => s.kind === "open") ?? stages[0];
  if (!stage) throw new Error("Сначала настройте стадии сделок");

  let clientId: string | null = null;
  if (lead.phone.trim()) {
    const { data } = await supabase
      .from("clients")
      .select("id")
      .ilike("phone", `%${lead.phone.trim().slice(-10)}%`)
      .limit(1);
    clientId = (data ?? [])[0]?.id ?? null;
  }
  if (!clientId) {
    const { data, error } = await supabase
      .from("clients")
      .insert({ full_name: lead.name || "Клиент с сайта", phone: lead.phone } as never)
      .select("id")
      .single();
    if (error) throw error;
    clientId = (data as { id: string }).id;
  }

  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("deals")
    .insert({
      title: lead.name ? `Заявка — ${lead.name}` : "Заявка с сайта",
      stage_id: stage.id,
      client_id: clientId,
      lead_id: lead.id,
      responsible_id: userData.user?.id ?? null,
      source: "Сайт",
      comment: lead.message,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/* ---------------- комментарии и история ---------------- */

export type DealComment = {
  id: string;
  deal_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
};

export async function fetchDealComments(dealId: string): Promise<DealComment[]> {
  const { data, error } = await supabase
    .from("deal_comments")
    .select("id, deal_id, author_id, author_name, body, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DealComment[];
}

export async function addDealComment(dealId: string, body: string, author: { id: string | null; name: string }) {
  const { error } = await supabase.from("deal_comments").insert({
    deal_id: dealId,
    body: body.trim(),
    author_id: author.id,
    author_name: author.name,
  } as never);
  if (error) throw error;
}

export async function deleteDealComment(id: string) {
  const { error } = await supabase.from("deal_comments").delete().eq("id", id);
  if (error) throw error;
}

export type DealHistoryEntry = {
  id: string;
  action: string;
  actor_email: string;
  created_at: string;
  changes: Record<string, unknown>;
};

export async function fetchDealHistory(dealId: string): Promise<DealHistoryEntry[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, action, actor_email, created_at, changes")
    .eq("table_name", "deals")
    .eq("record_id", dealId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as DealHistoryEntry[];
}

const DEAL_FIELD_LABELS: Record<string, string> = {
  title: "Название",
  stage_id: "Стадия",
  client_id: "Клиент",
  property_id: "Объект",
  responsible_id: "Ответственный",
  source: "Источник",
  budget: "Бюджет",
  adults: "Взрослых",
  children: "Детей",
  comment: "Описание",
  custom: "Дополнительные поля",
  position: "Позиция в канбане",
  start_date: "Дата заезда",
  end_date: "Дата выезда",
  closed_property_id: "Арендованный объект",
  price_month: "Цена в месяц",
  deposit: "Депозит",
  commission: "Комиссия",
  payment_day: "День оплаты",
};


export type ChangeLine = { label: string; from: string; to: string };

/** Человеко-понятное описание записи журнала по сделке. */
export function describeDealChanges(
  entry: DealHistoryEntry,
  resolve: (field: string, value: unknown) => string,
): ChangeLine[] {
  const changes = entry.changes ?? {};
  if (entry.action === "insert") return [];
  const lines: ChangeLine[] = [];
  for (const [key, value] of Object.entries(changes)) {
    if (key === "position" || key === "old" || key === "new") continue;
    const pair = value as { from?: unknown; to?: unknown };
    if (!pair || typeof pair !== "object" || !("to" in pair)) continue;
    lines.push({
      label: DEAL_FIELD_LABELS[key] ?? key,
      from: resolve(key, pair.from),
      to: resolve(key, pair.to),
    });
  }
  return lines;
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/* ---------------- показы объектов ---------------- */

export type DealShowing = {
  id: string;
  deal_id: string;
  property_id: string;
  shown_at: string;
  note: string;
  author_id: string | null;
  author_name: string;
  created_at: string;
};

export async function fetchDealShowings(dealId: string): Promise<DealShowing[]> {
  const { data, error } = await supabase
    .from("deal_showings")
    .select("id, deal_id, property_id, shown_at, note, author_id, author_name, created_at")
    .eq("deal_id", dealId)
    .order("shown_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DealShowing[];
}

export async function addDealShowing(
  dealId: string,
  input: { property_id: string; shown_at: string; note: string },
  author: { id: string | null; name: string },
) {
  const { error } = await supabase.from("deal_showings").insert({
    deal_id: dealId,
    property_id: input.property_id,
    shown_at: input.shown_at,
    note: input.note.trim(),
    author_id: author.id,
    author_name: author.name,
  } as never);
  if (error) throw error;
}

export async function deleteDealShowing(id: string) {
  const { error } = await supabase.from("deal_showings").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- сделки клиента ---------------- */

export async function fetchClientDeals(clientId: string): Promise<Deal[]> {
  const { data, error } = await supabase
    .from("deals")
    .select(DEAL_COLUMNS)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => ({
    ...(d as Deal),
    custom: ((d as { custom: unknown }).custom ?? {}) as Record<string, unknown>,
  }));
}

/* ---------------- успешное закрытие ---------------- */

export type DealWonInput = {
  property_id: string;
  start_date: string;
  end_date: string;
  price_month: number;
  deposit: number;
  commission: number | null;
  payment_day: number;
};

/** Закрывает сделку как успешную: пишет условия, ставит бронь (для управления) и статус «Сдан». */
export async function closeDealAsWon(
  dealId: string,
  stageId: string,
  input: DealWonInput,
  context: { client_id: string | null; service_type: "management" | "commission_only"; source: string },
) {
  const { error } = await supabase
    .from("deals")
    .update({
      stage_id: stageId,
      property_id: input.property_id,
      closed_property_id: input.property_id,
      start_date: input.start_date,
      end_date: input.end_date,
      price_month: input.price_month,
      deposit: input.deposit,
      commission: input.commission,
      payment_day: input.payment_day,
    } as never)
    .eq("id", dealId);
  if (error) throw error;

  if (context.service_type === "management" && context.client_id) {
    await saveBooking(null, {
      property_id: input.property_id,
      client_id: context.client_id,
      start_date: input.start_date,
      end_date: input.end_date,
      price_type: "fixed",
      price_month: input.price_month,
      payment_day: input.payment_day,
      deposit: input.deposit,
      source: null,
      status: "active",
      comment: "Создано из сделки CRM",
      periods: [],
    });
  }

  await markPropertyRented(input.property_id);
}

/* ---------------- показы и сделки по объекту ---------------- */

/** Все показы объекта из сделок — для раздела «Публикация и реклама». */
export async function fetchPropertyShowings(propertyId: string): Promise<DealShowing[]> {
  const { data, error } = await supabase
    .from("deal_showings")
    .select("id, deal_id, property_id, shown_at, note, author_id, author_name, created_at")
    .eq("property_id", propertyId)
    .order("shown_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DealShowing[];
}

/** Сделки, связанные с объектом (текущие и закрытые). */
export async function fetchPropertyDeals(propertyId: string): Promise<Deal[]> {
  const { data, error } = await supabase
    .from("deals")
    .select(DEAL_COLUMNS)
    .or(`property_id.eq.${propertyId},closed_property_id.eq.${propertyId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => ({
    ...(d as Deal),
    custom: ((d as { custom: unknown }).custom ?? {}) as Record<string, unknown>,
  }));
}
