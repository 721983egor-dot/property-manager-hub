/** Общая запись входящих сообщений мессенджеров в chat_threads / chat_messages. */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MessengerSource = "telegram" | "max";

function defaultName(source: MessengerSource) {
  return source === "telegram" ? "Клиент Telegram" : "Клиент MAX";
}

function channelLabel(source: MessengerSource) {
  return source === "telegram" ? "Telegram" : "MAX";
}

/** Найти или создать диалог по внешнему id чата/пользователя. */
export async function upsertMessengerThread(input: {
  source: MessengerSource;
  externalId: string;
  name?: string;
  username?: string;
}): Promise<string> {
  const externalId = String(input.externalId).trim();
  if (!externalId) throw new Error("Пустой внешний id чата");

  const visitorKey = `${input.source}:${externalId}`.slice(0, 120);
  const { data: existing } = await supabaseAdmin
    .from("chat_threads")
    .select("id, name")
    .eq("source", input.source)
    .eq("external_id", externalId)
    .maybeSingle();

  const display =
    String(input.name ?? "").trim() ||
    (input.username ? `@${String(input.username).replace(/^@/, "")}` : "") ||
    defaultName(input.source);

  if (existing?.id) {
    const nextName =
      display && display !== defaultName(input.source) ? display : existing.name || display;
    await supabaseAdmin
      .from("chat_threads")
      .update({
        name: nextName,
        status: "open",
        first_page: channelLabel(input.source),
      })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data: thread, error } = await supabaseAdmin
    .from("chat_threads")
    .upsert(
      {
        visitor_key: visitorKey,
        source: input.source,
        external_id: externalId,
        name: display,
        first_page: channelLabel(input.source),
        last_message_at: new Date().toISOString(),
        status: "open",
      },
      { onConflict: "visitor_key" },
    )
    .select("id")
    .single();
  if (error || !thread) {
    throw new Error(error?.message ?? "Не удалось сохранить чат мессенджера");
  }
  return thread.id as string;
}

/** Входящее сообщение клиента → direction=in, рост unread. */
export async function appendInboundMessengerMessage(input: {
  threadId: string;
  externalId: string;
  body: string;
  createdAt?: string;
}): Promise<{ inserted: boolean }> {
  const body = String(input.body ?? "").trim();
  if (!body) return { inserted: false };
  const externalId = String(input.externalId).trim();
  if (!externalId) return { inserted: false };

  const createdAt = input.createdAt || new Date().toISOString();
  const { error } = await supabaseAdmin.from("chat_messages").upsert(
    {
      thread_id: input.threadId,
      external_id: externalId,
      direction: "in",
      body: body.slice(0, 4000),
      created_at: createdAt,
    },
    { onConflict: "thread_id,external_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);

  const { count } = await supabaseAdmin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", input.threadId)
    .eq("direction", "in")
    .is("read_at", null);

  await supabaseAdmin
    .from("chat_threads")
    .update({
      last_message_at: createdAt,
      last_visitor_message_at: createdAt,
      unread_count: count ?? 0,
      status: "open",
    })
    .eq("id", input.threadId);

  return { inserted: true };
}

/** Пометить апдейт обработанным. false = уже был. */
export async function claimMessengerUpdate(
  source: MessengerSource,
  updateId: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin.from("messenger_updates" as never).insert({
    source,
    update_id: String(updateId),
  } as never);
  if (error) {
    // unique violation → дубль
    return false;
  }
  return true;
}

export async function releaseMessengerUpdate(source: MessengerSource, updateId: string) {
  await supabaseAdmin
    .from("messenger_updates" as never)
    .delete()
    .eq("source" as never, source)
    .eq("update_id" as never, String(updateId));
}
