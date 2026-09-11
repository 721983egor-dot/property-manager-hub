/** Синхронизация переписки ЦИАН с общим разделом чатов RM OS. */
export async function syncCianChats(): Promise<{ chats: number; messages: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchChats, fetchChatMessages } = await import("@/lib/cian.server");
  const chats = await fetchChats();

  const externalOffers = [
    ...new Set(chats.map((chat) => chat.offerId).filter((id): id is number => id != null)),
  ].map(String);
  const propertyByOffer = new Map<string, string>();
  if (externalOffers.length > 0) {
    const { data: listings } = await supabaseAdmin
      .from("property_listings")
      .select("property_id, external_id")
      .eq("platform", "cian")
      .in("external_id", externalOffers);
    for (const listing of listings ?? []) {
      propertyByOffer.set(listing.external_id, listing.property_id);
    }
  }

  let messageCount = 0;
  for (const chat of chats) {
    const externalId = String(chat.chatId);
    const offerId = chat.offerId == null ? null : String(chat.offerId);
    const { data: thread, error: threadError } = await supabaseAdmin
      .from("chat_threads")
      .upsert(
        {
          visitor_key: `cian:${externalId}`,
          source: "cian",
          external_id: externalId,
          external_offer_id: offerId,
          property_id: offerId ? propertyByOffer.get(offerId) ?? null : null,
          name: "Клиент ЦИАН",
          first_page: offerId ? `Объявление ЦИАН №${offerId}` : "ЦИАН",
          last_message_at: chat.updatedAt || new Date().toISOString(),
        },
        { onConflict: "visitor_key" },
      )
      .select("id")
      .single();
    if (threadError || !thread) throw new Error(threadError?.message ?? "Не удалось сохранить чат ЦИАН");

    const messages = await fetchChatMessages(chat.chatId, 100);
    const incoming = messages.filter((message) => message.direction === "in");
    const latestIncoming = incoming
      .map((message) => message.createdAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
    const rows = messages
      .filter((message) => message.messageId && message.text.trim())
      .map((message) => ({
        thread_id: thread.id,
        external_id: message.messageId,
        direction: message.direction,
        body: message.text,
        created_at: message.createdAt || new Date().toISOString(),
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
      .eq("thread_id", thread.id)
      .eq("direction", "in")
      .is("read_at", null);
    await supabaseAdmin
      .from("chat_threads")
      .update({
        unread_count: count ?? 0,
        last_visitor_message_at: latestIncoming,
        last_message_at: chat.updatedAt || new Date().toISOString(),
      })
      .eq("id", thread.id);
  }
  return { chats: chats.length, messages: messageCount };
}