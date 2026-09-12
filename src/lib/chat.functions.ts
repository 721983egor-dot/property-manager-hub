import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ChatMessage = {
  id: string;
  direction: "in" | "out";
  body: string;
  created_at: string;
};

export type ChatThread = {
  id: string;
  visitor_key: string;
  name: string;
  phone: string;
  first_page: string;
  status: string;
  unread_count: number;
  last_message_at: string;
  created_at: string;
  last_body: string;
  last_direction: "in" | "out" | null;
  source: "site" | "cian" | "avito";
  external_id: string | null;
  external_offer_id: string | null;
  property_id: string | null;
  property_title: string | null;
};

export type ChatQuickReply = {
  id: string;
  title: string;
  body: string;
  position: number;
};

export function chatSourceLabel(source: ChatThread["source"]) {
  if (source === "cian") return "ЦИАН";
  if (source === "avito") return "Авито";
  return "Сайт";
}

export function chatSourceToDealSource(source: ChatThread["source"]) {
  if (source === "cian") return "ЦИАН";
  if (source === "avito") return "Авито";
  return "Сайт";
}

const visitorKeySchema = z.string().trim().min(8).max(64);
const bodySchema = z.string().trim().min(1, "Введите сообщение").max(2000);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Найти или создать диалог посетителя по ключу из его браузера. */
async function ensureThread(
  db: Awaited<ReturnType<typeof admin>>,
  visitorKey: string,
  firstPage: string,
) {
  const { data: existing } = await db
    .from("chat_threads")
    .select("id")
    .eq("visitor_key", visitorKey)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from("chat_threads")
    .insert({ visitor_key: visitorKey, first_page: firstPage })
    .select("id")
    .single();
  if (error) throw new Error("Не удалось начать чат");
  return data.id as string;
}

