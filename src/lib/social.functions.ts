import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";
import type { AssistantAction, AssistantChatMessage, AssistantReply } from "@/lib/ai/types";
import type {
  SocialBoard,
  SocialBrand,
  SocialPlatform,
  SocialPost,
} from "@/lib/social";
import { SOCIAL_PLATFORMS } from "@/lib/social";

async function requireAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Раздел «Соцсети» доступен администратору");
  return supabaseAdmin;
}

function platformsOf(input: unknown): SocialPlatform[] {
  const raw = Array.isArray(input) ? input : [];
  return raw.filter((v): v is SocialPlatform =>
    SOCIAL_PLATFORMS.includes(v as SocialPlatform),
  );
}

export const getSocialBoard = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }): Promise<SocialBoard> => {
    await requireAdmin(context.userId);
    const { loadSocialBoard } = await import("@/lib/social.server");
    return loadSocialBoard();
  });

export const saveSocialConnection = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { token?: string; projectId?: number | null }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdmin(context.userId);
    const { saveSocialConnection } = await import("@/lib/social.server");
    await saveSocialConnection(data);
    return { ok: true };
  });

export const listPostmypostProjects = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { token?: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { listConnectionProjects } = await import("@/lib/social.server");
    return listConnectionProjects(data.token);
  });

export const syncSocialChannels = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { syncSocialChannels } = await import("@/lib/social.server");
    return syncSocialChannels();
  });

export const mapSocialChannel = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { platform: SocialPlatform; accountId: number | null; enabled?: boolean }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { mapSocialChannel } = await import("@/lib/social.server");
    await mapSocialChannel(data);
    return { ok: true };
  });

export const saveSocialBrand = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: SocialBrand) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { saveSocialBrand } = await import("@/lib/social.server");
    await saveSocialBrand(data);
    return { ok: true };
  });

export const saveSocialPost = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    (input: {
      id?: string;
      topic: string;
      body: string;
      platforms: SocialPlatform[];
      propertyId?: string | null;
      scheduledAt?: string | null;
      publish?: boolean;
    }) => ({
      ...input,
      topic: String(input.topic ?? "").trim(),
      body: String(input.body ?? "").trim(),
      platforms: platformsOf(input.platforms),
      scheduledAt: input.scheduledAt || null,
      propertyId: input.propertyId || null,
    }),
  )
  .handler(async ({ context, data }): Promise<SocialPost> => {
    const admin = await requireAdmin(context.userId);
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const { saveSocialPost } = await import("@/lib/social.server");
    return saveSocialPost({
      ...data,
      createdBy: profile?.full_name || profile?.email || "",
      source: "manual",
    });
  });

export const publishSocialPost = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { id: string; immediate?: boolean }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { publishSocialPost } = await import("@/lib/social.server");
    const message = await publishSocialPost(data.id, { immediate: data.immediate });
    return { ok: true, message };
  });

export const cancelSocialPost = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { cancelSocialPost } = await import("@/lib/social.server");
    const message = await cancelSocialPost(data.id);
    return { ok: true, message };
  });

export const deleteSocialPost = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { deleteSocialPost } = await import("@/lib/social.server");
    await deleteSocialPost(data.id);
    return { ok: true };
  });

export const syncSocialStats = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { syncSocialStats } = await import("@/lib/social.server");
    return syncSocialStats();
  });

export const askSocialAssistant = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { messages: AssistantChatMessage[] })
  .handler(async ({ context, data }): Promise<AssistantReply> => {
    await requireAdmin(context.userId);
    const { askSocialAssistantCore } = await import("@/lib/ai/social-run.server");
    return askSocialAssistantCore(data.messages);
  });

export const runSocialAssistantAction = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { action: AssistantAction })
  .handler(async ({ context, data }): Promise<{ ok: boolean; message: string }> => {
    await requireAdmin(context.userId);
    const { executeAssistantAction } = await import("@/lib/ai/executors.server");
    const a = data.action;
    try {
      const message = await executeAssistantAction(a.tool, a.summary, a.input ?? "{}");
      return { ok: true, message };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Не удалось выполнить" };
    }
  });
