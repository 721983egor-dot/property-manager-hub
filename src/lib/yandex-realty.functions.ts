import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((row) => row.role === "admin")) {
    throw new Error("Действие доступно только администратору");
  }
  return supabaseAdmin;
}

/** Публикация или снятие объекта на Яндекс Недвижимости (включение/выключение в фиде). */
export const setYandexPublished = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => {
    const data = input as { propertyId?: string; published?: boolean };
    if (!data?.propertyId || !UUID_RE.test(data.propertyId)) throw new Error("Некорректный объект");
    return { propertyId: data.propertyId, published: Boolean(data.published) };
  })
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { missingYandexFields } = await import("@/lib/yandex");

    const now = new Date().toISOString();
    const { data: existing } = await supabaseAdmin
      .from("property_listings")
      .select("external_id, external_url")
      .eq("property_id", data.propertyId)
      .eq("platform", "yandex")
      .maybeSingle();
    const currentId = String((existing as { external_id?: string } | null)?.external_id ?? "") || data.propertyId;
    const currentUrl = String((existing as { external_url?: string } | null)?.external_url ?? "");

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
    }

    const { error } = await supabaseAdmin.from("property_listings").upsert(
      {
        property_id: data.propertyId,
        platform: "yandex" as const,
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

/** Включает или выключает автопубликацию новых объектов в фид Яндекса. */
export const setYandexAutoPublish = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => ({ enabled: Boolean((input as { enabled?: boolean })?.enabled) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("platform_credentials")
      .upsert({ platform: "yandex" as const, auto_publish: data.enabled }, { onConflict: "platform" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Состояние фида Яндекса: ссылка, флаг автопубликации и счётчики. */
export const getYandexFeedInfo = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { computeYandexFeedSelection } = await import("@/lib/yandex-feed.server");
    const selection = await computeYandexFeedSelection();
    return {
      autoPublish: selection.autoPublish,
      inFeed: selection.included.length,
      withErrors: selection.skipped.length,
      feedPath: "/api/public/feeds/yandex.xml",
      issues: selection.skipped.map((item) => ({
        label: `${item.property.ref_id} — ${item.property.title}`,
        fields: item.missing,
        blocking: true,
      })),
    };
  });