/** Публичное: получить свою переписку по ключу посетителя. */
export const fetchVisitorMessages = createServerFn({ method: "POST" })
  .inputValidator((input: { visitorKey: string }) =>
    z.object({ visitorKey: visitorKeySchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: thread } = await db
      .from("chat_threads")
      .select("id")
      .eq("visitor_key", data.visitorKey)
      .maybeSingle();
    if (!thread) return { messages: [] as ChatMessage[] };

    const { data: rows } = await db
      .from("chat_messages")
      .select("id, direction, body, created_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(200);
    return { messages: (rows ?? []) as ChatMessage[] };
  });

/** Публичное: отправить сообщение из чата на сайте. */
export const sendVisitorMessage = createServerFn({ method: "POST" })
  .inputValidator((input: { visitorKey: string; body: string; page?: string }) =>
    z
      .object({
        visitorKey: visitorKeySchema,
        body: bodySchema,
        page: z.string().trim().max(300).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const threadId = await ensureThread(db, data.visitorKey, data.page);

    // Простая защита от флуда: не более 30 сообщений в час с одного ключа.
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
      .insert({ thread_id: threadId, direction: "in", body: data.body })
      .select("id, direction, body, created_at")
      .single();
    if (error) throw new Error("Не удалось отправить сообщение");

    const { data: thread } = await db
      .from("chat_threads")
      .select("unread_count")
      .eq("id", threadId)
      .single();

    await db
      .from("chat_threads")
      .update({
        last_message_at: row.created_at,
        last_visitor_message_at: row.created_at,
        unread_count: (thread?.unread_count ?? 0) + 1,
        status: "open",
      })
      .eq("id", threadId);

    return { message: row as ChatMessage };
  });

/** Оператор: список диалогов. */
export const fetchThreads = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  const { data: threads } = await db
    .from("chat_threads")
    .select(
      "id, visitor_key, name, phone, first_page, status, unread_count, last_message_at, created_at, source, external_id, external_offer_id, property_id",
    )
    .order("last_message_at", { ascending: false })
    .limit(200);

  const list = threads ?? [];
  if (list.length === 0) return { threads: [] as ChatThread[] };

  const propertyIds = [
    ...new Set(list.map((t) => t.property_id).filter((id): id is string => Boolean(id))),
  ];
  const propertyTitle = new Map<string, string>();
  if (propertyIds.length > 0) {
    const { data: properties } = await db
      .from("properties")
      .select("id, title, internal_name")
      .in("id", propertyIds);
    for (const p of properties ?? []) {
      const title = String(p.internal_name ?? "").trim() || String(p.title ?? "").trim();
      if (title) propertyTitle.set(p.id, title);
    }
  }

  const { data: msgs } = await db
    .from("chat_messages")
    .select("thread_id, direction, body, created_at")
    .in(
      "thread_id",
      list.map((t) => t.id),
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  const last = new Map<string, { body: string; direction: "in" | "out" }>();
  for (const m of msgs ?? []) {
    if (!last.has(m.thread_id)) {
      last.set(m.thread_id, { body: m.body, direction: m.direction as "in" | "out" });
    }
  }

  return {
    threads: list.map((t) => ({
      ...t,
      last_body: last.get(t.id)?.body ?? "",
      last_direction: last.get(t.id)?.direction ?? null,
      property_title: t.property_id ? propertyTitle.get(t.property_id) ?? null : null,
    })) as ChatThread[],
  };
});

/** Оператор: вручную обновить входящие чаты ЦИАН. */
export const syncCianChatThreads = createServerFn({ method: "POST" }).handler(async () => {
  const { syncCianChats } = await import("@/lib/cian-chats.server");
  return syncCianChats();
});

/** Оператор: вручную обновить чаты и статистику Авито. */
export const syncAvitoChatThreads = createServerFn({ method: "POST" }).handler(async () => {
  const { syncAvitoChats, syncAvitoListingIds, syncAvitoStats } = await import(
    "@/lib/avito-chats.server"
  );
  try {
    await syncAvitoListingIds();
  } catch {
    // Номера объявлений подтянутся, когда Авито обработает фид.
  }
  const chats = await syncAvitoChats();
  const stats = await syncAvitoStats();
  return { ...chats, synced: stats.synced };
});

/** Оператор: сообщения одного диалога. */
export const fetchThreadMessages = createServerFn({ method: "POST" })
  .inputValidator((input: { threadId: string }) =>
    z.object({ threadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows } = await db
      .from("chat_messages")
      .select("id, direction, body, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true })
      .limit(500);
    return { messages: (rows ?? []) as ChatMessage[] };
  });

/** Оператор: ответить клиенту. */
export const sendOperatorMessage = createServerFn({ method: "POST" })
  .inputValidator((input: { threadId: string; body: string }) =>
    z.object({ threadId: z.string().uuid(), body: bodySchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: thread } = await db
      .from("chat_threads")
      .select("source, external_id")
      .eq("id", data.threadId)
      .maybeSingle();
    if (!thread) throw new Error("Диалог не найден");

    let externalMessageId: string | null = null;
  if (thread.source === "cian") {
    const chatId = Number(thread.external_id);
    if (!Number.isFinite(chatId)) throw new Error("Некорректный номер чата ЦИАН");
    const { sendChatMessage } = await import("@/lib/cian.server");
    externalMessageId = (await sendChatMessage(chatId, data.body)) || null;
  }
  if (thread.source === "avito") {
    const chatId = String(thread.external_id ?? "");
    if (!chatId) throw new Error("Некорректный чат Авито");
    const { sendAvitoMessage } = await import("@/lib/avito.server");
    externalMessageId = (await sendAvitoMessage(chatId, data.body)) || null;
  }
    const { data: row, error } = await db
      .from("chat_messages")
      .insert({
        thread_id: data.threadId,
        direction: "out",
        body: data.body,
        external_id: externalMessageId,
      })
      .select("id, direction, body, created_at")
      .single();
    if (error) throw new Error("Не удалось отправить сообщение");

    await db
      .from("chat_threads")
      .update({ last_message_at: row.created_at, unread_count: 0 })
      .eq("id", data.threadId);

    return { message: row as ChatMessage };
  });

/** Оператор: отметить диалог прочитанным. */
export const markThreadRead = createServerFn({ method: "POST" })
  .inputValidator((input: { threadId: string }) =>
    z.object({ threadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    await db.from("chat_threads").update({ unread_count: 0 }).eq("id", data.threadId);
    await db
      .from("chat_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("thread_id", data.threadId)
      .eq("direction", "in")
      .is("read_at", null);
    return { ok: true as const };
  });

/** Оператор: прочитать все непрочитанные сообщения во всех диалогах. */
export const markAllThreadsRead = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  await db.from("chat_threads").update({ unread_count: 0 }).gt("unread_count", 0);
  await db
    .from("chat_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("direction", "in")
    .is("read_at", null);
  return { ok: true as const };
});

/** Оператор: закрыть или снова открыть диалог. */
export const setThreadStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { threadId: string; status: "open" | "closed" }) =>
    z
      .object({ threadId: z.string().uuid(), status: z.enum(["open", "closed"]) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    await db.from("chat_threads").update({ status: data.status }).eq("id", data.threadId);
    return { ok: true as const };
  });

/** Оператор: удалить диалог. */
export const deleteThread = createServerFn({ method: "POST" })
  .inputValidator((input: { threadId: string }) =>
    z.object({ threadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    await db.from("chat_threads").delete().eq("id", data.threadId);
    return { ok: true as const };
  });

/** Оператор: сохранить имя и телефон клиента в диалоге. */
export const updateThreadContact = createServerFn({ method: "POST" })
  .inputValidator((input: { threadId: string; name: string; phone: string }) =>
    z
      .object({
        threadId: z.string().uuid(),
        name: z.string().trim().max(120),
        phone: z.string().trim().max(32),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    await db
      .from("chat_threads")
      .update({ name: data.name, phone: data.phone })
      .eq("id", data.threadId);
    return { ok: true as const };
  });

/** Оператор: создать сделку из переписки. */
export const createDealFromThread = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      threadId: string;
      name: string;
      phone: string;
      comment?: string;
      budget?: number | null;
      propertyId?: string | null;
    }) =>
      z
        .object({
          threadId: z.string().uuid(),
          name: z.string().trim().min(1, "Укажите имя").max(120),
          phone: z.string().trim().min(5, "Укажите телефон").max(32),
          comment: z.string().trim().max(4000).optional().default(""),
          budget: z.number().nonnegative().nullable().optional(),
          propertyId: z.string().uuid().nullable().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: thread } = await db
      .from("chat_threads")
      .select("source, property_id, name, phone")
      .eq("id", data.threadId)
      .maybeSingle();
    if (!thread) throw new Error("Диалог не найден");

    await db
      .from("chat_threads")
      .update({ name: data.name, phone: data.phone })
      .eq("id", data.threadId);

    const { data: stages } = await db
      .from("deal_stages")
      .select("id, kind, position")
      .order("position", { ascending: true });
    const stage =
      (stages ?? []).find((s) => s.kind === "open") ?? (stages ?? [])[0] ?? null;
    if (!stage) throw new Error("Сначала настройте стадии сделок в CRM");

    const phoneTail = data.phone.replace(/\D/g, "").slice(-10);
    let clientId: string | null = null;
    if (phoneTail) {
      const { data: clients } = await db
        .from("clients")
        .select("id, phone")
        .ilike("phone", `%${phoneTail}%`)
        .limit(5);
      clientId = (clients ?? [])[0]?.id ?? null;
    }
    if (!clientId) {
      const { data: client, error: clientError } = await db
        .from("clients")
        .insert({ full_name: data.name, phone: data.phone })
        .select("id")
        .single();
      if (clientError) throw new Error("Не удалось создать клиента");
      clientId = client.id;
    }

    const propertyId = data.propertyId === undefined ? thread.property_id : data.propertyId;
    const source = chatSourceToDealSource(
      (thread.source as ChatThread["source"]) || "site",
    );

    const { data: msgs } = await db
      .from("chat_messages")
      .select("direction, body")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true })
      .limit(40);
    const transcript = (msgs ?? [])
      .map((m) => `${m.direction === "in" ? "Клиент" : "Мы"}: ${m.body}`)
      .join("\n");
    const commentParts = [data.comment.trim(), transcript ? `Переписка:\n${transcript}` : ""]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 3900);

    const { data: deal, error } = await db
      .from("deals")
      .insert({
        title: `Чат — ${data.name}`,
        stage_id: stage.id,
        client_id: clientId,
        property_id: propertyId,
        source,
        budget: data.budget ?? null,
        comment: commentParts,
      })
      .select("id")
      .single();
    if (error) throw new Error("Не удалось создать сделку");
    return { ok: true as const, dealId: deal.id as string };
  });

