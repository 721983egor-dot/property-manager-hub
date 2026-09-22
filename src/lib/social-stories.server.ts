import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createPostmypostPublication,
  deletePostmypostPublication,
  getPostmypostToken,
  uploadFileDirect,
} from "@/lib/postmypost.server";
import {
  SOCIAL_PLATFORMS,
  STORY_PLATFORM_INFO,
  type SocialChannel,
  type SocialPlatform,
  type SocialPostStatus,
  type SocialStory,
  type SocialStoryTarget,
  type StoryDelivery,
} from "@/lib/social";
import {
  socialMediaDisplayUrl,
  type SocialMediaItem,
} from "@/lib/social-media";
import { downloadSocialMedia, signedSocialMediaUrls } from "@/lib/social-media.server";
import { loadSocialChannels, loadSocialPosts } from "@/lib/social.server";

const STORY_COLUMNS =
  "id, status, topic, body, from_post_id, property_id, scheduled_at, published_at, created_by, source, postmypost_publication_id, last_error, created_at";
const TARGET_COLUMNS =
  "id, story_id, channel_id, platform, body, status, delivery, postmypost_account_id, external_url, last_error";
const MEDIA_COLUMNS =
  "id, story_id, kind, path, mime, bytes, width, height, duration_sec, sort_order, postmypost_file_id";

/** Для сторис обычно один кадр/ролик. */
export const STORY_MEDIA_MAX_ITEMS = 1;

function isPlatform(value: string): value is SocialPlatform {
  return SOCIAL_PLATFORMS.includes(value as SocialPlatform);
}

function deliveryFor(platform: SocialPlatform): StoryDelivery {
  return STORY_PLATFORM_INFO[platform].delivery;
}

function moscowIso(date = new Date()) {
  const shifted = new Date(date.getTime() + 3 * 3600_000);
  return shifted.toISOString().replace("Z", "+03:00");
}

