import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { adaptPostForPlatform, bodiesForPlatforms } from "@/lib/social-adapt";
import { getPlatformSecret, setPlatformSecret } from "@/lib/platform-secrets.server";
import {
  createPostmypostPublication,
  deletePostmypostPublication,
  getPostmypostToken,
  getPublicationAnalytics,
  listPostmypostAccounts,
  listPostmypostProjects,
  uploadFileDirect,
  type PostmypostAccount,
} from "@/lib/postmypost.server";
import {
  SOCIAL_PLATFORMS,
  type SocialBoard,
  type SocialBrand,
  type SocialChannel,
  type SocialPlatform,
  type SocialPost,
  type SocialPostStatus,
  type SocialPostTarget,
  type SocialSkill,
} from "@/lib/social";
import {
  SOCIAL_MEDIA_MAX_ITEMS,
  socialMediaDisplayUrl,
  type SocialMediaItem,
} from "@/lib/social-media";
import { downloadSocialMedia, signedSocialMediaUrls } from "@/lib/social-media.server";
import { propertyMediaFromRow, type PropertyPhoto } from "@/lib/properties";
import { propertyUrl } from "@/lib/seo";

const CHANNEL_COLUMNS =
  "id, platform, name, enabled, postmypost_account_id, postmypost_channel, external_url, last_synced_at, last_error";
const POST_COLUMNS =
  "id, status, topic, body, property_id, pulse_item_id, article_id, content_mix, manual_hit, hit_note, scheduled_at, published_at, created_by, source, postmypost_publication_id, last_error, created_at";
const POST_COLUMNS_LEGACY =
  "id, status, topic, body, property_id, pulse_item_id, article_id, scheduled_at, published_at, created_by, source, postmypost_publication_id, last_error, created_at";
const TARGET_COLUMNS =
  "id, post_id, channel_id, platform, body, status, postmypost_account_id, external_url, last_error";
const MEDIA_COLUMNS =
  "id, post_id, kind, path, mime, bytes, width, height, duration_sec, sort_order, postmypost_file_id";

export type SocialPropertyMediaKind = "photos" | "video" | "auto" | "none";

export type SocialPropertyOption = {
  id: string;
  refId: number;
  label: string;
  status: string;
  complexName: string;
  address: string;
  photoCount: number;
  hasVideo: boolean;
};

export type PropertySocialDraft = {
  propertyId: string;
  refId: number;
  label: string;
  topic: string;
  body: string;
  objectUrl: string;
  description: string;
  complexName: string;
  address: string;
  locationDescription: string;
  mediaKind: "photos" | "video" | "none";
  media: SocialMediaItem[];
  photoCount: number;
  hasVideo: boolean;
};

function mimeFromPath(path: string, kind: "photo" | "video") {
  if (kind === "video") return "video/mp4";
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/jpeg";
}

function propertyLabelFromRow(row: {
  ref_id: number;
  title: string;
  internal_name?: string | null;
}) {
  return String(row.internal_name || row.title || `№${row.ref_id}`);
}

function draftBodyFromProperty(row: Record<string, unknown>) {
  const title = propertyLabelFromRow({
    ref_id: Number(row["ref_id"] ?? 0),
    title: String(row["title"] ?? ""),
    internal_name: (row["internal_name"] as string | null) ?? null,
  });
  const complex = String(row["complex_name"] ?? "").trim();
  const address = String(row["address"] ?? "").trim();
  const location = String(row["location_description"] ?? "").trim();
  const description = String(row["description"] ?? "").trim();
  const rooms = row["rooms"] != null ? Number(row["rooms"]) : null;
  const area = row["area"] != null ? Number(row["area"]) : null;
  const price = row["price_month"] != null ? Number(row["price_month"]) : null;

  const facts: string[] = [];
  if (rooms && Number.isFinite(rooms)) facts.push(`${rooms} комн.`);
  if (area && Number.isFinite(area)) facts.push(`${area} м²`);
  if (price && Number.isFinite(price)) {
    facts.push(`${price.toLocaleString("ru-RU")} ₽/мес`);
  }

  const lines = [
    title,
    facts.length ? facts.join(" · ") : "",
    complex ? `ЖК ${complex}` : "",
    address ? `Расположение: ${address}` : "",
    location || "",
    description || "",
  ].filter(Boolean);

  return lines.join("\n\n");
}

