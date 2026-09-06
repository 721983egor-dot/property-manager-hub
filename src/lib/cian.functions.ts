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
    const { cianRequest, extractOffers } = await import("@/lib/cian.server");
    try {
      const payload = await cianRequest<unknown>("/get-orders/", { body: {} });
      const offers = extractOffers(payload);
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
      return { connected: true, accountLabel: "Кабинет ЦИАН", offersCount: offers.length, error: "" };
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
    const { cianRequest, extractOffers, normalizeOffer } = await import("@/lib/cian.server");
    try {
      const payload = await cianRequest<unknown>("/get-orders/", { body: {} });
      const offers = extractOffers(payload)
        .map(normalizeOffer)
        .filter((o) => o.externalId);
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

/** Публикация объекта на ЦИАН. */
export const publishToCian = createServerFn({ method: "POST" })
  .inputValidator(validateProperty)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildCianOfferPayload } = await import("@/lib/cian-payload.server");
    const { cianRequest } = await import("@/lib/cian.server");

    const { data: property, error: propError } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (propError) throw new Error(propError.message);
    if (!property) throw new Error("Объект не найден");

    const now = new Date().toISOString();
    try {
      const payload = await buildCianOfferPayload(property as Record<string, unknown>);
      const result = await cianRequest<Record<string, unknown>>("/upload-offers/", {
        body: payload,
      });
      const externalId = String(
        (result["id"] ?? result["offerId"] ?? result["externalId"] ?? "") as string,
      );

      await supabaseAdmin.from("property_listings").upsert(
        {
          property_id: data.propertyId,
          platform: "cian" as const,
          published: true,
          published_at: now,
          unpublished_at: null,
          external_id: externalId,
          external_url: externalId ? `https://www.cian.ru/rent/flat/${externalId}/` : "",
          last_synced_at: now,
          sync_status: "synced",
          sync_error: "",
        },
        { onConflict: "property_id,platform" },
      );
      return { ok: true, externalId };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Не удалось опубликовать на ЦИАН";
      await supabaseAdmin.from("property_listings").upsert(
        {
          property_id: data.propertyId,
          platform: "cian" as const,
          published: false,
          last_synced_at: now,
          sync_status: "error",
          sync_error: message,
        },
        { onConflict: "property_id,platform" },
      );
      throw new Error(message);
    }
  });

/** Снятие объявления с публикации на ЦИАН. */
export const unpublishFromCian = createServerFn({ method: "POST" })
  .inputValidator(validateProperty)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { cianRequest } = await import("@/lib/cian.server");

    const { data: listing } = await supabaseAdmin
      .from("property_listings")
      .select("external_id")
      .eq("property_id", data.propertyId)
      .eq("platform", "cian")
      .maybeSingle();

    const now = new Date().toISOString();
    const externalId = (listing as { external_id?: string } | null)?.external_id ?? "";

    if (externalId) {
      await cianRequest("/delete-offers/", { body: { externalIds: [externalId] } });
    }

    const { error } = await supabaseAdmin.from("property_listings").upsert(
      {
        property_id: data.propertyId,
        platform: "cian" as const,
        published: false,
        unpublished_at: now,
        last_synced_at: now,
        sync_status: "idle",
        sync_error: "",
      },
      { onConflict: "property_id,platform" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

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
    const { cianRequest } = await import("@/lib/cian.server");

    const { data: listing } = await supabaseAdmin
      .from("property_listings")
      .select("external_id")
      .eq("property_id", data.propertyId)
      .eq("platform", "cian")
      .maybeSingle();
    const externalId = (listing as { external_id?: string } | null)?.external_id ?? "";
    if (!externalId) return { days: [], error: "Объект не связан с объявлением на ЦИАН" };

    let error = "";
    try {
      const payload = await cianRequest<Record<string, unknown>>("/get-offers-statistics/", {
        body: { offerIds: [Number(externalId) || externalId], dateFrom: data.from, dateTo: data.to },
      });
      const rows = Array.isArray(payload["items"])
        ? (payload["items"] as Record<string, unknown>[])
        : Array.isArray(payload["statistics"])
          ? (payload["statistics"] as Record<string, unknown>[])
          : [];

      const toInt = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.round(n) : 0;
      };

      const upserts = rows.map((r) => ({
        property_id: data.propertyId,
        platform: "cian" as const,
        date: String(r["date"] ?? "").slice(0, 10),
        impressions: toInt(r["showsCount"] ?? r["impressions"]),
        views: toInt(r["viewsCount"] ?? r["views"]),
        contact_views: toInt(r["phoneShowsCount"] ?? r["contactViews"]),
        calls: toInt(r["callsCount"] ?? r["calls"]),
        messages: toInt(r["messagesCount"] ?? r["messages"]),
        favorites: toInt(r["favoritesCount"] ?? r["favorites"]),
      })).filter((r) => r.date.length === 10);

      if (upserts.length > 0) {
        await supabaseAdmin
          .from("listing_stats")
          .upsert(upserts, { onConflict: "property_id,platform,date" });
      }
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

/** Подтягивает сообщения из чата ЦИАН по объявлению. */
export const syncCianMessages = createServerFn({ method: "POST" })
  .inputValidator(validateProperty)
  .handler(async ({ data }): Promise<{ messages: PlatformMessage[]; error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { cianRequest } = await import("@/lib/cian.server");

    const { data: listing } = await supabaseAdmin
      .from("property_listings")
      .select("external_id")
      .eq("property_id", data.propertyId)
      .eq("platform", "cian")
      .maybeSingle();
    const externalId = (listing as { external_id?: string } | null)?.external_id ?? "";

    let error = "";
    if (externalId) {
      try {
        const payload = await cianRequest<Record<string, unknown>>("/get-messages/", {
          body: { offerId: Number(externalId) || externalId },
        });
        const rows = Array.isArray(payload["messages"])
          ? (payload["messages"] as Record<string, unknown>[])
          : Array.isArray(payload["items"])
            ? (payload["items"] as Record<string, unknown>[])
            : [];

        const upserts = rows
          .map((r) => ({
            property_id: data.propertyId,
            platform: "cian" as const,
            external_chat_id: String(r["chatId"] ?? ""),
            external_message_id: String(r["id"] ?? r["messageId"] ?? ""),
            author: String(r["authorName"] ?? r["author"] ?? "Клиент"),
            direction: String(r["direction"] ?? "in"),
            body: String(r["text"] ?? r["content"] ?? ""),
            sent_at: String(r["createdAt"] ?? r["sentAt"] ?? new Date().toISOString()),
          }))
          .filter((r) => r.external_message_id);

        if (upserts.length > 0) {
          await supabaseAdmin
            .from("listing_messages")
            .upsert(upserts, { onConflict: "platform,external_message_id" });
        }
      } catch (e) {
        error = e instanceof Error ? e.message : "Не удалось получить сообщения ЦИАН";
      }
    } else {
      error = "Объект не связан с объявлением на ЦИАН";
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