/** Короткая подпись сторис из текста поста. */
export function storyCaptionFromPostBody(body: string, maxLen = 120): string {
  const clean = body.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 40 ? cut.slice(0, sp) : cut).trim()}…`;
}

function mapStory(
  row: Record<string, unknown>,
  targets: SocialStoryTarget[],
  propertyTitle: string | null,
  fromPostTopic: string | null,
  media: SocialMediaItem[],
): SocialStory {
  return {
    id: String(row["id"]),
    status: row["status"] as SocialPostStatus,
    topic: String(row["topic"] ?? ""),
    body: String(row["body"] ?? ""),
    from_post_id: (row["from_post_id"] as string | null) ?? null,
    from_post_topic: fromPostTopic,
    property_id: (row["property_id"] as string | null) ?? null,
    property_title: propertyTitle,
    scheduled_at: (row["scheduled_at"] as string | null) ?? null,
    published_at: (row["published_at"] as string | null) ?? null,
    created_by: String(row["created_by"] ?? ""),
    source: row["source"] === "assistant" ? "assistant" : "manual",
    postmypost_publication_id: (row["postmypost_publication_id"] as number | null) ?? null,
    last_error: String(row["last_error"] ?? ""),
    created_at: String(row["created_at"]),
    targets,
    media,
  };
}

export async function loadSocialStories(limit = 80): Promise<SocialStory[]> {
  const { data, error } = await supabaseAdmin
    .from("social_stories")
    .select(STORY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  const stories = (data ?? []) as Record<string, unknown>[];
  if (!stories.length) return [];

  const ids = stories.map((s) => String(s["id"]));
  const propertyIds = stories.map((s) => s["property_id"]).filter(Boolean) as string[];
  const fromPostIds = stories.map((s) => s["from_post_id"]).filter(Boolean) as string[];

  const [{ data: targets }, { data: properties }, { data: fromPosts }, mediaRes] = await Promise.all([
    supabaseAdmin.from("social_story_targets").select(TARGET_COLUMNS).in("story_id", ids),
    propertyIds.length
      ? supabaseAdmin.from("properties").select("id, title, internal_name, ref_id").in("id", propertyIds)
      : Promise.resolve({ data: [] as { id: string; title: string; internal_name: string | null; ref_id: number }[] }),
    fromPostIds.length
      ? supabaseAdmin.from("social_posts").select("id, topic, body").in("id", fromPostIds)
      : Promise.resolve({ data: [] as { id: string; topic: string; body: string }[] }),
    supabaseAdmin
      .from("social_story_media")
      .select(MEDIA_COLUMNS)
      .in("story_id", ids)
      .order("sort_order", { ascending: true }),
  ]);

  const mediaRows = mediaRes.error ? [] : (mediaRes.data ?? []);
  const urls = await signedSocialMediaUrls(mediaRows.map((row) => String(row["path"] ?? "")));
  const mediaByStory = new Map<string, SocialMediaItem[]>();
  for (const row of mediaRows) {
    const storyId = String(row["story_id"] ?? "");
    const path = String(row["path"] ?? "");
    const list = mediaByStory.get(storyId) ?? [];
    list.push({
      id: String(row["id"]),
      kind: row["kind"] === "video" ? "video" : "photo",
      path,
      mime: String(row["mime"] ?? ""),
      bytes: Number(row["bytes"] ?? 0),
      width: (row["width"] as number | null) ?? null,
      height: (row["height"] as number | null) ?? null,
      durationSec: row["duration_sec"] == null ? null : Number(row["duration_sec"]),
      url: urls[path] ?? socialMediaDisplayUrl(path),
      sortOrder: Number(row["sort_order"] ?? 0),
    });
    mediaByStory.set(storyId, list);
  }

  const titleById = new Map(
    (properties ?? []).map((p) => [p.id, String(p.internal_name || p.title || `№${p.ref_id}`)]),
  );
  const postTopicById = new Map(
    (fromPosts ?? []).map((p) => [p.id, String(p.topic || p.body.slice(0, 60) || "Пост")]),
  );

  const targetsByStory = new Map<string, SocialStoryTarget[]>();
  for (const raw of (targets ?? []) as Record<string, unknown>[]) {
    const storyId = String(raw["story_id"] ?? "");
    const list = targetsByStory.get(storyId) ?? [];
    list.push({
      id: String(raw["id"]),
      channel_id: String(raw["channel_id"]),
      platform: raw["platform"] as SocialPlatform,
      body: String(raw["body"] ?? ""),
      status: String(raw["status"] ?? "draft"),
      delivery: raw["delivery"] === "manual" ? "manual" : "postmypost",
      postmypost_account_id: (raw["postmypost_account_id"] as number | null) ?? null,
      external_url: String(raw["external_url"] ?? ""),
      last_error: String(raw["last_error"] ?? ""),
    });
    targetsByStory.set(storyId, list);
  }

  return stories.map((row) =>
    mapStory(
      row,
      targetsByStory.get(String(row["id"])) ?? [],
      titleById.get(String(row["property_id"] ?? "")) ?? null,
      postTopicById.get(String(row["from_post_id"] ?? "")) ?? null,
      mediaByStory.get(String(row["id"])) ?? [],
    ),
  );
}

async function replaceStoryTargets(
  storyId: string,
  body: string,
  platforms: SocialPlatform[],
  channels: SocialChannel[],
) {
  const { error: delError } = await supabaseAdmin
    .from("social_story_targets")
    .delete()
    .eq("story_id", storyId);
  if (delError) throw new Error(delError.message);
  const rows = platforms
    .map((platform) => channels.find((c) => c.platform === platform))
    .filter((c): c is SocialChannel => Boolean(c))
    .map((channel) => {
      const delivery = deliveryFor(channel.platform);
      return {
        story_id: storyId,
        channel_id: channel.id,
        platform: channel.platform,
        body,
        status: "draft",
        delivery,
        postmypost_account_id: delivery === "postmypost" ? channel.postmypost_account_id : null,
        last_error:
          delivery === "manual" ? STORY_PLATFORM_INFO[channel.platform].hint : "",
      };
    });
  if (!rows.length) throw new Error("Не выбраны каналы");
  const { error } = await supabaseAdmin.from("social_story_targets").insert(rows);
  if (error) throw new Error(error.message);
}

async function replaceStoryMedia(
  storyId: string,
  media: {
    path: string;
    kind: "photo" | "video";
    mime: string;
    bytes: number;
    width?: number | null;
    height?: number | null;
    durationSec?: number | null;
  }[],
) {
  if (media.length > STORY_MEDIA_MAX_ITEMS) {
    throw new Error(`У сторис один файл: фото или видео (не больше ${STORY_MEDIA_MAX_ITEMS})`);
  }
  const { error: delError } = await supabaseAdmin
    .from("social_story_media")
    .delete()
    .eq("story_id", storyId);
  if (delError) throw new Error(delError.message);
  if (!media.length) return;
  const rows = media.map((item, index) => ({
    story_id: storyId,
    kind: item.kind,
    path: item.path,
    mime: item.mime,
    bytes: item.bytes,
    width: item.width || null,
    height: item.height || null,
    duration_sec: item.durationSec || null,
    sort_order: index,
  }));
  const { error } = await supabaseAdmin.from("social_story_media").insert(rows);
  if (error) throw new Error(error.message);
}

export type SaveSocialStoryInput = {
  id?: string;
  topic: string;
  body: string;
  platforms: SocialPlatform[];
  fromPostId?: string | null;
  propertyId?: string | null;
  scheduledAt?: string | null;
  publish?: boolean;
  source?: "manual" | "assistant";
  createdBy?: string;
  media?: {
    path: string;
    kind: "photo" | "video";
    mime: string;
    bytes: number;
    width?: number | null;
    height?: number | null;
    durationSec?: number | null;
  }[];
};

export async function saveSocialStory(input: SaveSocialStoryInput): Promise<SocialStory> {
  const topic = input.topic.trim();
  const body = input.body.trim();
  if (!body && !(input.media?.length)) {
    throw new Error("Добавьте текст или медиа для сторис");
  }
  const platforms = input.platforms.filter(isPlatform);
  if (!platforms.length) throw new Error("Выберите хотя бы одну сеть");
  const channels = await loadSocialChannels();

  let storyId = input.id ?? "";
  let existingPropertyId: string | null | undefined;
  let existingFromPostId: string | null | undefined;
  if (storyId) {
    const { data, error } = await supabaseAdmin
      .from("social_stories")
      .select("id, status, property_id, from_post_id")
      .eq("id", storyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Сторис не найдена");
    if (data.status !== "draft" && data.status !== "failed") {
      throw new Error("Править можно только черновик. Запланированную сторис сначала снимите с очереди.");
    }
    existingPropertyId = (data.property_id as string | null) ?? null;
    existingFromPostId = (data.from_post_id as string | null) ?? null;
  }

  const status: SocialPostStatus = input.publish
    ? input.scheduledAt
      ? "scheduled"
      : "publishing"
    : input.scheduledAt
      ? "scheduled"
      : "draft";

  const row = {
    topic,
    body,
    property_id:
      input.propertyId !== undefined ? input.propertyId || null : (existingPropertyId ?? null),
    from_post_id:
      input.fromPostId !== undefined ? input.fromPostId || null : (existingFromPostId ?? null),
    scheduled_at: input.scheduledAt || null,
    status: input.publish ? status : "draft",
    last_error: "",
  };

  if (storyId) {
    const { error } = await supabaseAdmin.from("social_stories").update(row).eq("id", storyId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabaseAdmin
      .from("social_stories")
      .insert({
        ...row,
        created_by: input.createdBy ?? "",
        source: input.source ?? "manual",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    storyId = data.id;
  }

  await replaceStoryTargets(storyId, body, platforms, channels);
  if (input.media) await replaceStoryMedia(storyId, input.media);
  if (input.publish) {
    try {
      await publishSocialStory(storyId, { immediate: Boolean(input.publish) && !input.scheduledAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить сторис";
      await supabaseAdmin
        .from("social_stories")
        .update({ status: "failed", last_error: message })
        .eq("id", storyId);
      throw error;
    }
  }
  const stories = await loadSocialStories();
  const saved = stories.find((s) => s.id === storyId);
  if (!saved) throw new Error("Сторис сохранена, но не найдена");
  return saved;
}

/** Черновик сторис из существующего поста: короткая подпись + первое медиа. */
export async function buildStoryDraftFromPost(postId: string): Promise<{
  fromPostId: string;
  topic: string;
  body: string;
  propertyId: string | null;
  platforms: SocialPlatform[];
  media: SocialMediaItem[];
}> {
  const posts = await loadSocialPosts(120);
  const post = posts.find((p) => p.id === postId);
  if (!post) throw new Error("Пост не найден");
  const media = (post.media ?? []).slice(0, STORY_MEDIA_MAX_ITEMS).map((item, index) => ({
    ...item,
    sortOrder: index,
  }));
  return {
    fromPostId: post.id,
    topic: post.topic ? `Сторис: ${post.topic}` : "Сторис из поста",
    body: storyCaptionFromPostBody(post.body),
    propertyId: post.property_id,
    platforms: post.targets.map((t) => t.platform).filter(isPlatform),
    media,
  };
}

export async function publishSocialStory(
  storyId: string,
  options?: { immediate?: boolean },
): Promise<string> {
  const { data: story, error } = await supabaseAdmin
    .from("social_stories")
    .select(STORY_COLUMNS)
    .eq("id", storyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!story) throw new Error("Сторис не найдена");

  const { data: targets } = await supabaseAdmin
    .from("social_story_targets")
    .select(TARGET_COLUMNS)
    .eq("story_id", storyId);
  const channels = await loadSocialChannels();
  const enabled = (targets ?? []).filter((t) => {
    const channel = channels.find((c) => c.id === t.channel_id);
    return channel?.enabled;
  });

  const apiTargets = enabled.filter(
    (t) => t.delivery === "postmypost" && t.postmypost_account_id,
  );
  const apiWithoutAccount = enabled.filter(
    (t) => t.delivery === "postmypost" && !t.postmypost_account_id,
  );
  const manualTargets = enabled.filter(
    (t) => t.delivery === "manual" || (t.delivery === "postmypost" && !t.postmypost_account_id),
  );

  for (const t of apiWithoutAccount) {
    await supabaseAdmin
      .from("social_story_targets")
      .update({
        delivery: "manual",
        status: "manual_ready",
        last_error: `${STORY_PLATFORM_INFO[t.platform as SocialPlatform]?.hint ?? "Канал"} — опубликовать вручную (нет аккаунта Postmypost)`,
      })
      .eq("id", t.id);
  }

  if (!apiTargets.length) {
    const note =
      "Заготовка сторис готова. Выбранные каналы публикуются вручную (Макс и/или сети без Postmypost).";
    await supabaseAdmin
      .from("social_stories")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        last_error: note,
      })
      .eq("id", storyId);
    for (const t of manualTargets) {
      await supabaseAdmin
        .from("social_story_targets")
        .update({
          status: "manual_ready",
          last_error: STORY_PLATFORM_INFO[t.platform as SocialPlatform]?.hint ?? "Опубликовать вручную",
        })
        .eq("id", t.id);
    }
    return note;
  }

  const token = await getPostmypostToken();
  const { data: settings } = await supabaseAdmin
    .from("social_settings")
    .select("postmypost_project_id")
    .eq("id", true)
    .maybeSingle();
  const projectId = Number(settings?.postmypost_project_id);
  if (!token || !Number.isFinite(projectId) || projectId <= 0) {
    throw new Error("Сначала подключите Postmypost в настройках раздела");
  }

  const { data: mediaRows, error: mediaError } = await supabaseAdmin
    .from("social_story_media")
    .select(MEDIA_COLUMNS)
    .eq("story_id", storyId)
    .order("sort_order", { ascending: true });
  if (mediaError) throw new Error(mediaError.message);

  if (!(mediaRows ?? []).length) {
    throw new Error("Для публикации сторис через Postmypost нужно фото или видео");
  }

  const fileIds: number[] = [];
  for (const row of mediaRows ?? []) {
    const existing = Number(row["postmypost_file_id"]);
    if (Number.isFinite(existing) && existing > 0) {
      fileIds.push(existing);
      continue;
    }
    const file = await downloadSocialMedia(String(row["path"]));
    const fileId = await uploadFileDirect(token, projectId, {
      name: file.name,
      bytes: file.bytes,
      mime: file.mime,
    });
    fileIds.push(fileId);
    await supabaseAdmin
      .from("social_story_media")
      .update({ postmypost_file_id: fileId })
      .eq("id", row["id"]);
  }

  const postAt = options?.immediate
    ? moscowIso(new Date(Date.now() + 60_000))
    : story.scheduled_at
      ? new Date(story.scheduled_at).toISOString()
      : moscowIso(new Date(Date.now() + 60_000));

  let publicationId: number;
  try {
    publicationId = await createPostmypostPublication(token, {
      projectId,
      postAt,
      status: "pending_publication",
      publicationType: "story",
      details: apiTargets.map((t) => ({
        accountId: Number(t.postmypost_account_id),
        content: String(t.body || story.body || "").trim(),
        ...(fileIds.length ? { fileIds } : {}),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Postmypost отклонил сторис";
    // Если площадка не умеет stories через API — честный UX: заготовка вручную
    const looksUnsupported =
      /stor(y|ies)|reels|shorts|does not support|не поддержив|publication_type|20000/i.test(
        message,
      );
    if (looksUnsupported) {
      await supabaseAdmin
        .from("social_stories")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          last_error: `Postmypost не принял сторис («${message}»). Заготовка сохранена — опубликуйте вручную в приложении сети.`,
        })
        .eq("id", storyId);
      for (const t of apiTargets) {
        await supabaseAdmin
          .from("social_story_targets")
          .update({
            delivery: "manual",
            status: "manual_ready",
            last_error: message,
          })
          .eq("id", t.id);
      }
      for (const t of manualTargets) {
        await supabaseAdmin
          .from("social_story_targets")
          .update({
            status: "manual_ready",
            last_error: STORY_PLATFORM_INFO[t.platform as SocialPlatform]?.hint ?? "Вручную",
          })
          .eq("id", t.id);
      }
      return `API сторис недоступен для выбранных аккаунтов (${message}). Заготовка сохранена — опубликуйте вручную.`;
    }
    throw err;
  }

  const manualNote = manualTargets.length
    ? " Часть каналов (Макс / без аккаунта) — опубликовать вручную."
    : "";

  await supabaseAdmin
    .from("social_stories")
    .update({
      status: options?.immediate ? "publishing" : "scheduled",
      scheduled_at: story.scheduled_at ?? new Date(postAt).toISOString(),
      postmypost_publication_id: publicationId,
      last_error: manualNote.trim(),
    })
    .eq("id", storyId);

  for (const target of apiTargets) {
    await supabaseAdmin
      .from("social_story_targets")
      .update({ status: options?.immediate ? "publishing" : "scheduled", last_error: "" })
      .eq("id", target.id);
  }
  for (const target of manualTargets) {
    await supabaseAdmin
      .from("social_story_targets")
      .update({
        status: "manual_ready",
        last_error: STORY_PLATFORM_INFO[target.platform as SocialPlatform]?.hint ?? "Опубликовать вручную",
      })
      .eq("id", target.id);
  }

  return options?.immediate
    ? `Сторис отправлена в Postmypost.${manualNote}`
    : `Сторис поставлена в очередь Postmypost.${manualNote}`;
}

export async function cancelSocialStory(storyId: string): Promise<string> {
  const { data: story } = await supabaseAdmin
    .from("social_stories")
    .select("id, postmypost_publication_id, status")
    .eq("id", storyId)
    .maybeSingle();
  if (!story) throw new Error("Сторис не найдена");
  if (story.postmypost_publication_id) {
    try {
      const token = await getPostmypostToken();
      await deletePostmypostPublication(token, Number(story.postmypost_publication_id));
    } catch (error) {
      console.error("delete story publication failed", error);
    }
  }
  await supabaseAdmin
    .from("social_stories")
    .update({ status: "cancelled", last_error: "" })
    .eq("id", storyId);
  await supabaseAdmin
    .from("social_story_targets")
    .update({ status: "cancelled" })
    .eq("story_id", storyId);
  return "Сторис отменена";
}

export async function deleteSocialStory(storyId: string): Promise<void> {
  const { data: story } = await supabaseAdmin
    .from("social_stories")
    .select("postmypost_publication_id, status")
    .eq("id", storyId)
    .maybeSingle();
  if (story?.postmypost_publication_id && story.status !== "published") {
    try {
      const token = await getPostmypostToken();
      await deletePostmypostPublication(token, Number(story.postmypost_publication_id));
    } catch {
      /* already gone */
    }
  }
  const { error } = await supabaseAdmin.from("social_stories").delete().eq("id", storyId);
  if (error) throw new Error(error.message);
}

export function storyPlatformHints(): { platform: SocialPlatform; delivery: StoryDelivery; hint: string }[] {
  return SOCIAL_PLATFORMS.map((platform) => ({
    platform,
    delivery: STORY_PLATFORM_INFO[platform].delivery,
    hint: STORY_PLATFORM_INFO[platform].hint,
  }));
}
