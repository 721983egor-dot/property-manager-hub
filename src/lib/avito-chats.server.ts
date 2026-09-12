/** Синхронизация переписки Авито с общим разделом чатов RM OS. */
export async function syncAvitoChats(): Promise<{ chats: number; messages: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchAvitoChats, fetchAvitoMessages } = await import("@/lib/avito.server");
  const chats = await fetchAvitoChats();

  const itemIds = [...new Set(chats.map((chat) => chat.itemId).filter((id): id is string => Boolean(id)))];
  const propertyByItem = new Map<string, string>();
  if (itemIds.length > 0) {
    const { data: listings } = await supabaseAdmin
      .from("property_listings")
      .select("property_id, external_id")
      .eq("platform", "avito")
      .in("external_id", itemIds);
    for (const listing of listings ?? []) {
      propertyByItem.set(String(listing.external_id), listing.property_id);
    }
  }

  const externalIds = chats.map((chat) => chat.chatId);
  const existingByExternal = new Map<string, { id: string; last_message_at: string; name: string; phone: string }>();
  if (externalIds.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from("chat_threads")
      .select("id, external_id, last_message_at, name, phone")
      .eq("source", "avito")
      .in("external_id", externalIds);
    for (const row of existing ?? []) {
      if (row.external_id) {
        existingByExternal.set(String(row.external_id), {
          id: row.id,
          last_message_at: row.last_message_at,
          name: row.name ?? "",
          phone: row.phone ?? "",
        });
      }
    }
  }

  let messageCount = 0;
  for (const chat of chats) {
    const propertyId = chat.itemId ? propertyByItem.get(chat.itemId) ?? null : null;
    const prev = existingByExternal.get(chat.chatId);
    const updatedAt = chat.updatedAt || new Date().toISOString();
    const needsMessages = !prev || new Date(updatedAt).getTime() > new Date(prev.last_message_at).getTime();

    let threadId = prev?.id;
    if (!threadId) {
      const { data: thread, error: threadError } = await supabaseAdmin
        .from("chat_threads")
        .upsert(
          {
            visitor_key: `avito:${chat.chatId}`.slice(0, 120),
            source: "avito",
            external_id: chat.chatId,
            external_offer_id: chat.itemId,
            property_id: propertyId,
            name: "Клиент Авито",
            first_page: chat.title || (chat.itemId ? `Объявление Авито №${chat.itemId}` : "Авито"),
            last_message_at: updatedAt,
          },
          { onConflict: "visitor_key" },
        )
        .select("id")
        .single();
      if (threadError || !thread) throw new Error(threadError?.message ?? "Не удалось сохранить чат Авито");
      threadId = thread.id;
    } else {
      await supabaseAdmin
        .from("chat_threads")
        .update({
          external_offer_id: chat.itemId,
          property_id: propertyId,
          first_page: chat.title || (chat.itemId ? `Объявление Авито №${chat.itemId}` : "Авито"),
          last_message_at: needsMessages ? updatedAt : prev.last_message_at,
        })
        .eq("id", threadId);
    }

    if (!needsMessages || !threadId) continue;

    const messages = await fetchAvitoMessages(chat.chatId, 80);
    const incoming = messages.filter((message) => message.direction === "in");
    const latestIncoming =
      incoming
        .map((message) => message.createdAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;
    const rows = messages
      .filter((message) => message.text.trim())
      .map((message) => ({
        thread_id: threadId,
        external_id: message.messageId,
        direction: message.direction,
        body: message.text,
        created_at: message.createdAt,
      }));
    if (rows.length > 0) {
      const { error } = await supabaseAdmin
        .from("chat_messages")
        .upsert(rows, { onConflict: "thread_id,external_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      messageCount += rows.length;
    }

    const { count } = await supabaseAdmin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", threadId)
      .eq("direction", "in")
      .is("read_at", null);
    await supabaseAdmin
      .from("chat_threads")
      .update({
        unread_count: count ?? 0,
        last_visitor_message_at: latestIncoming,
        last_message_at: updatedAt,
      })
      .eq("id", threadId);
  }

  return { chats: chats.length, messages: messageCount };
}

/**
 * После обработки фида Авито подставляет номера объявлений к объектам RM OS.
 * Уже сопоставленные вручную числовые ID не трогаем.
 */
export async function syncAvitoListingIds(): Promise<{ linked: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchAvitoIdsByAdIds } = await import("@/lib/avito.server");

  const { data: listings, error } = await supabaseAdmin
    .from("property_listings")
    .select("property_id, external_id")
    .eq("platform", "avito")
    .eq("published", true);
  if (error) throw new Error(error.message);

  const pending = (listings ?? []).filter((row) => !/^\d+$/.test(String(row.external_id ?? "")));
  if (pending.length === 0) return { linked: 0 };

  const map = await fetchAvitoIdsByAdIds(pending.map((row) => String(row.external_id)));
  let linked = 0;
  for (const row of pending) {
    const avitoId = map.get(String(row.external_id));
    if (!avitoId) continue;
    const externalId = String(avitoId);
    const { error: updError } = await supabaseAdmin
      .from("property_listings")
      .update({ external_id: externalId })
      .eq("property_id", row.property_id)
      .eq("platform", "avito");
    if (updError) continue;
    await supabaseAdmin
      .from("chat_threads")
      .update({ property_id: row.property_id, external_offer_id: externalId })
      .eq("source", "avito")
      .eq("external_offer_id", String(row.external_id));
    linked += 1;
  }
  return { linked };
}

/** Статистика просмотров/контактов Авито по связанным объектам. */
export async function syncAvitoStats(): Promise<{ synced: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchAvitoStats } = await import("@/lib/avito.server");

  const { data: listings, error } = await supabaseAdmin
    .from("property_listings")
    .select("property_id, external_id")
    .eq("platform", "avito")
    .eq("published", true);
  if (error) throw new Error(error.message);

  const numeric = (listings ?? [])
    .map((row) => ({ property_id: row.property_id, itemId: Number(row.external_id) }))
    .filter((row) => Number.isFinite(row.itemId) && row.itemId > 0);
  if (numeric.length === 0) return { synced: 0 };

  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const stats = await fetchAvitoStats(
    numeric.map((row) => row.itemId),
    from,
    to,
  );

  let synced = 0;
  for (const row of numeric) {
    const days = stats.get(row.itemId) ?? [];
    if (days.length > 0) {
      await supabaseAdmin.from("listing_stats").upsert(
        days.map((d) => ({
          property_id: row.property_id,
          platform: "avito" as const,
          ...d,
        })),
        { onConflict: "property_id,platform,date" },
      );
    }
    await supabaseAdmin
      .from("property_listings")
      .update({ last_synced_at: new Date().toISOString(), sync_status: "synced", sync_error: "" })
      .eq("property_id", row.property_id)
      .eq("platform", "avito");
    synced += 1;
  }
  return { synced };
}
