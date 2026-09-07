import { createServerFn } from "@tanstack/react-start";

/** Публикация или снятие объекта на Яндекс Недвижимости (включение/выключение в фиде). */
export const setYandexPublished = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { propertyId: string; published: boolean })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { missingYandexFields } = await import("@/lib/yandex");

    const now = new Date().toISOString();
    let externalId: string | undefined;

    if (data.published) {
      const { data: property, error: propError } = await supabaseAdmin
        .from("properties")
        .select("*")
        .eq("id", data.propertyId)
        .single();
      if (propError || !property) throw new Error("Объект не найден");
      const missing = missingYandexFields(property as never);
      if (missing.length > 0) {
        throw new Error(`Для публикации на Яндекс Недвижимость заполните: ${missing.join(", ")}`);
      }
      const { data: existing } = await supabaseAdmin
        .from("property_listings")
        .select("external_id")
        .eq("property_id", data.propertyId)
        .eq("platform", "yandex")
        .maybeSingle();
      externalId = (existing as { external_id?: string } | null)?.external_id || data.propertyId;
    }

    const { error } = await supabaseAdmin.from("property_listings").upsert(
      {
        property_id: data.propertyId,
        platform: "yandex" as const,
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

/** Включает или выключает автопубликацию новых объектов в фид Яндекса. */
export const setYandexAutoPublish = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { enabled: boolean })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("platform_credentials")
      .upsert(
        { platform: "yandex" as const, auto_publish: data.enabled },
        { onConflict: "platform" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Состояние фида Яндекса: ссылка, флаг автопубликации и счётчики. */
export const getYandexFeedInfo = createServerFn({ method: "GET" }).handler(async () => {
  const { computeYandexFeedSelection } = await import("@/lib/yandex-feed.server");
  const selection = await computeYandexFeedSelection();
  return {
    autoPublish: selection.autoPublish,
    inFeed: selection.included.length,
    withErrors: selection.skipped.length,
    feedPath: "/api/public/feeds/yandex.xml",
  };
});
