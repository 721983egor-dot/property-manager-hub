import { createServerFn } from "@tanstack/react-start";

import type { CianOffer } from "@/lib/cian";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CianConnection = {
  connected: boolean;
  accountLabel: string;
  offersCount: number;
  error: string;
};

/** Проверка подключения кабинета ЦИАН и количества объявлений в нём. */
export const testCianConnection = createServerFn({ method: "POST" }).handler(
  async (): Promise<CianConnection> => {
    try {
      const { countMyOffers } = await import("@/lib/cian.server");
      const offersCount = await countMyOffers();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("platform_credentials").upsert(
        {
          platform: "cian" as const,
          connected_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
          last_error: "",
        },
        { onConflict: "platform" },
      );
      return { connected: true, accountLabel: "Кабинет ЦИАН", offersCount, error: "" };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Не удалось подключиться к ЦИАН";
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("platform_credentials").upsert(
        {
          platform: "cian" as const,
          last_checked_at: new Date().toISOString(),
          last_error: message,
        },
        { onConflict: "platform" },
      );
      return { connected: false, accountLabel: "", offersCount: 0, error: message };
    }
  },
);

/** Список активных объявлений кабинета ЦИАН для экрана сверки. */
export const fetchCianOffers = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ offers: CianOffer[]; error: string }> => {
    try {
      const { fetchCianOffersFull } = await import("@/lib/cian.server");
      const offers = await fetchCianOffersFull();
      return { offers, error: "" };
    } catch (e) {
      return { offers: [], error: e instanceof Error ? e.message : "Ошибка запроса к ЦИАН" };
    }
  },
);

type LinkInput = {
  links: { propertyId: string; externalId: string; externalUrl: string }[];
};

/** Сохраняет связки «объект RM OS ↔ объявление ЦИАН». */
export const linkCianOffers = createServerFn({ method: "POST" })
  .inputValidator((input: LinkInput) => {
    const links = (input?.links ?? []).filter(
      (l) => UUID_RE.test(l.propertyId) && String(l.externalId).trim().length > 0,
    );
    if (links.length === 0) throw new Error("Нечего связывать");
    return { links: links.slice(0, 500) };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const rows = data.links.map((l) => ({
      property_id: l.propertyId,
      platform: "cian" as const,
      published: true,
      published_at: now,
      unpublished_at: null,
      external_id: String(l.externalId),
      external_url: String(l.externalUrl ?? ""),
      last_synced_at: now,
      sync_status: "synced",
      sync_error: "",
    }));
    const { error } = await supabaseAdmin
      .from("property_listings")
      .upsert(rows, { onConflict: "property_id,platform" });
    if (error) throw new Error(error.message);
    return { ok: true, linked: rows.length };
  });

type PropertyInput = { propertyId: string };

const validateProperty = (input: PropertyInput) => {
  if (!input || !UUID_RE.test(input.propertyId)) throw new Error("Некорректный объект");
  return { propertyId: input.propertyId };
};

export type PlatformDayStat = {
  date: string;
  impressions: number;
  views: number;
  contact_views: number;
  calls: number;
  messages: number;
  favorites: number;
};

/** Обновляет статистику ЦИАН по объекту и возвращает её за период. */
export const syncCianStats = createServerFn({ method: "POST" })
  .inputValidator((input: { propertyId: string; from: string; to: string }) => {
    if (!input || !UUID_RE.test(input.propertyId)) throw new Error("Некорректный объект");
    return { propertyId: input.propertyId, from: input.from, to: input.to };
  })
  .handler(async ({ data }): Promise<{ days: PlatformDayStat[]; error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: listing } = await supabaseAdmin
      .from("property_listings")
      .select("external_id")
      .eq("property_id", data.propertyId)
      .eq("platform", "cian")
      .maybeSingle();
    const externalId = (listing as { external_id?: string } | null)?.external_id ?? "";
    const offerId = Number(externalId);
    if (!externalId || !Number.isFinite(offerId)) {
      return { days: [], error: "Объект не связан с объявлением на ЦИАН" };
    }

    let error = "";
    try {
      const { fetchOfferStatsByDays } = await import("@/lib/cian.server");
      const days = await fetchOfferStatsByDays(offerId, data.from, data.to);
      if (days.length > 0) {
        await supabaseAdmin.from("listing_stats").upsert(
          days.map((d) => ({
            property_id: data.propertyId,
            platform: "cian" as const,
            ...d,
          })),
          { onConflict: "property_id,platform,date" },
        );
      }
      await supabaseAdmin
        .from("property_listings")
        .update({
          last_synced_at: new Date().toISOString(),
          sync_status: "synced",
          sync_error: "",
        })
        .eq("property_id", data.propertyId)
        .eq("platform", "cian");
    } catch (e) {
      error = e instanceof Error ? e.message : "Не удалось получить статистику ЦИАН";
    }

    const { data: stored } = await supabaseAdmin
      .from("listing_stats")
      .select("date, impressions, views, contact_views, calls, messages, favorites")
      .eq("property_id", data.propertyId)
      .eq("platform", "cian")
      .gte("date", data.from)
      .lte("date", data.to)
      .order("date", { ascending: true });

    return { days: (stored ?? []) as PlatformDayStat[], error };
  });

