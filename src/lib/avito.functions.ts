import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AvitoMatchAd = {
  id: string;
  title: string;
  address: string;
  price: number | null;
  url: string;
  propertyId: string;
};

export type AvitoMatchProperty = {
  id: string;
  refId: number | null;
  title: string;
  address: string;
};

export type AvitoMatchBoard = {
  ads: AvitoMatchAd[];
  properties: AvitoMatchProperty[];
  error: string;
};

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((row) => row.role === "admin");
  if (!isAdmin) throw new Error("Действие доступно только администратору");
  return supabaseAdmin;
}

/** Список объявлений Авито и объектов RM OS для ручной привязки. */
export const fetchAvitoMatchBoard = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }): Promise<AvitoMatchBoard> => {
    const supabaseAdmin = await assertAdmin(context.userId);
    try {
      const { fetchAvitoItems } = await import("@/lib/avito.server");
      const [items, propertiesResult, listingsResult] = await Promise.all([
        fetchAvitoItems(),
        supabaseAdmin
          .from("properties")
          .select("id, ref_id, title, internal_name, address, status")
          .neq("status", "archived")
          .order("ref_id", { ascending: true }),
        supabaseAdmin
          .from("property_listings")
          .select("property_id, external_id")
          .eq("platform", "avito")
          .neq("external_id", ""),
      ]);
      if (propertiesResult.error) throw new Error(propertiesResult.error.message);
      if (listingsResult.error) throw new Error(listingsResult.error.message);

      const propertyByItem = new Map<string, string>();
      for (const listing of listingsResult.data ?? []) {
        if (listing.external_id) propertyByItem.set(String(listing.external_id), listing.property_id);
      }

      const ads = items
        .map((item) => ({
          id: item.id,
          title: item.title,
          address: item.address,
          price: item.price,
          url: item.url,
          propertyId: propertyByItem.get(item.id) ?? "",
        }))
        .sort((a, b) => Number(Boolean(a.propertyId)) - Number(Boolean(b.propertyId)) || a.title.localeCompare(b.title, "ru"));

      const properties = (propertiesResult.data ?? []).map((property) => ({
        id: property.id,
        refId: property.ref_id,
        title: property.internal_name?.trim() ? property.internal_name : property.title,
        address: property.address ?? "",
      }));

      return { ads, properties, error: "" };
    } catch (e) {
      return {
        ads: [],
        properties: [],
        error: e instanceof Error ? e.message : "Не удалось загрузить объявления Авито",
      };
    }
  });

type LinkInput = { itemId: string; propertyId: string; url: string };

/** Сохраняет или снимает связку «объявление Авито ↔ объект RM OS». */
export const saveAvitoLink = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: LinkInput) => {
    const itemId = String(input?.itemId ?? "").trim();
    if (!/^\d+$/.test(itemId)) throw new Error("Некорректное объявление Авито");
    const propertyId = String(input?.propertyId ?? "").trim();
    if (propertyId && !UUID_RE.test(propertyId)) throw new Error("Некорректный объект");
    return { itemId, propertyId, url: String(input?.url ?? "").slice(0, 500) };
  })
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const now = new Date().toISOString();

    const { data: current } = await supabaseAdmin
      .from("property_listings")
      .select("property_id")
      .eq("platform", "avito")
      .eq("external_id", data.itemId);

    const previousIds = (current ?? []).map((row) => row.property_id).filter((id) => id !== data.propertyId);
    if (previousIds.length > 0) {
      await supabaseAdmin
        .from("property_listings")
        .delete()
        .eq("platform", "avito")
        .eq("external_id", data.itemId)
        .in("property_id", previousIds);
    }

    if (!data.propertyId) {
      await supabaseAdmin
        .from("chat_threads")
        .update({ property_id: null })
        .eq("source", "avito")
        .eq("external_offer_id", data.itemId);
      return { ok: true };
    }

    const { error } = await supabaseAdmin.from("property_listings").upsert(
      {
        property_id: data.propertyId,
        platform: "avito" as const,
        published: true,
        published_at: now,
        unpublished_at: null,
        external_id: data.itemId,
        external_url: data.url,
        last_synced_at: now,
        sync_status: "linked",
        sync_error: "",
      },
      { onConflict: "property_id,platform" },
    );
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("chat_threads")
      .update({ property_id: data.propertyId })
      .eq("source", "avito")
      .eq("external_offer_id", data.itemId);

    try {
      const { syncAvitoStats } = await import("@/lib/avito-chats.server");
      await syncAvitoStats();
    } catch {
      // Связка уже сохранена. Статистика подтянется ближайшим обновлением.
    }

    return { ok: true };
  });

type PublishInput = { propertyId: string; published: boolean };

/** Публикация или снятие объекта на Авито (включение/выключение в фиде). */
export const setAvitoPublished = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: PublishInput) => {
    if (!input || !UUID_RE.test(input.propertyId)) throw new Error("Некорректный объект");
    return { propertyId: input.propertyId, published: Boolean(input.published) };
  })
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { missingAvitoFields } = await import("@/lib/avito");
    const now = new Date().toISOString();

    const { data: existing } = await supabaseAdmin
      .from("property_listings")
      .select("external_id, external_url")
      .eq("property_id", data.propertyId)
      .eq("platform", "avito")
      .maybeSingle();
    const currentId = String((existing as { external_id?: string } | null)?.external_id ?? "");
    const currentUrl = String((existing as { external_url?: string } | null)?.external_url ?? "");

    if (data.published) {
      const { data: property, error: propError } = await supabaseAdmin
        .from("properties")
        .select("*")
        .eq("id", data.propertyId)
        .single();
      if (propError || !property) throw new Error("Объект не найден");
      const missing = missingAvitoFields(property as never);
      if (missing.length > 0) {
        throw new Error(`Для публикации на Авито заполните: ${missing.join(", ")}`);
      }
    }

    const { error } = await supabaseAdmin.from("property_listings").upsert(
      {
        property_id: data.propertyId,
        platform: "avito" as const,
        published: data.published,
        published_at: data.published ? now : null,
        unpublished_at: data.published ? null : now,
        external_id: currentId,
        external_url: currentUrl,
        last_synced_at: now,
        sync_status: data.published ? "in_feed" : "off_feed",
        sync_error: "",
      },
      { onConflict: "property_id,platform" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Включает или выключает автопубликацию новых объектов в фид Авито. */
export const setAvitoAutoPublish = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { enabled: boolean }) => ({ enabled: Boolean(input?.enabled) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("platform_credentials").upsert(
      { platform: "avito" as const, auto_publish: data.enabled },
      { onConflict: "platform" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Состояние фида Авито: ссылка, флаг автопубликации и счётчики. */
export const getAvitoFeedInfo = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { computeAvitoFeedSelection } = await import("@/lib/avito-feed.server");
    const selection = await computeAvitoFeedSelection();
    return {
      autoPublish: selection.autoPublish,
      inFeed: selection.included.length,
      withErrors: selection.skipped.length,
      feedPath: "/api/public/feeds/avito.xml",
      issues: selection.skipped.map((item) => ({
        label: `${item.property.ref_id} — ${item.property.title}`,
        fields: item.missing,
        blocking: true,
      })),
    };
  });
