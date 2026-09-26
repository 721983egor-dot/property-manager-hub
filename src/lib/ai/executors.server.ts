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
    if (f["forRent"] != null) patch["for_rent"] = Boolean(f["forRent"]);
    if (f["videoUrl"] != null) patch["video_url"] = String(f["videoUrl"]).trim();
    if (!Object.keys(patch).length) throw new Error("Нет изменений");
    const { error } = await supabaseAdmin
      .from("properties")
      .update(patch as never)
      .eq("id", propertyId);
    if (error) throw new Error(error.message);
    return "Объект обновлён";
  },

  publishPropertyVideo: async (input) => {
    const propertyId = must(input["propertyId"] as string, "Не указан объект");
    const { publishPropertyVideoToHosts } = await import("@/lib/video-hosts.server");
    const result = await publishPropertyVideoToHosts(propertyId);
    const parts = [
      result.rutubeUrl ? `Rutube ${result.rutubeUrl}` : "",
      result.vkUrl ? `VK ${result.vkUrl}` : "",
      result.youtubeUrl ? `YouTube ${result.youtubeUrl}` : "",
    ].filter(Boolean);
    if (result.errors.length) parts.push(`ошибки: ${result.errors.join("; ")}`);
    return parts.length ? parts.join(". ") : "Выгрузка завершена";
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
    if (input["partyKind"] != null) patch["party_kind"] = input["partyKind"];
    if (clientId) {
      let { error } = await supabaseAdmin
        .from("clients")
        .update(patch as never)
        .eq("id", clientId);
      if (error && /party_kind|schema cache|could not find/i.test(error.message)) {
        const { party_kind: _pk, ...rest } = patch;
        ({ error } = await supabaseAdmin.from("clients").update(rest as never).eq("id", clientId));
      }
      if (error) throw new Error(error.message);
      return "Клиент обновлён";
    }
    let { error } = await supabaseAdmin
      .from("clients")
      .insert({ full_name: (patch["full_name"] as string) ?? "", ...patch } as never);
    if (error && /party_kind|schema cache|could not find/i.test(error.message)) {
      const { party_kind: _pk, ...rest } = patch;
      ({ error } = await supabaseAdmin
        .from("clients")
        .insert({ full_name: (rest["full_name"] as string) ?? "", ...rest } as never));
    }
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
    if (input["pipeline"] != null) patch["pipeline"] = input["pipeline"];
    if (input["title"] != null) patch["title"] = input["title"];
    if (input["stageId"] != null) patch["stage_id"] = input["stageId"];
    if (input["clientId"] != null) patch["client_id"] = input["clientId"];
    if (input["propertyId"] != null) patch["property_id"] = input["propertyId"];
    if (input["source"] != null) patch["source"] = input["source"];
    if (input["budget"] != null) patch["budget"] = input["budget"];
    if (input["adults"] != null) patch["adults"] = input["adults"];
    if (input["children"] != null) patch["children"] = input["children"];
    if (input["comment"] != null) patch["comment"] = input["comment"];
    if (input["telegram"] != null) {
      patch["telegram"] = input["telegram"];
      const custom = (patch["custom"] as Record<string, unknown> | undefined) ?? {};
      patch["custom"] = { ...custom, telegram: input["telegram"] };
    }
    if (input["preferredMessenger"] != null) {
      patch["preferred_messenger"] = input["preferredMessenger"];
      const custom = (patch["custom"] as Record<string, unknown> | undefined) ?? {};
      patch["custom"] = { ...custom, preferred_messenger: input["preferredMessenger"] };
    }
    if (input["custom"] != null) patch["custom"] = { ...(patch["custom"] as object), ...(input["custom"] as object) };
    const writeDeal = async (row: Record<string, unknown>) =>
      dealId
        ? supabaseAdmin.from("deals").update(row as never).eq("id", dealId)
        : supabaseAdmin.from("deals").insert({
            ...row,
            pipeline: (row["pipeline"] as string) || "rental",
            stage_id: must(row["stage_id"] as string, "Не указана стадия сделки"),
            title: (row["title"] as string) ?? "Новая сделка",
          } as never);
    let { error } = await writeDeal(patch);
    if (error && /telegram|preferred_messenger|schema cache|could not find/i.test(error.message)) {
      const { telegram: _t, preferred_messenger: _m, ...rest } = patch;
      ({ error } = await writeDeal(rest));
    }
    if (error && /pipeline|schema cache|could not find/i.test(error.message)) {
      const { pipeline: _p, ...rest } = patch;
      ({ error } = await writeDeal(rest));
    }
    if (error) throw new Error(error.message);
    return dealId ? "Сделка обновлена" : "Сделка создана";
  },

  createSocialPost: async (input) => {
    const { saveSocialPost } = await import("@/lib/social.server");
    const platforms = Array.isArray(input["platforms"])
      ? (input["platforms"] as string[])
      : [];
    const mediaRaw = Array.isArray(input["media"]) ? (input["media"] as Record<string, unknown>[]) : [];
    const media = mediaRaw
      .map((item) => ({
        path: String(item["path"] ?? "").trim(),
        kind: item["kind"] === "video" ? ("video" as const) : ("photo" as const),
        mime: String(item["mime"] ?? ""),
        bytes: Number(item["bytes"] ?? 0),
        width: (item["width"] as number | null | undefined) ?? null,
        height: (item["height"] as number | null | undefined) ?? null,
        durationSec: (item["durationSec"] as number | null | undefined) ?? null,
      }))
      .filter((item) => item.path);
    const objectUrl = String(input["objectUrl"] ?? "").trim();
    const post = await saveSocialPost({
      topic: String(input["topic"] ?? ""),
      body: String(input["body"] ?? ""),
      platforms: platforms as ("instagram" | "vk" | "telegram" | "max")[],
      propertyId: (input["propertyId"] as string | null) ?? null,
      pulseItemId: (input["pulseItemId"] as string | null) ?? null,
      articleId: (input["articleId"] as string | null) ?? null,
      ...(objectUrl ? { objectUrl } : {}),
      scheduledAt: (input["scheduledAt"] as string | null) ?? null,
      publish: Boolean(input["publish"]),
      source: "assistant",
      ...(input["variants"]
        ? {
            variants: input["variants"] as Partial<
              Record<"instagram" | "vk" | "telegram" | "max", string>
            >,
          }
        : {}),
      ...(media.length ? { media } : {}),
    });
    return post.status === "draft" ? "Черновик поста сохранён" : "Пост отправлен в очередь публикации";
  },

  updateSocialPost: async (input) => {
    const { loadSocialPosts, saveSocialPost } = await import("@/lib/social.server");
    const { objectUrlFromPost } = await import("@/lib/social-adapt");
    const postId = must(input["postId"] as string, "Не указан пост");
    const posts = await loadSocialPosts(80);
    const post = posts.find((p) => p.id === postId);
    if (!post) throw new Error("Пост не найден");
    if (post.status !== "draft" && post.status !== "failed") {
      throw new Error("Править можно только черновик. Запланированный пост сначала снимите с очереди.");
    }
    const platforms = Array.isArray(input["platforms"])
      ? (input["platforms"] as ("instagram" | "vk" | "telegram" | "max")[])
      : post.targets.map((t) => t.platform);
    const nextBody = input["body"] != null ? String(input["body"]) : post.body;
    const instagramBody =
      input["instagramBody"] != null
        ? String(input["instagramBody"])
        : (post.targets.find((t) => t.platform === "instagram")?.body ?? "");
    const objectUrl =
      input["objectUrl"] != null
        ? String(input["objectUrl"]).trim()
        : objectUrlFromPost(post.body, post.targets);
    const instagramVariant =
      platforms.includes("instagram") && instagramBody.trim()
        ? { instagram: instagramBody }
        : undefined;
    const saved = await saveSocialPost({
      id: postId,
      topic: input["topic"] != null ? String(input["topic"]) : post.topic,
      body: nextBody,
      platforms,
      propertyId: post.property_id,
      pulseItemId: post.pulse_item_id,
      ...(objectUrl ? { objectUrl } : {}),
      scheduledAt:
        input["scheduledAt"] !== undefined
          ? ((input["scheduledAt"] as string | null) ?? null)
          : post.scheduled_at,
      publish: Boolean(input["publish"]),
      source: "assistant",
      ...(instagramVariant ? { variants: instagramVariant } : {}),
    });
    return saved.status === "draft" ? "Черновик обновлён" : "Пост отправлен в очередь публикации";
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

  createSocialStory: async (input) => {
    const { saveSocialStory } = await import("@/lib/social-stories.server");
    const platforms = Array.isArray(input["platforms"])
      ? (input["platforms"] as string[])
      : [];
    const mediaRaw = Array.isArray(input["media"]) ? (input["media"] as Record<string, unknown>[]) : [];
    const media = mediaRaw
      .map((item) => ({
        path: String(item["path"] ?? "").trim(),
        kind: item["kind"] === "video" ? ("video" as const) : ("photo" as const),
        mime: String(item["mime"] ?? ""),
        bytes: Number(item["bytes"] ?? 0),
        width: (item["width"] as number | null | undefined) ?? null,
        height: (item["height"] as number | null | undefined) ?? null,
        durationSec: (item["durationSec"] as number | null | undefined) ?? null,
      }))
      .filter((item) => item.path)
      .slice(0, 1);
    const story = await saveSocialStory({
      topic: String(input["topic"] ?? ""),
      body: String(input["body"] ?? ""),
      platforms: platforms as ("instagram" | "vk" | "telegram" | "max")[],
      fromPostId: (input["fromPostId"] as string | null) ?? null,
      propertyId: (input["propertyId"] as string | null) ?? null,
      scheduledAt: (input["scheduledAt"] as string | null) ?? null,
      publish: Boolean(input["publish"]),
      source: "assistant",
      ...(media.length ? { media } : {}),
    });
    return story.status === "draft" ? "Черновик сторис сохранён" : "Сторис отправлена";
  },

  updateSocialStory: async (input) => {
    const { loadSocialStories, saveSocialStory } = await import("@/lib/social-stories.server");
    const storyId = must(input["storyId"] as string, "Не указана сторис");
    const stories = await loadSocialStories(80);
    const story = stories.find((s) => s.id === storyId);
    if (!story) throw new Error("Сторис не найдена");
    if (story.status !== "draft" && story.status !== "failed") {
      throw new Error("Править можно только черновик. Запланированную сторис сначала снимите с очереди.");
    }
    const platforms = Array.isArray(input["platforms"])
      ? (input["platforms"] as ("instagram" | "vk" | "telegram" | "max")[])
      : story.targets.map((t) => t.platform);
    const saved = await saveSocialStory({
      id: storyId,
      topic: input["topic"] != null ? String(input["topic"]) : story.topic,
      body: input["body"] != null ? String(input["body"]) : story.body,
      platforms,
      fromPostId: story.from_post_id,
      propertyId: story.property_id,
      scheduledAt:
        input["scheduledAt"] !== undefined
          ? ((input["scheduledAt"] as string | null) ?? null)
          : story.scheduled_at,
      publish: Boolean(input["publish"]),
      source: "assistant",
    });
    return saved.status === "draft" ? "Черновик сторис обновлён" : "Сторис отправлена";
  },

  publishSocialStory: async (input) => {
    const { publishSocialStory } = await import("@/lib/social-stories.server");
    return publishSocialStory(must(input["storyId"] as string, "Не указана сторис"), {
      immediate: Boolean(input["immediate"]),
    });
  },

  cancelSocialStory: async (input) => {
    const { cancelSocialStory } = await import("@/lib/social-stories.server");
    return cancelSocialStory(must(input["storyId"] as string, "Не указана сторис"));
  },

  createSiteArticle: async (input) => {
    const { saveSiteArticle } = await import("@/lib/site-articles.server");
    const article = await saveSiteArticle({
      title: String(input["title"] ?? ""),
      body: String(input["body"] ?? ""),
      ...(input["slug"] != null ? { slug: String(input["slug"]) } : {}),
      ...(input["excerpt"] != null ? { excerpt: String(input["excerpt"]) } : {}),
      ...(input["seoTitle"] != null ? { seoTitle: String(input["seoTitle"]) } : {}),
      ...(input["seoDescription"] != null ? { seoDescription: String(input["seoDescription"]) } : {}),
      ...(input["coverUrl"] != null ? { coverUrl: String(input["coverUrl"]) } : {}),
      propertyId: (input["propertyId"] as string | null) ?? null,
      publish: Boolean(input["publish"]),
      source: "assistant",
    });
    return article.status === "published" ? "Статья опубликована на сайте" : "Черновик статьи сохранён";
  },

  updateSiteArticle: async (input) => {
    const { loadSiteArticleById, saveSiteArticle } = await import("@/lib/site-articles.server");
    const articleId = must(input["articleId"] as string, "Не указана статья");
    const article = await loadSiteArticleById(articleId);
    if (!article) throw new Error("Статья не найдена");
    const saved = await saveSiteArticle({
      id: articleId,
      title: input["title"] != null ? String(input["title"]) : article.title,
      body: input["body"] != null ? String(input["body"]) : article.body,
      slug: input["slug"] != null ? String(input["slug"]) : article.slug,
      excerpt: input["excerpt"] != null ? String(input["excerpt"]) : article.excerpt,
      seoTitle: input["seoTitle"] != null ? String(input["seoTitle"]) : article.seo_title,
      seoDescription:
        input["seoDescription"] != null ? String(input["seoDescription"]) : article.seo_description,
      coverUrl: input["coverUrl"] != null ? String(input["coverUrl"]) : article.cover_url,
      propertyId: article.property_id,
      publish: Boolean(input["publish"]) || article.status === "published",
      source: "assistant",
    });
    return saved.status === "published" ? "Статья обновлена на сайте" : "Черновик статьи обновлён";
  },

  publishSiteArticle: async (input) => {
    const { publishSiteArticle } = await import("@/lib/site-articles.server");
    await publishSiteArticle(must(input["articleId"] as string, "Не указана статья"));
    return "Статья опубликована на сайте";
  },

  unpublishSiteArticle: async (input) => {
    const { unpublishSiteArticle } = await import("@/lib/site-articles.server");
    await unpublishSiteArticle(must(input["articleId"] as string, "Не указана статья"));
    return "Статья снята с публикации";
  },

  updateSocialPostHitMeta: async (input) => {
    const { updateSocialPostHitMeta } = await import("@/lib/social-analytics.server");
    const postId = must(input["postId"] as string, "Не указан пост");
    const mixRaw = input["contentMix"];
    const contentMix =
      mixRaw === null
        ? null
        : mixRaw === "life_sochi" ||
            mixRaw === "relocation" ||
            mixRaw === "property" ||
            mixRaw === "company" ||
            mixRaw === "other"
          ? mixRaw
          : undefined;
    await updateSocialPostHitMeta({
      postId,
      ...(contentMix !== undefined ? { contentMix } : {}),
      ...(input["manualHit"] !== undefined ? { manualHit: Boolean(input["manualHit"]) } : {}),
      ...(input["hitNote"] !== undefined ? { hitNote: String(input["hitNote"] ?? "") } : {}),
    });
    return "Метка разбора поста сохранена";
  },

  saveHotelRoom: async (input) => {
    const name = must(String(input["name"] ?? "").trim(), "Не указан номер");
    const row = {
      title: name.startsWith("N-11") || name.startsWith("Н11") ? name : `Н11 ${name}`,
      internal_name: name,
      type: "aparts",
      portfolio: "n11",
      published: false,
      service_type: "management",
      address: "Сочи, улица Навагинская",
      complex_name: "Н11 Резиденция",
      room_category_id: (input["category"] as string) || null,
      bnovo_room_id: String(input["bnovoRoomId"] ?? "").trim() || null,
      price_night: (input["priceNight"] as number) ?? null,
      guests_max: (input["guests"] as number) ?? null,
      floor: (input["floor"] as number) ?? null,
      status: "free",
      rooms: 1,
      bathrooms: 1,
    };
    const roomId = (input["roomId"] as string) || "";
    if (roomId) {
      const { error } = await supabaseAdmin.from("properties").update(row as never).eq("id", roomId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("properties").insert(row as never);
      if (error) throw new Error(error.message);
    }
    return "Номер Н11 сохранён";
  },

  saveHotelCategory: async (input) => {
    const code = must(String(input["code"] ?? "").trim().toLowerCase(), "Не указан код категории");
    const name = must(String(input["name"] ?? "").trim(), "Не указано название категории");
    const row = {
      code,
      name,
      description: String(input["description"] ?? "").trim(),
      guests: Number(input["guests"] ?? 2) || 2,
      bnovo_room_type_id: String(input["bnovoRoomTypeId"] ?? "").trim() || null,
    };
    const categoryId = String(input["categoryId"] ?? "");
    if (categoryId) {
      const { error } = await supabaseAdmin.from("hotel_room_categories").update(row as never).eq("id", categoryId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("hotel_room_categories").insert(row as never);
      if (error) throw new Error(error.message);
    }
    return "Категория Н11 сохранена";
  },

  saveHotelOwner: async (input) => {
    const fullName = must(String(input["fullName"] ?? "").trim(), "Не указан собственник");
    const ownerId = (input["ownerId"] as string) || "";
    const row = {
      full_name: fullName,
      phone: String(input["phone"] ?? ""),
      email: String(input["email"] ?? ""),
    };
    let id = ownerId;
    if (id) {
      const { error } = await supabaseAdmin.from("owners").update(row as never).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await supabaseAdmin.from("owners").insert(row as never).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Не удалось сохранить собственника");
      id = (data as { id: string }).id;
    }
    const rooms = (input["rooms"] as string[]) ?? [];
    if (rooms.length) {
      await supabaseAdmin.from("property_owners").delete().eq("owner_id", id);
      const { error } = await supabaseAdmin.from("property_owners").insert(
        rooms.map((propertyId) => ({ owner_id: id, property_id: propertyId })) as never,
      );
      if (error) throw new Error(error.message);
    }
    return "Собственник Н11 сохранён";
  },

  runBnovoSync: async (input) => {
    const { syncBnovoBookings } = await import("@/lib/bnovo-sync.server");
    const result = await syncBnovoBookings({
      from: input["fromDate"] as string | undefined,
      to: input["toDate"] as string | undefined,
    });
    return result.summary;
  },

  upsertTask: async (input) => {
    const taskId = (input["taskId"] as string | null) || null;
    const patch: Record<string, unknown> = {};
    if (input["title"] != null) patch["title"] = input["title"];
    if (input["description"] != null) patch["description"] = input["description"];
    if (input["clearDue"]) {
      patch["due_date"] = null;
      patch["due_start"] = "";
      patch["due_end"] = "";
    } else {
      if (input["dueDate"] != null) patch["due_date"] = input["dueDate"] || null;
      if (input["dueStart"] != null) patch["due_start"] = input["dueStart"];
      if (input["dueEnd"] != null) patch["due_end"] = input["dueEnd"];
    }
    if (input["assigneeId"] != null) patch["assignee_id"] = input["assigneeId"];
    if (input["propertyId"] != null) patch["property_id"] = input["propertyId"];
    if (input["clearDeal"]) patch["deal_id"] = null;
    else if (input["dealId"] != null) patch["deal_id"] = input["dealId"];
    if (input["typeId"] != null) patch["task_type_id"] = input["typeId"];
    if (input["maintenanceServiceItemId"] !== undefined) {
      patch["maintenance_service_item_id"] = input["maintenanceServiceItemId"] || null;
    }
    if (input["isRecurring"] != null) patch["is_recurring"] = Boolean(input["isRecurring"]);
    if (input["recurrence"] != null) {
      const value = String(input["recurrence"]);
      patch["recurrence"] = value === "daily" || value === "monthly" ? value : "weekly";
    }
    if (input["clearRecurrenceUntil"]) patch["recurrence_until"] = null;
    else if (input["recurrenceUntil"] != null) patch["recurrence_until"] = input["recurrenceUntil"] || null;
    if (patch["is_recurring"] === false) {
      patch["recurrence_until"] = null;
    }
    if (input["status"] != null) {
      patch["status"] = input["status"];
      patch["completed_at"] = input["status"] === "done" ? new Date().toISOString() : null;
    }
    let savedId = taskId;
    if (taskId) {
      let { error } = await supabaseAdmin.from("tasks").update(patch as never).eq("id", taskId);
      if (error && /maintenance_service_item_id|schema cache|could not find/i.test(error.message)) {
        const stripped = { ...patch };
        delete stripped.maintenance_service_item_id;
        ({ error } = await supabaseAdmin.from("tasks").update(stripped as never).eq("id", taskId));
      }
      if (error && /is_recurring|recurrence|schema cache|could not find/i.test(error.message)) {
        const stripped = { ...patch };
        delete stripped.is_recurring;
        delete stripped.recurrence;
        delete stripped.recurrence_until;
        delete stripped.maintenance_service_item_id;
        ({ error } = await supabaseAdmin.from("tasks").update(stripped as never).eq("id", taskId));
      }
      if (error) throw new Error(error.message);
    } else {
      const insertRow: Record<string, unknown> = {
        title: (patch["title"] as string) || "Новая задача",
        description: (patch["description"] as string) ?? "",
        due_date: (patch["due_date"] as string | null) ?? null,
        due_start: (patch["due_start"] as string) ?? "",
        due_end: (patch["due_end"] as string) ?? "",
        assignee_id: (patch["assignee_id"] as string | null) ?? null,
        property_id: (patch["property_id"] as string | null) ?? null,
        deal_id: (patch["deal_id"] as string | null) ?? null,
        task_type_id: (patch["task_type_id"] as string | null) ?? null,
        maintenance_service_item_id:
          (patch["maintenance_service_item_id"] as string | null | undefined) ?? null,
        is_recurring: Boolean(patch["is_recurring"]),
        recurrence: (patch["recurrence"] as string) ?? "weekly",
        recurrence_until: (patch["recurrence_until"] as string | null) ?? null,
        status: (patch["status"] as string) ?? "open",
        completed_at: (patch["completed_at"] as string | null) ?? null,
      };
      let { data, error } = await supabaseAdmin.from("tasks").insert(insertRow as never).select("id").single();
      if (error && /maintenance_service_item_id|schema cache|could not find/i.test(error.message)) {
        delete insertRow.maintenance_service_item_id;
        ({ data, error } = await supabaseAdmin.from("tasks").insert(insertRow as never).select("id").single());
      }
      if (error && /is_recurring|recurrence|schema cache|could not find/i.test(error.message)) {
        delete insertRow.is_recurring;
        delete insertRow.recurrence;
        delete insertRow.recurrence_until;
        delete insertRow.maintenance_service_item_id;
        ({ data, error } = await supabaseAdmin.from("tasks").insert(insertRow as never).select("id").single());
      }
      if (error) throw new Error(error.message);
      savedId = (data as { id: string }).id;
    }
    const items = input["items"];
    if (Array.isArray(items) && savedId && !taskId) {
      const rows = items
        .map((title) => String(title ?? "").trim())
        .filter(Boolean)
        .map((title, position) => ({ task_id: savedId, title, done: false, position }));
      if (rows.length) {
        const { error } = await supabaseAdmin.from("task_items").insert(rows as never);
        if (error) throw new Error(error.message);
      }
    }
    return taskId ? "Задача обновлена" : "Задача создана";
  },

  completeTask: async (input) => {
    const taskId = must(input["taskId"] as string, "Не указана задача");
    const { data: task, error: loadError } = await supabaseAdmin
      .from("tasks")
      .select(
        "id, title, description, due_date, due_start, due_end, assignee_id, created_by, property_id, deal_id, task_type_id, position, is_recurring, recurrence, recurrence_until",
      )
      .eq("id", taskId)
      .maybeSingle();
    let current = task as Record<string, unknown> | null;
    if (loadError && /is_recurring|recurrence|schema cache|could not find/i.test(loadError.message)) {
      const retry = await supabaseAdmin
        .from("tasks")
        .select(
          "id, title, description, due_date, due_start, due_end, assignee_id, created_by, property_id, deal_id, task_type_id, position",
        )
        .eq("id", taskId)
        .maybeSingle();
      if (retry.error) throw new Error(retry.error.message);
      current = retry.data as Record<string, unknown> | null;
    } else if (loadError) {
      throw new Error(loadError.message);
    }
    const { error } = await supabaseAdmin
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() } as never)
      .eq("id", taskId);
    if (error) throw new Error(error.message);

    if (current?.is_recurring && current.due_date) {
      const recurrence =
        current.recurrence === "daily" || current.recurrence === "monthly" ? current.recurrence : "weekly";
      const due = String(current.due_date);
      const [y, m, d] = due.split("-").map(Number);
      const base = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
      let next: Date;
      if (recurrence === "daily") next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
      else if (recurrence === "weekly") next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7);
      else {
        next = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());
        if (next.getDate() !== base.getDate()) next = new Date(base.getFullYear(), base.getMonth() + 2, 0);
      }
      const pad = (n: number) => String(n).padStart(2, "0");
      const nextDue = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
      const until = (current.recurrence_until as string | null) ?? null;
      if (!until || nextDue <= until) {
        const { data: items } = await supabaseAdmin
          .from("task_items")
          .select("title, position")
          .eq("task_id", taskId)
          .order("position");
        const insertRow: Record<string, unknown> = {
          title: current.title,
          description: current.description ?? "",
          status: "open",
          due_date: nextDue,
          due_start: current.due_start ?? "",
          due_end: current.due_end ?? "",
          assignee_id: current.assignee_id ?? null,
          property_id: current.property_id ?? null,
          deal_id: current.deal_id ?? null,
          task_type_id: current.task_type_id ?? null,
          is_recurring: true,
          recurrence,
          recurrence_until: until,
          position: current.position ?? 0,
          created_by: current.created_by ?? null,
          completed_at: null,
        };
        let { data: created, error: spawnError } = await supabaseAdmin
          .from("tasks")
          .insert(insertRow as never)
          .select("id")
          .single();
        if (spawnError && /is_recurring|recurrence|schema cache|could not find/i.test(spawnError.message)) {
          delete insertRow.is_recurring;
          delete insertRow.recurrence;
          delete insertRow.recurrence_until;
          ({ data: created, error: spawnError } = await supabaseAdmin
            .from("tasks")
            .insert(insertRow as never)
            .select("id")
            .single());
        }
        if (spawnError) throw new Error(spawnError.message);
        const newId = (created as { id: string }).id;
        const checklist = (items ?? [])
          .map((item) => String(item.title ?? "").trim())
          .filter(Boolean)
          .map((title, position) => ({ task_id: newId, title, done: false, position }));
        if (checklist.length) {
          const { error: itemsError } = await supabaseAdmin.from("task_items").insert(checklist as never);
          if (itemsError) throw new Error(itemsError.message);
        }
        return `Задача отмечена выполненной, следующее повторение на ${nextDue}`;
      }
    }
    return "Задача отмечена выполненной";
  },

  postponeTask: async (input) => {
    const taskId = must(input["taskId"] as string, "Не указана задача");
    const dueDate = (input["dueDate"] as string | null) ?? null;
    const patch: Record<string, unknown> = {
      due_date: dueDate,
      status: "open",
      completed_at: null,
    };
    if (!dueDate) {
      patch["due_start"] = "";
      patch["due_end"] = "";
    }
    const { error } = await supabaseAdmin.from("tasks").update(patch as never).eq("id", taskId);
    if (error) throw new Error(error.message);
    return dueDate ? `Задача отложена на ${dueDate}` : "Срок задачи убран";
  },

  upsertTaskItem: async (input) => {
    const taskId = must(input["taskId"] as string, "Не указана задача");
    const itemId = (input["itemId"] as string | null) || null;
    if (input["remove"] && itemId) {
      const { error } = await supabaseAdmin.from("task_items").delete().eq("id", itemId);
      if (error) throw new Error(error.message);
      return "Пункт чеклиста удалён";
    }
    if (itemId) {
      const patch: Record<string, unknown> = {};
      if (input["title"] != null) patch["title"] = input["title"];
      if (input["done"] != null) patch["done"] = Boolean(input["done"]);
      const { error } = await supabaseAdmin.from("task_items").update(patch as never).eq("id", itemId);
      if (error) throw new Error(error.message);
      return "Пункт чеклиста обновлён";
    }
    const { count } = await supabaseAdmin
      .from("task_items")
      .select("id", { count: "exact", head: true })
      .eq("task_id", taskId);
    const { error } = await supabaseAdmin.from("task_items").insert({
      task_id: taskId,
      title: String(input["title"] ?? "Пункт"),
      done: Boolean(input["done"]),
      position: count ?? 0,
    } as never);
    if (error) throw new Error(error.message);
    return "Пункт чеклиста добавлен";
  },

  deleteTask: async (input) => {
    const taskId = must(input["taskId"] as string, "Не указана задача");
    const { error } = await supabaseAdmin.from("tasks").delete().eq("id", taskId);
    if (error) throw new Error(error.message);
    return "Задача удалена";
  },

  upsertTaskType: async (input) => {
    const typeId = (input["typeId"] as string | null) || null;
    const row: Record<string, unknown> = {
      name: String(input["name"] ?? "Тип").trim() || "Тип",
      color: String(input["color"] ?? "#3b82f6"),
    };
    if (input["position"] != null) row["position"] = Number(input["position"]);
    if (typeId) {
      const { error } = await supabaseAdmin.from("task_types").update(row as never).eq("id", typeId);
      if (error) throw new Error(error.message);
      return "Тип задачи обновлён";
    }
    const { count } = await supabaseAdmin
      .from("task_types")
      .select("id", { count: "exact", head: true });
    const { error } = await supabaseAdmin
      .from("task_types")
      .insert({ ...row, position: row["position"] ?? count ?? 0 } as never);
    if (error) throw new Error(error.message);
    return "Тип задачи создан";
  },

  deleteTaskType: async (input) => {
    const typeId = must(input["typeId"] as string, "Не указан тип");
    const { error } = await supabaseAdmin.from("task_types").delete().eq("id", typeId);
    if (error) throw new Error(error.message);
    return "Тип задачи удалён";
  },

  upsertMaintenanceServiceItem: async (input) => {
    const itemId = (input["itemId"] as string | null) || null;
    const name = String(input["name"] ?? "").trim() || "Услуга";
    const active = input["active"] == null ? true : Boolean(input["active"]);
    if (itemId) {
      const { error } = await supabaseAdmin
        .from("maintenance_service_items")
        .update({ name, active } as never)
        .eq("id", itemId);
      if (error) throw new Error(error.message);
      return "Услуга обслуживания обновлена";
    }
    const { count } = await supabaseAdmin
      .from("maintenance_service_items")
      .select("id", { count: "exact", head: true });
    const { error } = await supabaseAdmin
      .from("maintenance_service_items")
      .insert({ name, active, position: count ?? 0 } as never);
    if (error) throw new Error(error.message);
    return "Услуга обслуживания создана";
  },

  deleteMaintenanceServiceItem: async (input) => {
    const itemId = must(input["itemId"] as string, "Не указана услуга");
    const { error } = await supabaseAdmin.from("maintenance_service_items").delete().eq("id", itemId);
    if (error) throw new Error(error.message);
    return "Услуга обслуживания удалена";
  },

  setPropertyMaintenanceServices: async (input) => {
    const propertyId = must(input["propertyId"] as string, "Не указан объект");
    const serviceItemIds = Array.isArray(input["serviceItemIds"])
      ? (input["serviceItemIds"] as string[]).filter(Boolean)
      : [];
    const { error: delError } = await supabaseAdmin
      .from("property_maintenance_services")
      .delete()
      .eq("property_id", propertyId);
    if (delError) throw new Error(delError.message);
    if (serviceItemIds.length) {
      const { error } = await supabaseAdmin.from("property_maintenance_services").insert(
        serviceItemIds.map((service_item_id) => ({ property_id: propertyId, service_item_id })) as never,
      );
      if (error) throw new Error(error.message);
    }
    return "Услуги объекта обновлены";
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