function mediaItemsFromProperty(
  row: Record<string, unknown>,
  kind: SocialPropertyMediaKind,
): { mediaKind: "photos" | "video" | "none"; media: SocialMediaItem[] } {
  const media = propertyMediaFromRow(row);
  const photos = (media.photos as PropertyPhoto[]).filter((p) => p.path);
  const videoPath = String(media.video_file_path ?? "").trim();

  const wantVideo =
    kind === "video" || (kind === "auto" && !photos.length && Boolean(videoPath));
  if (wantVideo) {
    if (!videoPath) return { mediaKind: "none", media: [] };
    return {
      mediaKind: "video",
      media: [
        {
          id: videoPath,
          kind: "video",
          path: videoPath,
          mime: mimeFromPath(videoPath, "video"),
          bytes: 0,
          width: null,
          height: null,
          durationSec: null,
          url: socialMediaDisplayUrl(videoPath),
          sortOrder: 0,
        },
      ],
    };
  }

  if (kind === "none") return { mediaKind: "none", media: [] };

  const picked = photos.slice(0, SOCIAL_MEDIA_MAX_ITEMS).map((photo, index) => ({
    id: photo.path,
    kind: "photo" as const,
    path: photo.path,
    mime: mimeFromPath(photo.path, "photo"),
    bytes: 0,
    width: null,
    height: null,
    durationSec: null,
    url: socialMediaDisplayUrl(photo.path),
    sortOrder: index,
  }));
  return {
    mediaKind: picked.length ? "photos" : "none",
    media: picked,
  };
}

