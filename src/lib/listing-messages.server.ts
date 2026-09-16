/** История сообщений ЦИАН и Авито по объекту: API площадок + уже сохранённые чаты RM OS. */

export type PlatformMessage = {
  id: string;
  author: string;
  direction: string;
  body: string;
  sent_at: string;
};

type ChatPlatform = "avito" | "cian";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function inRange(iso: string, from?: string, to?: string) {
  if (!from && !to) return true;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** Подтягивает чаты ЦИАН по объявлению в listing_messages. */
export async function pullCianListingMessages(propertyId: string): Promise<{ error: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: listing } = await supabaseAdmin
    .from("property_listings")
    .select("external_id")
    .eq("property_id", propertyId)
    .eq("platform", "cian")
    .maybeSingle();
  const externalId = String(asRecord(listing).external_id ?? "");
  const offerId = Number(externalId);
  if (!externalId || !Number.isFinite(offerId)) {
    return { error: "Объект не связан с объявлением на ЦИАН" };
  }

  try {
    const { fetchChats, fetchChatMessages } = await import("@/lib/cian.server");
    const chats = (await fetchChats()).filter((chat) => chat.offerId === offerId);
    for (const chat of chats.slice(0, 8)) {
      const messages = await fetchChatMessages(chat.chatId);
      const upserts = messages
        .filter((message) => message.messageId && message.text.trim())
        .map((message) => ({
          property_id: propertyId,
          platform: "cian" as const,
          external_chat_id: String(message.chatId),
          external_message_id: message.messageId,
          author: message.author,
          direction: message.direction,
          body: message.text,
          sent_at: message.createdAt || new Date().toISOString(),
        }));
      if (upserts.length > 0) {
        await supabaseAdmin.from("listing_messages").upsert(upserts, {
          onConflict: "platform,external_message_id",
        });
      }
    }
    return { error: "" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось получить сообщения ЦИАН" };
  }
}

/** Подтягивает чаты Авито по объявлению в listing_messages. */
export async function pullAvitoListingMessages(propertyId: string): Promise<{ error: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: listing } = await supabaseAdmin
    .from("property_listings")
    .select("external_id")
    .eq("property_id", propertyId)
    .eq("platform", "avito")
    .maybeSingle();
  const itemId = String(asRecord(listing).external_id ?? "");
  if (!/^\d+$/.test(itemId)) {
    return { error: "Объект не связан с объявлением на Авито" };
  }

  try {
    const { fetchAvitoChats, fetchAvitoMessages } = await import("@/lib/avito.server");
    const chats = (await fetchAvitoChats(100)).filter((chat) => chat.itemId === itemId);
    for (const chat of chats.slice(0, 8)) {
      const messages = await fetchAvitoMessages(chat.chatId, 80);
      const upserts = messages
        .filter((message) => message.messageId && message.text.trim())
        .map((message) => ({
          property_id: propertyId,
          platform: "avito" as const,
          external_chat_id: chat.chatId,
          external_message_id: message.messageId,
          author: message.direction === "in" ? chat.opponentName || "Клиент Авито" : "Менеджер",
          direction: message.direction,
          body: message.text,
          sent_at: message.createdAt,
        }));
      if (upserts.length > 0) {
        await supabaseAdmin.from("listing_messages").upsert(upserts, {
          onConflict: "platform,external_message_id",
        });
      }
    }
    return { error: "" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось получить сообщения Авито" };
  }
}

/**
 * История по объекту: сохранённые сообщения площадок плюс чаты RM OS
 * (на случай, если API ещё не отдал свежие, а переписка уже есть в «Чатах»).
 */
export async function loadMergedPropertyMessages(
  propertyId: string,
  options?: { from?: string; to?: string; limit?: number },
): Promise<Record<ChatPlatform, PlatformMessage[]>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const from = options?.from;
  const to = options?.to;
  const limit = options?.limit;
  const fetchCap = typeof limit === "number" ? Math.max(limit, 80) : 2_000;
  const buckets: Record<ChatPlatform, Map<string, PlatformMessage>> = {
    avito: new Map(),
    cian: new Map(),
  };

  const put = (platform: ChatPlatform, row: PlatformMessage, key: string) => {
    if (!row.body.trim()) return;
    if (!inRange(row.sent_at, from, to)) return;
    if (!buckets[platform].has(key)) buckets[platform].set(key, row);
  };

  let listingQuery = supabaseAdmin
    .from("listing_messages")
    .select("id, platform, external_message_id, author, direction, body, sent_at")
    .eq("property_id", propertyId)
    .in("platform", ["avito", "cian"]);
  if (from) listingQuery = listingQuery.gte("sent_at", `${from}T00:00:00.000Z`);
  if (to) listingQuery = listingQuery.lte("sent_at", `${to}T23:59:59.999Z`);
  const { data: listingRows } = await listingQuery.order("sent_at", { ascending: false }).limit(fetchCap);

  for (const row of listingRows ?? []) {
    const platform = row.platform as ChatPlatform;
    if (platform !== "avito" && platform !== "cian") continue;
    put(
      platform,
      {
        id: row.id,
        author: row.author || (row.direction === "out" ? "Менеджер" : "Клиент"),
        direction: row.direction,
        body: row.body,
        sent_at: row.sent_at,
      },
      `${platform}:${row.external_message_id || row.id}`,
    );
  }

  const { data: threads } = await supabaseAdmin
    .from("chat_threads")
    .select("id, source, name")
    .eq("property_id", propertyId)
    .in("source", ["avito", "cian"]);

  const threadMeta = new Map<string, { platform: ChatPlatform; name: string }>();
  for (const thread of threads ?? []) {
    const platform = String(thread.source) as ChatPlatform;
    if (platform !== "avito" && platform !== "cian") continue;
    threadMeta.set(thread.id, { platform, name: thread.name || (platform === "cian" ? "Клиент ЦИАН" : "Клиент Авито") });
  }

  if (threadMeta.size > 0) {
    let chatQuery = supabaseAdmin
      .from("chat_messages")
      .select("id, thread_id, external_id, direction, body, created_at")
      .in("thread_id", [...threadMeta.keys()]);
    if (from) chatQuery = chatQuery.gte("created_at", `${from}T00:00:00.000Z`);
    if (to) chatQuery = chatQuery.lte("created_at", `${to}T23:59:59.999Z`);
    const { data: chatRows } = await chatQuery.order("created_at", { ascending: false }).limit(fetchCap);

    for (const row of chatRows ?? []) {
      const meta = threadMeta.get(row.thread_id);
      if (!meta) continue;
      put(
        meta.platform,
        {
          id: row.id,
          author: row.direction === "out" ? "Менеджер" : meta.name,
          direction: row.direction,
          body: row.body,
          sent_at: row.created_at,
        },
        `${meta.platform}:${row.external_id || row.id}`,
      );
    }
  }

  const sortDesc = (left: PlatformMessage, right: PlatformMessage) =>
    right.sent_at.localeCompare(left.sent_at);

  const finish = (platform: ChatPlatform) => {
    const rows = [...buckets[platform].values()].sort(sortDesc);
    return typeof limit === "number" ? rows.slice(0, limit) : rows;
  };

  return { avito: finish("avito"), cian: finish("cian") };
}
