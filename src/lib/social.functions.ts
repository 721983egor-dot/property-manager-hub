import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";
import type { AssistantAction, AssistantChatMessage, AssistantReply } from "@/lib/ai/types";
import type {
  SocialBoard,
  SocialBrand,
  SocialPlatform,
  SocialPost,
  SocialStory,
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

export const draftSocialStoryFromPost = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { postId: string }) => ({
    postId: String(input.postId ?? "").trim(),
  }))
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    if (!data.postId) throw new Error("Выберите пост");
    const { buildStoryDraftFromPost } = await import("@/lib/social-stories.server");
    return buildStoryDraftFromPost(data.postId);
  });

export const saveSocialStory = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    (input: {
      id?: string;
      topic: string;
      body: string;
      platforms: SocialPlatform[];
      fromPostId?: string | null;
      propertyId?: string | null;
      scheduledAt?: string | null;
      publish?: boolean;
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
      fromPostId: input.fromPostId || null,
      propertyId: input.propertyId || null,
      media: Array.isArray(input.media)
        ? input.media
            .slice(0, 1)
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
  .handler(async ({ context, data }): Promise<SocialStory> => {
    const admin = await requireSocialOwner(context.userId);
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const { saveSocialStory } = await import("@/lib/social-stories.server");
    return saveSocialStory({
      topic: data.topic,
      body: data.body,
      platforms: data.platforms,
      scheduledAt: data.scheduledAt,
      fromPostId: data.fromPostId,
      propertyId: data.propertyId,
      ...(data.id ? { id: data.id } : {}),
      ...(data.publish != null ? { publish: data.publish } : {}),
      ...(data.media ? { media: data.media } : {}),
      createdBy: profile?.full_name || profile?.email || "",
      source: "manual",
    });
  });

export const publishSocialStory = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { id: string; immediate?: boolean }) => input)
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    const { publishSocialStory } = await import("@/lib/social-stories.server");
    const message = await publishSocialStory(
      data.id,
      data.immediate != null ? { immediate: data.immediate } : {},
    );
    return { ok: true, message };
  });

export const cancelSocialStory = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    const { cancelSocialStory } = await import("@/lib/social-stories.server");
    const message = await cancelSocialStory(data.id);
    return { ok: true, message };
  });

export const deleteSocialStory = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    const { deleteSocialStory } = await import("@/lib/social-stories.server");
    await deleteSocialStory(data.id);
    return { ok: true };
  });

export const saveSiteArticle = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    (input: {
      id?: string;
      title: string;
      slug?: string;
      excerpt?: string;
      body: string;
      seoTitle?: string;
      seoDescription?: string;
      coverUrl?: string;
      propertyId?: string | null;
      publish?: boolean;
    }) => ({
      ...input,
      title: String(input.title ?? "").trim(),
      slug: String(input.slug ?? "").trim(),
      excerpt: String(input.excerpt ?? "").trim(),
      body: String(input.body ?? "").trim(),
      seoTitle: String(input.seoTitle ?? "").trim(),
      seoDescription: String(input.seoDescription ?? "").trim(),
      coverUrl: String(input.coverUrl ?? "").trim(),
      propertyId: input.propertyId || null,
    }),
  )
  .handler(async ({ context, data }) => {
    const admin = await requireSocialOwner(context.userId);
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const { saveSiteArticle } = await import("@/lib/site-articles.server");
    return saveSiteArticle({
      title: data.title,
      body: data.body,
      slug: data.slug,
      excerpt: data.excerpt,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      coverUrl: data.coverUrl,
      propertyId: data.propertyId,
      ...(data.id ? { id: data.id } : {}),
      ...(data.publish != null ? { publish: data.publish } : {}),
      createdBy: profile?.full_name || profile?.email || "",
      source: "manual",
    });
  });

export const publishSiteArticle = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    const { publishSiteArticle } = await import("@/lib/site-articles.server");
    const article = await publishSiteArticle(data.id);
    return { ok: true, article, message: "Статья опубликована на сайте" };
  });

export const unpublishSiteArticle = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    const { unpublishSiteArticle } = await import("@/lib/site-articles.server");
    const article = await unpublishSiteArticle(data.id);
    return { ok: true, article, message: "Статья снята с публикации" };
  });

export const deleteSiteArticle = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    const { deleteSiteArticle } = await import("@/lib/site-articles.server");
    await deleteSiteArticle(data.id);
    return { ok: true };
  });

/** Черновик соцпоста-выжимки из статьи (без авто-публикации). */
export const draftSocialPostFromArticle = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { articleId: string; platforms?: SocialPlatform[] }) => ({
    articleId: String(input.articleId ?? "").trim(),
    platforms: platformsOf(input.platforms),
  }))
  .handler(async ({ context, data }) => {
    const admin = await requireSocialOwner(context.userId);
    if (!data.articleId) throw new Error("Выберите статью");
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const {
      buildSocialExcerptFromArticle,
      loadSiteArticleById,
    } = await import("@/lib/site-articles.server");
    const article = await loadSiteArticleById(data.articleId);
    if (!article) throw new Error("Статья не найдена");
    const excerpt = buildSocialExcerptFromArticle(article);
    const { loadSocialChannels, saveSocialPost } = await import("@/lib/social.server");
    const channels = await loadSocialChannels();
    const platforms =
      data.platforms.length > 0
        ? data.platforms
        : channels.filter((c) => c.enabled).map((c) => c.platform);
    if (!platforms.length) throw new Error("Нет включённых каналов");
    const post = await saveSocialPost({
      topic: excerpt.topic,
      body: excerpt.body,
      platforms,
      propertyId: excerpt.propertyId,
      articleId: excerpt.articleId,
      publish: false,
      createdBy: profile?.full_name || profile?.email || "",
      source: "manual",
    });
    return post;
  });

export const getSocialHitAnalytics = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { days?: number } | undefined) => ({
    days: input?.days && input.days > 0 ? Math.min(input.days, 90) : 30,
  }))
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    const { loadSocialHitAnalytics } = await import("@/lib/social-analytics.server");
    return loadSocialHitAnalytics(data.days);
  });

export const updateSocialPostHitMeta = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    (input: {
      postId: string;
      contentMix?: "life_sochi" | "relocation" | "property" | "company" | "other" | null;
      manualHit?: boolean;
      hitNote?: string;
    }) => ({
      postId: String(input.postId ?? "").trim(),
      contentMix: input.contentMix === undefined ? undefined : input.contentMix,
      manualHit: input.manualHit,
      hitNote: input.hitNote,
    }),
  )
  .handler(async ({ context, data }) => {
    await requireSocialOwner(context.userId);
    if (!data.postId) throw new Error("Не указан пост");
    const { updateSocialPostHitMeta } = await import("@/lib/social-analytics.server");
    await updateSocialPostHitMeta({
      postId: data.postId,
      ...(data.contentMix !== undefined ? { contentMix: data.contentMix } : {}),
      ...(data.manualHit !== undefined ? { manualHit: data.manualHit } : {}),
      ...(data.hitNote !== undefined ? { hitNote: data.hitNote } : {}),
    });
    return { ok: true as const };
  });
