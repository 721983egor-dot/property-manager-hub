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
import type { PropertySocialDraft, SocialPropertyMediaKind, SocialPropertyOption } from "@/lib/social.server";
import { userHasSocialOwner } from "@/lib/staff.functions";

async function requireSocialOwner(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!(await userHasSocialOwner(userId))) {
    throw new Error("Раздел «Соцсети» доступен с ролью social_owner");
  }
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
    await requireSocialOwner(context.userId);
    const { loadSocialBoard } = await import("@/lib/social.server");
    return loadSocialBoard();
  });

export const listSocialProperties = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }): Promise<SocialPropertyOption[]> => {
    await requireSocialOwner(context.userId);
    const { listSocialPropertyOptions } = await import("@/lib/social.server");
    return listSocialPropertyOptions();
  });

export const draftSocialPostFromProperty = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    (input: { propertyId: string; mediaKind?: SocialPropertyMediaKind }) => ({
      propertyId: String(input.propertyId ?? "").trim(),
      mediaKind: (input.mediaKind ?? "auto") as SocialPropertyMediaKind,
    }),
  )
  .handler(async ({ context, data }): Promise<PropertySocialDraft> => {
    await requireSocialOwner(context.userId);
    if (!data.propertyId) throw new Error("Выберите объект");
    const { buildPropertySocialDraft } = await import("@/lib/social.server");
    return buildPropertySocialDraft(data.propertyId, data.mediaKind);
  });

export const saveSocialConnection = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { token?: string; projectId?: number | null }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireSocialOwner(context.userId);
    const { saveSocialConnection } = await import("@/lib/social.server");
    await saveSocialConnection(data);
    return { ok: true };
  });

export const listPostmypostProjects = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { token?: string }) => input)
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    const { listConnectionProjects } = await import("@/lib/social.server");
    return listConnectionProjects(data.token);
  });

export const syncSocialChannels = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    await requireSocialOwner(context.userId);
    const { syncSocialChannels } = await import("@/lib/social.server");
    return syncSocialChannels();
  });

export const mapSocialChannel = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { platform: SocialPlatform; accountId: number | null; enabled?: boolean }) => input)
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    const { mapSocialChannel } = await import("@/lib/social.server");
    await mapSocialChannel(data);
    return { ok: true };
  });

export const saveSocialBrand = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: SocialBrand) => input)
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
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
      pulseItemId?: string | null;
      objectUrl?: string;
      scheduledAt?: string | null;
      publish?: boolean;
      variants?: Partial<Record<SocialPlatform, string>>;
      media?: {
        path: string;
        kind: "photo" | "video";
        mime: string;
        bytes: number;
        width?: number | null;
        height?: number | null;
        durationSec?: number | null;
      }[];
    }) => ({
      ...input,
      topic: String(input.topic ?? "").trim(),
      body: String(input.body ?? "").trim(),
      platforms: platformsOf(input.platforms),
      scheduledAt: input.scheduledAt || null,
      propertyId: input.propertyId || null,
      objectUrl: String(input.objectUrl ?? "").trim(),
      media: Array.isArray(input.media)
        ? input.media
            .slice(0, 10)
            .map((item) => ({
              path: String(item.path ?? "").trim(),
              kind: item.kind === "video" ? ("video" as const) : ("photo" as const),
              mime: String(item.mime ?? ""),
              bytes: Number(item.bytes ?? 0),
              width: item.width ?? null,
              height: item.height ?? null,
              durationSec: item.durationSec ?? null,
            }))
            .filter((item) => item.path)
        : undefined,
    }),
  )
  .handler(async ({ context, data }): Promise<SocialPost> => {
    const admin = await requireSocialOwner(context.userId);
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const { saveSocialPost } = await import("@/lib/social.server");
    return saveSocialPost({
      topic: data.topic,
      body: data.body,
      platforms: data.platforms,
      scheduledAt: data.scheduledAt,
      propertyId: data.propertyId,
      ...(data.objectUrl ? { objectUrl: data.objectUrl } : {}),
      ...(data.id ? { id: data.id } : {}),
      ...(data.pulseItemId !== undefined ? { pulseItemId: data.pulseItemId } : {}),
      ...(data.publish != null ? { publish: data.publish } : {}),
      ...(data.variants ? { variants: data.variants } : {}),
      ...(data.media ? { media: data.media } : {}),
      createdBy: profile?.full_name || profile?.email || "",
      source: "manual",
    });
  });

export const publishSocialPost = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { id: string; immediate?: boolean }) => input)
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    const { publishSocialPost } = await import("@/lib/social.server");
    const message = await publishSocialPost(
      data.id,
      data.immediate != null ? { immediate: data.immediate } : {},
    );
    return { ok: true, message };
  });

export const cancelSocialPost = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    const { cancelSocialPost } = await import("@/lib/social.server");
    const message = await cancelSocialPost(data.id);
    return { ok: true, message };
  });

export const deleteSocialPost = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    const { deleteSocialPost } = await import("@/lib/social.server");
    await deleteSocialPost(data.id);
    return { ok: true };
  });

export const syncSocialStats = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    await requireSocialOwner(context.userId);
    const { syncSocialStats } = await import("@/lib/social.server");
    return syncSocialStats();
  });

export const askSocialAssistant = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { messages: AssistantChatMessage[] })
  .handler(async ({ context, data }): Promise<AssistantReply> => {
    await requireSocialOwner(context.userId);
    const { askSocialAssistantCore } = await import("@/lib/ai/social-run.server");
    return askSocialAssistantCore(data.messages);
  });

export const runSocialAssistantAction = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { action: AssistantAction })
  .handler(async ({ context, data }): Promise<{ ok: boolean; message: string }> => {
    await requireSocialOwner(context.userId);
    const { executeAssistantAction } = await import("@/lib/ai/executors.server");
    const a = data.action;
    try {
      const message = await executeAssistantAction(a.tool, a.summary, a.input ?? "{}");
      return { ok: true, message };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Не удалось выполнить" };
    }
  });

export const getSochiPulse = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { force?: boolean } | undefined) => ({
    force: Boolean(input?.force),
  }))
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    const { loadSochiPulse } = await import("@/lib/sochi-pulse.server");
    return loadSochiPulse({ force: data.force });
  });