/** Краткие опции объектов для выбора в разделе «Соцсети». */
export async function listSocialPropertyOptions(): Promise<SocialPropertyOption[]> {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select(
      "id, ref_id, title, internal_name, status, complex_name, address, photos, video_file_path, video_url, video_vk_url, video_youtube_url",
    )
    .neq("status", "archived")
    .order("ref_id", { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map((row) => {
    const media = propertyMediaFromRow(row);
    return {
      id: String(row["id"]),
      refId: Number(row["ref_id"]),
      label: propertyLabelFromRow({
        ref_id: Number(row["ref_id"]),
        title: String(row["title"] ?? ""),
        internal_name: (row["internal_name"] as string | null) ?? null,
      }),
      status: String(row["status"] ?? ""),
      complexName: String(row["complex_name"] ?? ""),
      address: String(row["address"] ?? ""),
      photoCount: media.photos.length,
      hasVideo: Boolean(media.video_file_path),
    };
  });
}

/** Черновик поста по карточке объекта: текст + фото или видео. */
export async function buildPropertySocialDraft(
  propertyId: string,
  mediaKind: SocialPropertyMediaKind = "auto",
): Promise<PropertySocialDraft> {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select(
      "id, ref_id, title, internal_name, status, complex_name, address, location_description, description, rooms, area, price_month, photos, video_file_path, video_url, video_vk_url, video_youtube_url",
    )
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Объект не найден");

  const row = data as unknown as Record<string, unknown>;
  const mediaInfo = propertyMediaFromRow(row);
  const picked = mediaItemsFromProperty(row, mediaKind);
  const label = propertyLabelFromRow({
    ref_id: Number(row["ref_id"]),
    title: String(row["title"] ?? ""),
    internal_name: (row["internal_name"] as string | null) ?? null,
  });
  const complexName = String(row["complex_name"] ?? "").trim();
  const address = String(row["address"] ?? "").trim();
  const locationDescription = String(row["location_description"] ?? "").trim();
  const description = String(row["description"] ?? "").trim();

  return {
    propertyId: String(row["id"]),
    refId: Number(row["ref_id"]),
    label,
    topic: complexName ? `${label} · ${complexName}` : label,
    body: draftBodyFromProperty(row),
    objectUrl: propertyUrl({ title: String(row["title"] ?? ""), ref_id: Number(row["ref_id"]) }),
    description,
    complexName,
    address,
    locationDescription,
    mediaKind: picked.mediaKind,
    media: picked.media,
    photoCount: mediaInfo.photos.length,
    hasVideo: Boolean(mediaInfo.video_file_path),
  };
}

/** Медиа объекта для Ассистента (пути в том же бакете, что и посты). */
export async function loadPropertySocialMedia(propertyRefOrId: string) {
  const byId = await supabaseAdmin
    .from("properties")
    .select(
      "id, ref_id, title, internal_name, photos, video_file_path, video_url, video_vk_url, video_youtube_url",
    )
    .eq("id", propertyRefOrId)
    .maybeSingle();
  let row = byId.data as unknown as Record<string, unknown> | null;
  if (!row) {
    const ref = Number(propertyRefOrId);
    if (Number.isFinite(ref) && ref > 0) {
      const byRef = await supabaseAdmin
        .from("properties")
        .select(
          "id, ref_id, title, internal_name, photos, video_file_path, video_url, video_vk_url, video_youtube_url",
        )
        .eq("ref_id", ref)
        .maybeSingle();
      row = (byRef.data as unknown as Record<string, unknown> | null) ?? null;
    }
  }
  if (!row) return null;
  const media = propertyMediaFromRow(row);
  return {
    propertyId: String(row["id"]),
    label: propertyLabelFromRow({
      ref_id: Number(row["ref_id"]),
      title: String(row["title"] ?? ""),
      internal_name: (row["internal_name"] as string | null) ?? null,
    }),
    photos: media.photos.map((p) => ({
      path: p.path,
      url: socialMediaDisplayUrl(p.path),
      kind: "photo" as const,
    })),
    video: media.video_file_path
      ? {
          path: media.video_file_path,
          url: socialMediaDisplayUrl(media.video_file_path),
          kind: "video" as const,
        }
      : null,
    externalVideo: {
      youtube: media.video_youtube_url || null,
      vk: media.video_vk_url || null,
      other: /^https?:\/\//i.test(media.video_url) ? media.video_url : null,
    },
  };
}

function isPlatform(value: string): value is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

function matchPlatform(channel: string): SocialPlatform | null {
  const value = channel.toLowerCase();
  if (value.includes("instagram")) return "instagram";
  if (value.includes("telegram")) return "telegram";
  if (value.includes("vk")) return "vk";
  if (value.includes("max")) return "max";
  return null;
}

export async function loadSocialBrand(): Promise<SocialBrand> {
  const { data } = await supabaseAdmin
    .from("social_brand")
    .select("voice, audience, hashtags, forbidden, cta, examples")
    .eq("id", true)
    .maybeSingle();
  return {
    voice: String(data?.voice ?? ""),
    audience: String(data?.audience ?? ""),
    hashtags: String(data?.hashtags ?? ""),
    forbidden: String(data?.forbidden ?? ""),
    cta: String(data?.cta ?? ""),
    examples: String(data?.examples ?? ""),
  };
}

export async function saveSocialBrand(brand: SocialBrand): Promise<void> {
  const { error } = await supabaseAdmin.from("social_brand").upsert(
    {
      id: true,
      voice: brand.voice.trim(),
      audience: brand.audience.trim(),
      hashtags: brand.hashtags.trim(),
      forbidden: brand.forbidden.trim(),
      cta: brand.cta.trim(),
      examples: brand.examples.trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
}

export async function loadSocialSkills(): Promise<SocialSkill[]> {
  const { data } = await supabaseAdmin
    .from("social_skills")
    .select("id, text, created_at")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(100);
  return (data ?? []) as SocialSkill[];
}

export async function addSocialSkill(text: string, author = ""): Promise<void> {
  const { error } = await supabaseAdmin
    .from("social_skills")
    .insert({ text: text.trim(), created_by: author });
  if (error) throw new Error(error.message);
}

export async function removeSocialSkill(query: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("social_skills")
    .select("id, text")
    .eq("active", true)
    .ilike("text", `%${query}%`)
    .limit(1);
  const row = (data ?? [])[0] as { id: string; text: string } | undefined;
  if (!row) return null;
  await supabaseAdmin.from("social_skills").update({ active: false }).eq("id", row.id);
  return row.text;
}

export async function loadSocialChannels(): Promise<SocialChannel[]> {
  const { data, error } = await supabaseAdmin
    .from("social_channels")
    .select(CHANNEL_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SocialChannel[];
}

async function loadProjectId(): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from("social_settings")
    .select("postmypost_project_id, timezone")
    .eq("id", true)
    .maybeSingle();
  const id = Number(data?.postmypost_project_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function saveSocialConnection(input: {
  token?: string;
  projectId?: number | null;
}): Promise<void> {
  if (input.token != null && input.token.trim()) {
    await setPlatformSecret("POSTMYPOST_API_TOKEN", input.token.trim());
  }
  if (input.projectId !== undefined) {
    const { error } = await supabaseAdmin.from("social_settings").upsert(
      {
        id: true,
        postmypost_project_id: input.projectId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
  }
}

function mapContentMix(value: unknown): SocialPost["content_mix"] {
  const v = String(value ?? "");
  if (v === "life_sochi" || v === "relocation" || v === "property" || v === "company" || v === "other") {
    return v;
  }
  return null;
}

function mapPost(
  row: Record<string, unknown>,
  targets: SocialPostTarget[],
  propertyTitle: string | null,
  media: SocialMediaItem[],
): SocialPost {
  return {
    id: String(row["id"]),
    status: row["status"] as SocialPostStatus,
    topic: String(row["topic"] ?? ""),
    body: String(row["body"] ?? ""),
    property_id: (row["property_id"] as string | null) ?? null,
    property_title: propertyTitle,
    pulse_item_id: (row["pulse_item_id"] as string | null) ?? null,
    article_id: (row["article_id"] as string | null) ?? null,
    content_mix: mapContentMix(row["content_mix"]),
    manual_hit: Boolean(row["manual_hit"]),
    hit_note: String(row["hit_note"] ?? ""),
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

export async function loadSocialPosts(limit = 80): Promise<SocialPost[]> {
  let { data, error } = await supabaseAdmin
    .from("social_posts")
    .select(POST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error && /pulse_item_id|article_id|content_mix|manual_hit|hit_note/i.test(error.message)) {
    let cols = POST_COLUMNS;
    if (/content_mix|manual_hit|hit_note/i.test(error.message)) cols = POST_COLUMNS_LEGACY;
    if (/article_id/i.test(error.message)) cols = cols.replace(", article_id", "");
    if (/pulse_item_id/i.test(error.message)) cols = cols.replace(", pulse_item_id", "");
    const fallback = await supabaseAdmin
      .from("social_posts")
      .select(cols)
      .order("created_at", { ascending: false })
      .limit(limit);
    data = fallback.data as typeof data;
    error = fallback.error;
  }
  if (error) throw new Error(error.message);
  const posts = (data ?? []) as Record<string, unknown>[];
  if (!posts.length) return [];

  const ids = posts.map((p) => String(p["id"]));
  const propertyIds = posts.map((p) => p["property_id"]).filter(Boolean) as string[];

  const [{ data: targets }, { data: properties }, mediaRes] = await Promise.all([
    supabaseAdmin.from("social_post_targets").select(TARGET_COLUMNS).in("post_id", ids),
    propertyIds.length
      ? supabaseAdmin.from("properties").select("id, title, internal_name, ref_id").in("id", propertyIds)
      : Promise.resolve({ data: [] as { id: string; title: string; internal_name: string | null; ref_id: number }[] }),
    supabaseAdmin.from("social_post_media").select(MEDIA_COLUMNS).in("post_id", ids).order("sort_order", { ascending: true }),
  ]);

  const mediaRows = mediaRes.error ? [] : (mediaRes.data ?? []);
  const urls = await signedSocialMediaUrls(mediaRows.map((row) => String(row["path"] ?? "")));
  const mediaByPost = new Map<string, SocialMediaItem[]>();
  for (const row of mediaRows) {
    const postId = String(row["post_id"] ?? "");
    const path = String(row["path"] ?? "");
    const list = mediaByPost.get(postId) ?? [];
    list.push({
      id: String(row["id"]),
      kind: row["kind"] === "video" ? "video" : "photo",
      path,
      mime: String(row["mime"] ?? ""),
      bytes: Number(row["bytes"] ?? 0),
      width: (row["width"] as number | null) ?? null,
      height: (row["height"] as number | null) ?? null,
      durationSec: row["duration_sec"] == null ? null : Number(row["duration_sec"]),
      url: urls[path] ?? "",
      sortOrder: Number(row["sort_order"] ?? 0),
    });
    mediaByPost.set(postId, list);
  }

  const titleById = new Map(
    (properties ?? []).map((p) => [
      p.id,
      String(p.internal_name || p.title || `№${p.ref_id}`),
    ]),
  );
  const targetsByPost = new Map<string, SocialPostTarget[]>();
  for (const target of (targets ?? []) as SocialPostTarget[]) {
    const list = targetsByPost.get((target as { post_id?: string }).post_id as string) ?? [];
    list.push(target);
    targetsByPost.set((target as { post_id?: string }).post_id as string, list);
  }

  return posts.map((row) =>
    mapPost(
      row,
      (targetsByPost.get(String(row["id"])) ?? []).map((t) => ({
        id: t.id,
        channel_id: t.channel_id,
        platform: t.platform,
        body: t.body,
        status: t.status,
        postmypost_account_id: t.postmypost_account_id,
        external_url: t.external_url,
        last_error: t.last_error,
      })),
      titleById.get(String(row["property_id"] ?? "")) ?? null,
      mediaByPost.get(String(row["id"])) ?? [],
    ),
  );
}

export async function loadSocialBoard(): Promise<SocialBoard> {
  const token = (await getPlatformSecret("POSTMYPOST_API_TOKEN").catch(() => "")).trim();
  const { loadSocialStories } = await import("@/lib/social-stories.server");
  const { loadSiteArticles } = await import("@/lib/site-articles.server");
  const [{ data: settings }, channels, posts, stories, articles, brand, skills] = await Promise.all([
    supabaseAdmin.from("social_settings").select("postmypost_project_id, timezone").eq("id", true).maybeSingle(),
    loadSocialChannels(),
    loadSocialPosts(),
    loadSocialStories(),
    loadSiteArticles(),
    loadSocialBrand(),
    loadSocialSkills(),
  ]);
  const projectId = Number(settings?.postmypost_project_id);
  const connected = Boolean(token) && Number.isFinite(projectId) && projectId > 0;
  let postmypostAccounts: PostmypostAccount[] = [];
  if (connected) {
    try {
      postmypostAccounts = await listPostmypostAccounts(token, projectId);
    } catch {
      postmypostAccounts = [];
    }
  }

  const { data: statsRows } = await supabaseAdmin
    .from("social_post_stats")
    .select("platform, views, likes, comments, shares, reach")
    .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));

  const statsMap = new Map<SocialPlatform, SocialBoard["stats"][number]>();
  for (const platform of SOCIAL_PLATFORMS) {
    statsMap.set(platform, { platform, views: 0, likes: 0, comments: 0, shares: 0, reach: 0 });
  }
  for (const row of statsRows ?? []) {
    if (!isPlatform(row.platform)) continue;
    const current = statsMap.get(row.platform)!;
    current.views += row.views;
    current.likes += row.likes;
    current.comments += row.comments;
    current.shares += row.shares;
    current.reach += row.reach;
  }

  return {
    connected,
    projectId: Number.isFinite(projectId) && projectId > 0 ? projectId : null,
    timezone: String(settings?.timezone ?? "Europe/Moscow"),
    channels,
    posts,
    stories,
    articles,
    brand,
    skills,
    stats: SOCIAL_PLATFORMS.map((platform) => statsMap.get(platform)!),
    postmypostAccounts,
  };
}

export async function listConnectionProjects(tokenOverride?: string) {
  const token = (tokenOverride ?? (await getPostmypostToken())).trim();
  if (!token) throw new Error("Сначала сохраните API-токен Postmypost");
  return listPostmypostProjects(token);
}

export async function syncSocialChannels(): Promise<{ matched: number }> {
  const token = await getPostmypostToken();
  if (!token) throw new Error("Нет API-токена Postmypost");
  const projectId = await loadProjectId();
  if (!projectId) throw new Error("Не выбран проект Postmypost");
  const accounts = await listPostmypostAccounts(token, projectId);
  const channels = await loadSocialChannels();
  let matched = 0;

  for (const channel of channels) {
    const existing = accounts.find((a) => a.id === channel.postmypost_account_id);
    const auto = accounts.find((a) => matchPlatform(a.channel) === channel.platform);
    const account = existing ?? auto;
    const { error } = await supabaseAdmin
      .from("social_channels")
      .update({
        postmypost_account_id: account?.id ?? channel.postmypost_account_id,
        postmypost_channel: account?.channel ?? channel.postmypost_channel,
        name: account?.name || channel.name,
        last_synced_at: new Date().toISOString(),
        last_error: account ? "" : channel.platform === "max" ? "" : "Аккаунт Postmypost не найден",
      })
      .eq("id", channel.id);
    if (error) throw new Error(error.message);
    if (account) matched += 1;
  }
  return { matched };
}

export async function mapSocialChannel(input: {
  platform: SocialPlatform;
  accountId: number | null;
  enabled?: boolean;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    postmypost_account_id: input.accountId,
    last_error: "",
  };
  if (input.enabled != null) patch["enabled"] = input.enabled;
  const { error } = await supabaseAdmin
    .from("social_channels")
    .update(patch)
    .eq("platform", input.platform);
  if (error) throw new Error(error.message);
}

export type SaveSocialPostInput = {
  id?: string;
  topic: string;
  body: string;
  platforms: SocialPlatform[];
  propertyId?: string | null;
  objectUrl?: string;
  pulseItemId?: string | null;
  articleId?: string | null;
  scheduledAt?: string | null;
  publish?: boolean;
  source?: "manual" | "assistant";
  createdBy?: string;
  variants?: Partial<Record<SocialPlatform, string>>;
  media?: { path: string; kind: "photo" | "video"; mime: string; bytes: number; width?: number | null; height?: number | null; durationSec?: number | null }[];
};

async function replaceTargets(
  postId: string,
  body: string,
  platforms: SocialPlatform[],
  channels: SocialChannel[],
  variants?: Partial<Record<SocialPlatform, string>>,
  objectUrl?: string,
) {
  const { error: delError } = await supabaseAdmin.from("social_post_targets").delete().eq("post_id", postId);
  if (delError) throw new Error(delError.message);
  const bodies = bodiesForPlatforms(body, platforms, variants, objectUrl);
  const rows = platforms
    .map((platform) => channels.find((c) => c.platform === platform))
    .filter((c): c is SocialChannel => Boolean(c))
    .map((channel) => ({
      post_id: postId,
      channel_id: channel.id,
      platform: channel.platform,
      body: bodies[channel.platform],
      status: "draft",
      postmypost_account_id: channel.postmypost_account_id,
    }));
  if (!rows.length) throw new Error("Не выбраны каналы");
  const { error } = await supabaseAdmin.from("social_post_targets").insert(rows);
  if (error) throw new Error(error.message);
}

async function replaceMedia(postId: string, media: NonNullable<SaveSocialPostInput["media"]>) {
  if (media.length > SOCIAL_MEDIA_MAX_ITEMS) {
    throw new Error(`Можно прикрепить не больше ${SOCIAL_MEDIA_MAX_ITEMS} файлов`);
  }
  const { error: delError } = await supabaseAdmin.from("social_post_media").delete().eq("post_id", postId);
  if (delError) {
    if (/does not exist|schema cache/i.test(delError.message)) {
      if (media.length) throw new Error("Таблица медиа ещё не создана. Обновите систему и попробуйте снова.");
      return;
    }
    throw new Error(delError.message);
  }
  if (!media.length) return;
  const rows = media.map((item, index) => ({
    post_id: postId,
    kind: item.kind,
    path: item.path,
    mime: item.mime,
    bytes: item.bytes,
    width: item.width || null,
    height: item.height || null,
    duration_sec: item.durationSec || null,
    sort_order: index,
  }));
  const { error } = await supabaseAdmin.from("social_post_media").insert(rows);
  if (error) throw new Error(error.message);
}

export async function saveSocialPost(input: SaveSocialPostInput): Promise<SocialPost> {
  const topic = input.topic.trim();
  const body = input.body.trim();
  if (!body) throw new Error("Введите текст поста");
  const platforms = input.platforms.filter(isPlatform);
  if (!platforms.length) throw new Error("Выберите хотя бы одну сеть");
  const channels = await loadSocialChannels();
  const status: SocialPostStatus = input.publish
    ? input.scheduledAt
      ? "scheduled"
      : "publishing"
    : input.scheduledAt
      ? "scheduled"
      : "draft";

  let postId = input.id ?? "";
  let existingPropertyId: string | null | undefined;
  if (postId) {
    const { data, error } = await supabaseAdmin
      .from("social_posts")
      .select("id, status, property_id")
      .eq("id", postId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Пост не найден");
    if (data.status !== "draft" && data.status !== "failed") {
      throw new Error("Править можно только черновик. Запланированный пост сначала снимите с очереди.");
    }
    existingPropertyId = (data.property_id as string | null) ?? null;
  }

  const row = {
    topic,
    body,
    property_id: input.propertyId !== undefined ? input.propertyId || null : (existingPropertyId ?? null),
    scheduled_at: input.scheduledAt || null,
    status: input.publish ? status : "draft",
    last_error: "",
    ...(input.pulseItemId !== undefined ? { pulse_item_id: input.pulseItemId || null } : {}),
    ...(input.articleId !== undefined ? { article_id: input.articleId || null } : {}),
  };

  if (postId) {
    const { error } = await supabaseAdmin.from("social_posts").update(row).eq("id", postId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabaseAdmin
      .from("social_posts")
      .insert({
        ...row,
        created_by: input.createdBy ?? "",
        source: input.source ?? "manual",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    postId = data.id;
  }

  await replaceTargets(postId, body, platforms, channels, input.variants, input.objectUrl);
  if (input.media) await replaceMedia(postId, input.media);
  if (input.publish) {
    try {
      await publishSocialPost(postId, { immediate: Boolean(input.publish) && !input.scheduledAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить в Postmypost";
      await supabaseAdmin
        .from("social_posts")
        .update({ status: "failed", last_error: message })
        .eq("id", postId);
      throw error;
    }
  }
  const posts = await loadSocialPosts();
  const saved = posts.find((p) => p.id === postId);
  if (!saved) throw new Error("Пост сохранён, но не найден");
  return saved;
}

function moscowIso(date = new Date()) {
  const shifted = new Date(date.getTime() + 3 * 3600_000);
  return shifted.toISOString().replace("Z", "+03:00");
}

export async function publishSocialPost(
  postId: string,
  options?: { immediate?: boolean },
): Promise<string> {
  const { data: post, error } = await supabaseAdmin
    .from("social_posts")
    .select(POST_COLUMNS)
    .eq("id", postId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!post) throw new Error("Пост не найден");

  const { data: targets } = await supabaseAdmin
    .from("social_post_targets")
    .select(TARGET_COLUMNS)
    .eq("post_id", postId);
  const channels = await loadSocialChannels();
  const enabled = (targets ?? []).filter((t) => {
    const channel = channels.find((c) => c.id === t.channel_id);
    return channel?.enabled;
  });

  const withAccounts = enabled.filter((t) => t.postmypost_account_id);
  const maxOnly = enabled.filter((t) => t.platform === "max" && !t.postmypost_account_id);

  if (!withAccounts.length && maxOnly.length) {
    await supabaseAdmin
      .from("social_posts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        last_error: "Текст для Макс готов — скопируйте его в мессенджер. Postmypost Макс пока не публикует.",
      })
      .eq("id", postId);
    return "Текст для Макс сохранён. Скопируйте его в группу — Postmypost эту сеть пока не публикует.";
  }
  if (!withAccounts.length) throw new Error("Нет подключённых аккаунтов Postmypost для выбранных сетей");

  const token = await getPostmypostToken();
  const projectId = await loadProjectId();
  if (!token || !projectId) throw new Error("Сначала подключите Postmypost в настройках раздела");

  const { data: mediaRows, error: mediaError } = await supabaseAdmin
    .from("social_post_media")
    .select(MEDIA_COLUMNS)
    .eq("post_id", postId)
    .order("sort_order", { ascending: true });
  if (mediaError && !/does not exist|schema cache/i.test(mediaError.message)) {
    throw new Error(mediaError.message);
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
    await supabaseAdmin.from("social_post_media").update({ postmypost_file_id: fileId }).eq("id", row["id"]);
  }

  const postAt = options?.immediate
    ? moscowIso(new Date(Date.now() + 60_000))
    : post.scheduled_at
      ? new Date(post.scheduled_at).toISOString()
      : moscowIso(new Date(Date.now() + 60_000));

  const publicationId = await createPostmypostPublication(token, {
    projectId,
    postAt,
    status: "pending_publication",
    details: withAccounts.map((t) => ({
      accountId: Number(t.postmypost_account_id),
      content: adaptPostForPlatform(t.body || post.body, t.platform).trim(),
      fileIds: fileIds.length ? fileIds : undefined,
    })),
  });

  await supabaseAdmin
    .from("social_posts")
    .update({
      status: options?.immediate ? "publishing" : "scheduled",
      scheduled_at: post.scheduled_at ?? new Date(postAt).toISOString(),
      postmypost_publication_id: publicationId,
      last_error: maxOnly.length
        ? "Макс: скопируйте текст вручную — прямой публикации через Postmypost нет."
        : "",
    })
    .eq("id", postId);

  for (const target of withAccounts) {
    await supabaseAdmin
      .from("social_post_targets")
      .update({ status: options?.immediate ? "publishing" : "scheduled", last_error: "" })
      .eq("id", target.id);
  }
  for (const target of maxOnly) {
    await supabaseAdmin
      .from("social_post_targets")
      .update({
        status: "draft",
        last_error: "Скопируйте текст в группу Макс вручную",
      })
      .eq("id", target.id);
  }
  return options?.immediate
    ? "Пост отправлен в Postmypost на публикацию"
    : "Пост поставлен в очередь Postmypost";
}

export async function cancelSocialPost(postId: string): Promise<string> {
  const { data: post } = await supabaseAdmin
    .from("social_posts")
    .select("id, postmypost_publication_id, status")
    .eq("id", postId)
    .maybeSingle();
  if (!post) throw new Error("Пост не найден");
  if (post.postmypost_publication_id) {
    try {
      const token = await getPostmypostToken();
      await deletePostmypostPublication(token, Number(post.postmypost_publication_id));
    } catch (error) {
      console.error("delete publication failed", error);
    }
  }
  await supabaseAdmin
    .from("social_posts")
    .update({ status: "cancelled", last_error: "" })
    .eq("id", postId);
  await supabaseAdmin.from("social_post_targets").update({ status: "cancelled" }).eq("post_id", postId);
  return "Публикация отменена";
}

export async function deleteSocialPost(postId: string): Promise<void> {
  const { data: post } = await supabaseAdmin
    .from("social_posts")
    .select("postmypost_publication_id, status")
    .eq("id", postId)
    .maybeSingle();
  if (post?.postmypost_publication_id && post.status !== "published") {
    try {
      const token = await getPostmypostToken();
      await deletePostmypostPublication(token, Number(post.postmypost_publication_id));
    } catch {
      /* already gone */
    }
  }
  const { error } = await supabaseAdmin.from("social_posts").delete().eq("id", postId);
  if (error) throw new Error(error.message);
}

export async function syncSocialStats(): Promise<{ posts: number; stats: number }> {
  const token = (await getPlatformSecret("POSTMYPOST_API_TOKEN").catch(() => "")).trim();
  const projectId = await loadProjectId();
  if (!token || !projectId) return { posts: 0, stats: 0 };

  const channels = (await loadSocialChannels()).filter((c) => c.postmypost_account_id);
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);
  let stats = 0;
  for (const channel of channels) {
    try {
      const rows = await getPublicationAnalytics(token, {
        projectId,
        accountId: Number(channel.postmypost_account_id),
        from,
        to,
      });
      for (const row of rows) {
        const publicationId = Number(row["publication_id"] ?? row["id"]);
        const date = String(row["date"] ?? row["day"] ?? to).slice(0, 10);
        if (!publicationId || date.length !== 10) continue;
        const { data: post } = await supabaseAdmin
          .from("social_posts")
          .select("id")
          .eq("postmypost_publication_id", publicationId)
          .maybeSingle();
        if (!post) continue;
        const { error } = await supabaseAdmin.from("social_post_stats").upsert(
          {
            post_id: post.id,
            channel_id: channel.id,
            platform: channel.platform,
            date,
            views: Number(row["views"] ?? row["impressions"] ?? 0) || 0,
            likes: Number(row["likes"] ?? row["reactions"] ?? 0) || 0,
            comments: Number(row["comments"] ?? 0) || 0,
            shares: Number(row["shares"] ?? row["reposts"] ?? 0) || 0,
            reach: Number(row["reach"] ?? 0) || 0,
          },
          { onConflict: "post_id,platform,date" },
        );
        if (!error) stats += 1;
      }
    } catch (error) {
      await supabaseAdmin
        .from("social_channels")
        .update({ last_error: error instanceof Error ? error.message : "Ошибка статистики" })
        .eq("id", channel.id);
    }
  }

  const { data: pending } = await supabaseAdmin
    .from("social_posts")
    .select("id, scheduled_at")
    .in("status", ["scheduled", "publishing"]);
  const now = Date.now();
  for (const post of pending ?? []) {
    if (post.scheduled_at && new Date(post.scheduled_at).getTime() <= now) {
      await supabaseAdmin
        .from("social_posts")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", post.id);
    }
  }
  return { posts: pending?.length ?? 0, stats };
}

export function socialSkillsPrompt(list: SocialSkill[]): string {
  if (!list.length) return "";
  return `\n\nПравила соцсетей, которым научил менеджер:\n${list.map((s, i) => `${i + 1}. ${s.text}`).join("\n")}`;
}

export function socialBrandPrompt(brand: SocialBrand): string {
  const parts = [
    brand.voice && `Голос: ${brand.voice}`,
    brand.audience && `Аудитория: ${brand.audience}`,
    brand.hashtags && `Хештеги: ${brand.hashtags}`,
    brand.forbidden && `Нельзя: ${brand.forbidden}`,
    brand.cta && `Призыв к действию: ${brand.cta}`,
    brand.examples && `Примеры удачных постов:\n${brand.examples}`,
  ].filter(Boolean);
  return parts.length ? `\n\nГолос бренда Residence More:\n${parts.join("\n")}` : "";
}
