import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Input = Record<string, unknown>;
type Executor = (input: Input) => Promise<string>;

function must<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

async function logAction(summary: string, tool: string, input: Input) {
  await supabaseAdmin.from("activity_log").insert({
    table_name: "assistant",
    action: tool,
    source: "assistant",
    summary,
    changes: input as never,
  });
}

/** Исполнители подтверждённых действий Ассистента. Ключ = поле `tool` предложения. */
export const ASSISTANT_EXECUTORS: Record<string, Executor> = {
  sendCianMessage: async (input) => {
    const threadId = must(input["threadId"] as string, "Не указан чат");
    const body = must(input["body"] as string, "Пустое сообщение");
    const { data: thread } = await supabaseAdmin
      .from("chat_threads")
      .select("external_id, source")
      .eq("id", threadId)
      .maybeSingle();
    if (!thread || thread.source !== "cian" || !thread.external_id) {
      throw new Error("Чат ЦИАН не найден");
    }
    const { sendChatMessage } = await import("@/lib/cian.server");
    const externalId = await sendChatMessage(Number(thread.external_id), body);
    const { error } = await supabaseAdmin.from("chat_messages").insert({
      thread_id: threadId,
      direction: "out",
      body,
      external_id: externalId || null,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("chat_threads")
      .update({ last_message_at: new Date().toISOString(), unread_count: 0 })
      .eq("id", threadId);
    return "Сообщение отправлено в ЦИАН";
  },

  sendChatMessage: async (input) => {
    const threadId = must(input["threadId"] as string, "Не указан чат");
    const body = must(input["body"] as string, "Пустое сообщение");
    const { data: thread } = await supabaseAdmin
      .from("chat_threads")
      .select("source, external_id")
      .eq("id", threadId)
      .maybeSingle();
    if (!thread) throw new Error("Диалог не найден");

    let externalMessageId: string | null = null;
    if (thread.source === "cian") {
      const chatId = Number(thread.external_id);
      if (!Number.isFinite(chatId)) throw new Error("Некорректный номер чата ЦИАН");
      const { sendChatMessage } = await import("@/lib/cian.server");
      externalMessageId = (await sendChatMessage(chatId, body)) || null;
    }
    if (thread.source === "avito") {
      const chatId = String(thread.external_id ?? "");
      if (!chatId) throw new Error("Некорректный чат Авито");
      const { sendAvitoMessage } = await import("@/lib/avito.server");
      externalMessageId = (await sendAvitoMessage(chatId, body)) || null;
    }

    const { data: row, error } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        direction: "out",
        body,
        external_id: externalMessageId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("chat_threads")
      .update({ last_message_at: new Date().toISOString(), unread_count: 0 })
      .eq("id", threadId);
    void row;
    return "Сообщение отправлено в чат";
  },

  setPublished: async (input) => {
    const propertyId = must(input["propertyId"] as string, "Не указан объект");
    const platform = (input["platform"] as string) || "site";
    const published = Boolean(input["publish"]);
    if (platform === "cian") {
      const { setCianPublished } = await import("@/lib/cian.functions");
      await setCianPublished({ data: { propertyId, published } });
    } else if (platform === "yandex") {
      const { setYandexPublished } = await import("@/lib/yandex-realty.functions");
      await setYandexPublished({ data: { propertyId, published } });
    } else if (platform === "avito") {
      const { setAvitoPublished } = await import("@/lib/avito.functions");
      await setAvitoPublished({ data: { propertyId, published } });
    } else {
      const now = new Date().toISOString();
      await supabaseAdmin.from("properties").update({ published }).eq("id", propertyId);
      const { error } = await supabaseAdmin.from("property_listings").upsert(
        {
          property_id: propertyId,
          platform: "site" as never,
          published,
          published_at: published ? now : null,
          unpublished_at: published ? null : now,
          last_synced_at: now,
        },
        { onConflict: "property_id,platform" },
      );
      if (error) throw new Error(error.message);
    }
    return published ? "Опубликовано" : "Снято с публикации";
  },

  updateProperty: async (input) => {
    const propertyId = must(input["propertyId"] as string, "Не указан объект");
    const f = (input["fields"] ?? {}) as Input;
    const patch: Record<string, unknown> = {};
    if (f["title"] != null) patch["title"] = f["title"];
    if (f["internalName"] != null) patch["internal_name"] = f["internalName"];
    if (f["address"] != null) patch["address"] = f["address"];
    if (f["complexName"] != null) patch["complex_name"] = f["complexName"];
    if (f["type"] != null) patch["type"] = f["type"];
    if (f["rooms"] != null) patch["rooms"] = f["rooms"];
    if (f["bathrooms"] != null) patch["bathrooms"] = f["bathrooms"];
    if (f["area"] != null) patch["area"] = f["area"];
    if (f["floor"] != null) patch["floor"] = f["floor"];
    if (f["totalFloors"] != null) patch["total_floors"] = f["totalFloors"];
    if (f["priceMonth"] != null) patch["price_month"] = f["priceMonth"];
    if (f["status"]) patch["status"] = f["status"];
    if (f["deposit"] != null) patch["deposit"] = f["deposit"];
    if (f["commission"] != null) patch["commission"] = f["commission"];
    if (f["utilitiesMonth"] != null) patch["utilities_month"] = f["utilitiesMonth"];
    if (f["description"] != null) patch["description"] = f["description"];
    if (f["rentTerms"] != null) patch["rent_terms"] = f["rentTerms"];
    if (f["availabilityNote"] != null) patch["availability_note"] = f["availabilityNote"];
    if (!Object.keys(patch).length) throw new Error("Нет изменений");
    const { error } = await supabaseAdmin
      .from("properties")
      .update(patch as never)
      .eq("id", propertyId);
    if (error) throw new Error(error.message);
    return "Объект обновлён";
  },

  createProperty: async (input) => {
    const { data: last } = await supabaseAdmin
      .from("properties")
      .select("ref_id")
      .order("ref_id", { ascending: false })
      .limit(1);
    const nextRef = ((last ?? [])[0]?.ref_id ?? 1000) + 1;
    const { error } = await supabaseAdmin.from("properties").insert({
      ref_id: nextRef,
      title: (input["title"] as string) ?? "Новый объект",
      internal_name: (input["internalName"] as string) ?? "",
      type: (input["type"] as never) ?? ("apartment" as never),
      rooms: (input["rooms"] as number) ?? 1,
      bathrooms: (input["bathrooms"] as number) ?? 1,
      address: (input["address"] as string) ?? "",
      complex_name: (input["complexName"] as string) ?? "",
      area: (input["area"] as number) ?? null,
      floor: (input["floor"] as number) ?? null,
      total_floors: (input["totalFloors"] as number) ?? null,
      price_month: (input["priceMonth"] as number) ?? null,
      deposit: (input["deposit"] as number) ?? null,
      commission: (input["commission"] as number) ?? null,
      description: (input["description"] as string) ?? "",
      status: "free" as never,
      published: false,
    });
    if (error) throw new Error(error.message);
    return `Объект создан, номер ${nextRef}`;
  },

  createSelection: async (input) => {
    const { insertSelection } = await import("@/lib/selections.functions");
    const selection = await insertSelection({
      propertyIds: (input["propertyIds"] as string[]) ?? [],
      name: (input["name"] as string) ?? "",
      clientName: (input["clientName"] as string) ?? "",
      comment: (input["comment"] as string) ?? "",
      saved: true,
    });
    const { selectionUrl } = await import("@/lib/telegram/links.server");
    return `Подборка создана в RM OS: ${selection.items.length} объект(а).\n${selectionUrl(selection.code)}`;
  },

  createBooking: async (input) => {
    const propertyId = must(input["propertyId"] as string, "Не указан объект");
    const fullName = must(input["clientName"] as string, "Не указан клиент");
    const phone = (input["clientPhone"] as string) ?? "";
    let clientId: string | null = null;
    const term = phone || fullName;
    const { data: found } = await supabaseAdmin
      .from("clients")
      .select("id")
      .or(`full_name.ilike.%${fullName}%,phone.ilike.%${term}%`)
      .limit(1);
    if ((found ?? []).length) clientId = (found ?? [])[0]!.id;
    if (!clientId) {
      const { data: created, error } = await supabaseAdmin
        .from("clients")
        .insert({ full_name: fullName, phone })
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message ?? "Не удалось создать клиента");
      clientId = created.id;
    }
    const priceMonth = (input["priceMonth"] as number) ?? null;
    const { error } = await supabaseAdmin.from("bookings").insert({
      property_id: propertyId,
      client_id: clientId,
      start_date: input["startDate"] as string,
      end_date: input["endDate"] as string,
      price_type: "fixed" as never,
      price_month: priceMonth,
      payment_day: (input["paymentDay"] as number) ?? 1,
      deposit: (input["deposit"] as number) ?? null,
      source: (input["source"] as never) ?? null,
      status: "active" as never,
      comment: (input["comment"] as string) ?? "",
    });
    if (error) throw new Error(error.message);
    return "Бронь добавлена";
  },

  cancelBooking: async (input) => {
    const propertyId = must(input["propertyId"] as string, "Не указан объект");
    const startDate = must(input["startDate"] as string, "Не указана дата");
    const { error } = await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled" as never })
      .eq("property_id", propertyId)
      .eq("start_date", startDate);
    if (error) throw new Error(error.message);
    return "Бронь отменена";
  },

  upsertClient: async (input) => {
    const clientId = input["clientId"] as string | null;
    const patch: Record<string, unknown> = {};
    if (input["fullName"]) patch["full_name"] = input["fullName"];
    if (input["phone"] != null) patch["phone"] = input["phone"];
    if (input["comment"] != null) patch["comment"] = input["comment"];
    if (input["blacklisted"] != null) patch["blacklisted"] = input["blacklisted"];
    if (input["blacklistReason"] != null) patch["blacklist_reason"] = input["blacklistReason"];
    if (clientId) {
      const { error } = await supabaseAdmin
        .from("clients")
        .update(patch as never)
        .eq("id", clientId);
      if (error) throw new Error(error.message);
      return "Клиент обновлён";
    }
    const { error } = await supabaseAdmin
      .from("clients")
      .insert({ full_name: (patch["full_name"] as string) ?? "", ...patch } as never);
    if (error) throw new Error(error.message);
    return "Клиент создан";
  },

  setLeadStatus: async (input) => {
    const leadId = must(input["leadId"] as string, "Не указана заявка");
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ status: input["status"] as never })
      .eq("id", leadId);
    if (error) throw new Error(error.message);
    return "Статус заявки обновлён";
  },

  addDealComment: async (input) => {
    const dealId = must(input["dealId"] as string, "Не указана сделка");
    const body = must(input["body"] as string, "Пустой комментарий");
    const { error } = await supabaseAdmin.from("deal_comments").insert({
      deal_id: dealId,
      body,
      author_name: "Ассистент",
    } as never);
    if (error) throw new Error(error.message);
    return "Комментарий добавлен";
  },

  addDealShowing: async (input) => {
    const dealId = must(input["dealId"] as string, "Не указана сделка");
    const propertyId = must(input["propertyId"] as string, "Не указан объект");
    const shownAt = must(input["shownAt"] as string, "Не указана дата показа");
    const { error } = await supabaseAdmin.from("deal_showings").insert({
      deal_id: dealId,
      property_id: propertyId,
      shown_at: shownAt,
      note: (input["note"] as string) ?? "",
      author_name: "Ассистент",
    } as never);
    if (error) throw new Error(error.message);
    return "Показ добавлен в сделку";
  },

  closeDealWon: async (input) => {
    const dealId = must(input["dealId"] as string, "Не указана сделка");
    const propertyId = must(input["propertyId"] as string, "Не указан объект");
    const clientId = input["clientId"] as string | null;
    const startDate = must(input["startDate"] as string, "Не указана дата заезда");
    const endDate = must(input["endDate"] as string, "Не указана дата выезда");
    const priceMonth = Number(input["priceMonth"]);
    const deposit = Number(input["deposit"]);
    const paymentDay = Number(input["paymentDay"]);
    const commission = input["commission"] == null ? null : Number(input["commission"]);

    const { data: wonStage } = await supabaseAdmin
      .from("deal_stages")
      .select("id")
      .eq("kind", "won")
      .order("position")
      .limit(1)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      closed_property_id: propertyId,
      start_date: startDate,
      end_date: endDate,
      price_month: priceMonth,
      deposit,
      commission,
      payment_day: paymentDay,
    };
    if (wonStage) patch["stage_id"] = wonStage.id;
    const { error } = await supabaseAdmin
      .from("deals")
      .update(patch as never)
      .eq("id", dealId);
    if (error) throw new Error(error.message);

    if (input["serviceType"] === "management" && clientId) {
      const { error: bookingError } = await supabaseAdmin.from("bookings").insert({
        property_id: propertyId,
        client_id: clientId,
        start_date: startDate,
        end_date: endDate,
        price_type: "fixed",
        price_month: priceMonth,
        payment_day: paymentDay,
        deposit,
        status: "active",
        comment: "Создано при успешном закрытии сделки",
      } as never);
      if (bookingError) throw new Error(bookingError.message);
    }

    const { error: propError } = await supabaseAdmin
      .from("properties")
      .update({ status: "rented" as never })
      .eq("id", propertyId);
    if (propError) throw new Error(propError.message);
    return "Сделка закрыта успешно";
  },

  upsertDeal: async (input) => {
    const dealId = input["dealId"] as string | null;

    const patch: Record<string, unknown> = {};
    if (input["title"] != null) patch["title"] = input["title"];
    if (input["stageId"] != null) patch["stage_id"] = input["stageId"];
    if (input["clientId"] != null) patch["client_id"] = input["clientId"];
    if (input["propertyId"] != null) patch["property_id"] = input["propertyId"];
    if (input["source"] != null) patch["source"] = input["source"];
    if (input["budget"] != null) patch["budget"] = input["budget"];
    if (input["adults"] != null) patch["adults"] = input["adults"];
    if (input["children"] != null) patch["children"] = input["children"];
    if (input["comment"] != null) patch["comment"] = input["comment"];
    if (input["custom"] != null) patch["custom"] = input["custom"];
    if (dealId) {
      const { error } = await supabaseAdmin
        .from("deals")
        .update(patch as never)
        .eq("id", dealId);
      if (error) throw new Error(error.message);
      return "Сделка обновлена";
    }
    const stageId = must(patch["stage_id"] as string, "Не указана стадия сделки");
    const { error } = await supabaseAdmin.from("deals").insert({
      ...patch,
      stage_id: stageId,
      title: (patch["title"] as string) ?? "Новая сделка",
    } as never);
    if (error) throw new Error(error.message);
    return "Сделка создана";
  },

  createSocialPost: async (input) => {
    const { saveSocialPost } = await import("@/lib/social.server");
    const platforms = Array.isArray(input["platforms"])
      ? (input["platforms"] as string[])
      : [];
    const post = await saveSocialPost({
      topic: String(input["topic"] ?? ""),
      body: String(input["body"] ?? ""),
      platforms: platforms as ("instagram" | "vk" | "telegram" | "max")[],
      propertyId: (input["propertyId"] as string | null) ?? null,
      scheduledAt: (input["scheduledAt"] as string | null) ?? null,
      publish: Boolean(input["publish"]),
      source: "assistant",
    });
    return post.status === "draft" ? "Черновик поста сохранён" : "Пост отправлен в очередь публикации";
  },

  publishSocialPost: async (input) => {
    const { publishSocialPost } = await import("@/lib/social.server");
    return publishSocialPost(must(input["postId"] as string, "Не указан пост"), {
      immediate: Boolean(input["immediate"]),
    });
  },

  cancelSocialPost: async (input) => {
    const { cancelSocialPost } = await import("@/lib/social.server");
    return cancelSocialPost(must(input["postId"] as string, "Не указан пост"));
  },

  saveSocialBrand: async (input) => {
    const { saveSocialBrand } = await import("@/lib/social.server");
    await saveSocialBrand({
      voice: String(input["voice"] ?? ""),
      audience: String(input["audience"] ?? ""),
      hashtags: String(input["hashtags"] ?? ""),
      forbidden: String(input["forbidden"] ?? ""),
      cta: String(input["cta"] ?? ""),
      examples: String(input["examples"] ?? ""),
    });
    return "Голос бренда для соцсетей обновлён";
  },
};

/** Выполняет подтверждённое действие и пишет его в журнал. */
export async function executeAssistantAction(
  tool: string,
  summary: string,
  rawInput: string,
): Promise<string> {
  const executor = ASSISTANT_EXECUTORS[tool];
  if (!executor) throw new Error(`Неизвестное действие: ${tool}`);
  let input: Input = {};
  try {
    input = rawInput ? (JSON.parse(rawInput) as Input) : {};
  } catch {
    throw new Error("Не удалось прочитать параметры действия");
  }
  const message = await executor(input);
  await logAction(summary, tool, input);
  return message;
}
