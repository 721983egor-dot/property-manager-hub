import { z } from "zod";

export const N11_CHAT_SOURCE = "n11" as const;

/** Ключ гостя: UUID или уже с префиксом n11: — в БД visitor_key уникален глобально. */
export const n11VisitorKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(80)
  .transform((value) => (value.startsWith("n11:") ? value : `n11:${value}`));

export const n11ChatBodySchema = z.string().trim().min(1, "Введите сообщение").max(2000);

export type N11ChatMessage = {
  id: string;
  direction: "in" | "out";
  body: string;
  created_at: string;
};

const ALLOWED_ORIGINS = [
  "https://n11-residence.ru",
  "https://www.n11-residence.ru",
  "https://preview.residence-more.ru",
  "https://preview-rm-os.residence-more.ru",
  "http://127.0.0.1:43127",
  "http://localhost:43127",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

/** CORS для виджета чата на сайте H11 (отдельный домен). */
export function n11ChatCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") ?? "";
  const allow =
    ALLOWED_ORIGINS.includes(origin) ||
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allow && origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function n11ChatJson(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...n11ChatCorsHeaders(request),
    },
  });
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Найти или создать диалог гостя сайта H11. */
export async function ensureN11Thread(visitorKey: string, firstPage: string) {
  const db = await admin();
  const { data: existing } = await db
    .from("chat_threads")
    .select("id")
    .eq("visitor_key", visitorKey)
    .eq("source", N11_CHAT_SOURCE)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from("chat_threads")
    .insert({
      visitor_key: visitorKey,
      first_page: firstPage.slice(0, 300),
      source: N11_CHAT_SOURCE,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error("Не удалось начать чат");
  return data.id as string;
}

export async function listN11VisitorMessages(visitorKey: string): Promise<N11ChatMessage[]> {
  const db = await admin();
  const { data: thread } = await db
    .from("chat_threads")
    .select("id")
    .eq("visitor_key", visitorKey)
    .eq("source", N11_CHAT_SOURCE)
    .maybeSingle();
  if (!thread) return [];

  const { data: rows } = await db
    .from("chat_messages")
    .select("id, direction, body, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true })
    .limit(200);
  return (rows ?? []) as N11ChatMessage[];
}

export async function sendN11VisitorMessage(input: {
  visitorKey: string;
  body: string;
  page?: string;
  name?: string;
  phone?: string;
}): Promise<N11ChatMessage> {
  const db = await admin();
  const page = (input.page ?? "").trim().slice(0, 300);
  const threadId = await ensureN11Thread(input.visitorKey, page || "https://n11-residence.ru/");

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .eq("direction", "in")
    .gte("created_at", hourAgo);
  if ((count ?? 0) >= 30) {
    throw new Error("Слишком много сообщений. Попробуйте позже или позвоните нам.");
  }

  const { data: row, error } = await db
    .from("chat_messages")
    .insert({ thread_id: threadId, direction: "in", body: input.body })
    .select("id, direction, body, created_at")
    .single();
  if (error) throw new Error("Не удалось отправить сообщение");

  const { data: thread } = await db
    .from("chat_threads")
    .select("unread_count, name, phone, first_page")
    .eq("id", threadId)
    .single();

  const patch: Record<string, unknown> = {
    last_message_at: row.created_at,
    last_visitor_message_at: row.created_at,
    unread_count: (thread?.unread_count ?? 0) + 1,
    status: "open",
  };
  const name = (input.name ?? "").trim().slice(0, 120);
  const phone = (input.phone ?? "").trim().slice(0, 32);
  if (name) patch["name"] = name;
  if (phone) patch["phone"] = phone;
  if (page && !(thread?.first_page ?? "").trim()) patch["first_page"] = page;

  await db.from("chat_threads").update(patch as never).eq("id", threadId);

  return row as N11ChatMessage;
}

/** Сколько непрочитанных диалогов с сайта H11 — для сводки апарт-отеля. */
export async function countN11UnreadChats() {
  const db = await admin();
  const { data, error } = await db
    .from("chat_threads")
    .select("id, unread_count")
    .eq("source", N11_CHAT_SOURCE)
    .gt("unread_count", 0)
    .limit(200);
  if (error) return { threads: 0, messages: 0 };
  const threads = data?.length ?? 0;
  const messages = (data ?? []).reduce((sum, t) => sum + (t.unread_count ?? 0), 0);
  return { threads, messages };
}
