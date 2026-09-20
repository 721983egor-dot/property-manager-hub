import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/lib/auth-user-middleware";
import { storedVideoPath } from "@/lib/property-video";

async function requireAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((row) => row.role === "admin")) {
    throw new Error("Действие доступно только администратору");
  }
}

export const getVideoHostStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { loadVideoHostSettings, publicVideoHostStatus } = await import("@/lib/video-hosts.server");
    return publicVideoHostStatus(await loadVideoHostSettings());
  });

export const saveVideoHostSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as Record<string, unknown>)
  .handler(async ({ context, data: input }) => {
    await requireAdmin(context.userId);
    const { saveVideoHostSettings, loadVideoHostSettings, publicVideoHostStatus } = await import(
      "@/lib/video-hosts.server"
    );
    try {
      await saveVideoHostSettings({
        rutube_email: String(input["rutubeEmail"] ?? ""),
        rutube_password: String(input["rutubePassword"] ?? ""),
        rutube_token: String(input["rutubeToken"] ?? ""),
        rutube_author_id: String(input["rutubeAuthorId"] ?? ""),
        rutube_category_id: Number(input["rutubeCategoryId"] ?? 13) || 13,
        vk_token: String(input["vkToken"] ?? ""),
        vk_group_id: String(input["vkGroupId"] ?? ""),
        youtube_client_id: String(input["youtubeClientId"] ?? ""),
        youtube_client_secret: String(input["youtubeClientSecret"] ?? ""),
        youtube_refresh_token: String(input["youtubeRefreshToken"] ?? ""),
        extra_hashtags: String(input["extraHashtags"] ?? ""),
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Не удалось сохранить настройки видеоканалов");
    }
    return publicVideoHostStatus(await loadVideoHostSettings());
  });

export const publishPropertyVideoFn = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { propertyId: string; filePath?: string })
  .handler(async ({ data: input }) => {
    const path = storedVideoPath(input.filePath);
    const { queuePropertyVideoPublish, publishPropertyVideoToHosts } = await import(
      "@/lib/video-hosts.server"
    );
    if (path) await queuePropertyVideoPublish(input.propertyId, path);
    return publishPropertyVideoToHosts(input.propertyId);
  });