/** Быстрые ответы для чата. */
export const fetchQuickReplies = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("chat_quick_replies")
    .select("id, title, body, position")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error("Не удалось загрузить быстрые ответы");
  return { replies: (data ?? []) as ChatQuickReply[] };
});

export const saveQuickReply = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id?: string | null; title: string; body: string; position?: number }) =>
      z
        .object({
          id: z.string().uuid().nullable().optional(),
          title: z.string().trim().min(1, "Укажите название").max(120),
          body: z.string().trim().min(1, "Укажите текст").max(2000),
          position: z.number().int().min(0).max(9999).optional().default(0),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    if (data.id) {
      const { error } = await db
        .from("chat_quick_replies")
        .update({ title: data.title, body: data.body, position: data.position })
        .eq("id", data.id);
      if (error) throw new Error("Не удалось сохранить быстрый ответ");
      return { id: data.id };
    }
    const { data: row, error } = await db
      .from("chat_quick_replies")
      .insert({ title: data.title, body: data.body, position: data.position })
      .select("id")
      .single();
    if (error) throw new Error("Не удалось добавить быстрый ответ");
    return { id: row.id as string };
  });

export const deleteQuickReply = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("chat_quick_replies").delete().eq("id", data.id);
    if (error) throw new Error("Не удалось удалить быстрый ответ");
    return { ok: true as const };
  });

/** Тихая синхронизация площадок — для частого опроса, пока открыт раздел чатов. */
export const syncPlatformChats = createServerFn({ method: "POST" }).handler(async () => {
  const errors: string[] = [];
  let cian = { chats: 0, messages: 0 };
  let avito = { chats: 0, messages: 0 };
  try {
    const { syncCianChats } = await import("@/lib/cian-chats.server");
    cian = await syncCianChats();
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "ЦИАН");
  }
  try {
    const { syncAvitoChats } = await import("@/lib/avito-chats.server");
    avito = await syncAvitoChats();
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Авито");
  }
  return { cian, avito, errors };
});