export type PlatformMessage = {
  id: string;
  author: string;
  direction: string;
  body: string;
  sent_at: string;
};

/** Подтягивает сообщения из чатов ЦИАН по объявлению. */
export const syncCianMessages = createServerFn({ method: "POST" })
  .inputValidator(validateProperty)
  .handler(async ({ data }): Promise<{ messages: PlatformMessage[]; error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: listing } = await supabaseAdmin
      .from("property_listings")
      .select("external_id")
      .eq("property_id", data.propertyId)
      .eq("platform", "cian")
      .maybeSingle();
    const externalId = (listing as { external_id?: string } | null)?.external_id ?? "";
    const offerId = Number(externalId);

    let error = "";
    if (!externalId || !Number.isFinite(offerId)) {
      error = "Объект не связан с объявлением на ЦИАН";
    } else {
      try {
        const { fetchChats, fetchChatMessages } = await import("@/lib/cian.server");
        const chats = (await fetchChats()).filter((c) => c.offerId === offerId);

        for (const chat of chats.slice(0, 5)) {
          const messages = await fetchChatMessages(chat.chatId);
          const upserts = messages
            .filter((m) => m.messageId)
            .map((m) => ({
              property_id: data.propertyId,
              platform: "cian" as const,
              external_chat_id: String(m.chatId),
              external_message_id: m.messageId,
              author: m.author,
              direction: m.direction,
              body: m.text,
              sent_at: m.createdAt || new Date().toISOString(),
            }));
          if (upserts.length > 0) {
            await supabaseAdmin
              .from("listing_messages")
              .upsert(upserts, { onConflict: "platform,external_message_id" });
          }
        }
      } catch (e) {
        error = e instanceof Error ? e.message : "Не удалось получить сообщения ЦИАН";
      }
    }

    const { data: stored } = await supabaseAdmin
      .from("listing_messages")
      .select("id, author, direction, body, sent_at")
      .eq("property_id", data.propertyId)
      .eq("platform", "cian")
      .order("sent_at", { ascending: false })
      .limit(50);

    return { messages: (stored ?? []) as PlatformMessage[], error };
  });

/** Публикация или снятие объекта на ЦИАН (включение/выключение в фиде). */
export const setCianPublished = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { propertyId: string; published: boolean })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { missingCianFields } = await import("@/lib/cian");

    const now = new Date().toISOString();
    let externalId: string | undefined;

    if (data.published) {
      const { data: property, error: propError } = await supabaseAdmin
        .from("properties")
        .select("*")
        .eq("id", data.propertyId)
        .single();
      if (propError || !property) throw new Error("Объект не найден");
      const missing = missingCianFields(property as never);
      if (missing.length > 0) {
        throw new Error(`Для публикации на ЦИАН заполните: ${missing.join(", ")}`);
      }
      const { data: existing } = await supabaseAdmin
        .from("property_listings")
        .select("external_id")
        .eq("property_id", data.propertyId)
        .eq("platform", "cian")
        .maybeSingle();
      externalId = (existing as { external_id?: string } | null)?.external_id || data.propertyId;
    }

    const { error } = await supabaseAdmin.from("property_listings").upsert(
      {
        property_id: data.propertyId,
        platform: "cian" as const,
        published: data.published,
        published_at: data.published ? now : null,
        unpublished_at: data.published ? null : now,
        ...(externalId ? { external_id: externalId } : {}),
        last_synced_at: now,
        sync_status: data.published ? "in_feed" : "off_feed",
        sync_error: "",
      },
      { onConflict: "property_id,platform" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Включает или выключает автопубликацию новых объектов в фид ЦИАН. */
export const setCianAutoPublish = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { enabled: boolean })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("platform_credentials")
      .update({ auto_publish: data.enabled })
      .eq("platform", "cian");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Состояние фида ЦИАН: ссылка, флаг автопубликации и счётчики. */
export const getCianFeedInfo = createServerFn({ method: "GET" }).handler(async () => {
  const { computeFeedSelection } = await import("@/lib/cian-feed.server");
  const selection = await computeFeedSelection();
  return {
    autoPublish: selection.autoPublish,
    inFeed: selection.included.length,
    withErrors: selection.skipped.length,
    feedPath: "/api/public/feeds/cian.xml",
  };
});
