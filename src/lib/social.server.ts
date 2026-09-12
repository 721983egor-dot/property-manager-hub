import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPlatformSecret, setPlatformSecret } from "@/lib/platform-secrets.server";
import {
  createPostmypostPublication,
  deletePostmypostPublication,
  getPostmypostToken,
  getPublicationAnalytics,
  listPostmypostAccounts,
  listPostmypostProjects,
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

const CHANNEL_COLUMNS =
  "id, platform, name, enabled, postmypost_account_id, postmypost_channel, external_url, last_synced_at, last_error";
const POST_COLUMNS =
  "id, status, topic, body, property_id, scheduled_at, published_at, created_by, source, postmypost_publication_id, last_error, created_at";
const TARGET_COLUMNS =
  "id, post_id, channel_id, platform, body, status, postmypost_account_id, external_url, last_error";

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

function mapPost(
  row: Record<string, unknown>,
  targets: SocialPostTarget[],
  propertyTitle: string | null,
): SocialPost {
  return {
    id: String(row["id"]),
    status: row["status"] as SocialPostStatus,
    topic: String(row["topic"] ?? ""),
    body: String(row["body"] ?? ""),
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
  };
}

export async function loadSocialPosts(limit = 80): Promise<SocialPost[]> {
  const { data, error } = await supabaseAdmin
    .from("social_posts")
    .select(POST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const posts = (data ?? []) as Record<string, unknown>[];
  if (!posts.length) return [];

  const ids = posts.map((p) => String(p["id"]));
  const propertyIds = posts.map((p) => p["property_id"]).filter(Boolean) as string[];

  const [{ data: targets }, { data: properties }] = await Promise.all([
    supabaseAdmin.from("social_post_targets").select(TARGET_COLUMNS).in("post_id", ids),
    propertyIds.length
      ? supabaseAdmin.from("properties").select("id, title, internal_name, ref_id").in("id", propertyIds)
      : Promise.resolve({ data: [] as { id: string; title: string; internal_name: string | null; ref_id: number }[] }),
  ]);

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
    ),
  );
}

export async function loadSocialBoard(): Promise<SocialBoard> {
  const token = (await getPlatformSecret("POSTMYPOST_API_TOKEN").catch(() => "")).trim();
  const [{ data: settings }, channels, posts, brand, skills] = await Promise.all([
    supabaseAdmin.from("social_settings").select("postmypost_project_id, timezone").eq("id", true).maybeSingle(),
    loadSocialChannels(),
    loadSocialPosts(),
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
  scheduledAt?: string | null;
  publish?: boolean;
  source?: "manual" | "assistant";
  createdBy?: string;
};

async function replaceTargets(
  postId: string,
  body: string,
  platforms: SocialPlatform[],
  channels: SocialChannel[],
) {
  const { error: delError } = await supabaseAdmin.from("social_post_targets").delete().eq("post_id", postId);
  if (delError) throw new Error(delError.message);
  const rows = platforms
    .map((platform) => channels.find((c) => c.platform === platform))
    .filter((c): c is SocialChannel => Boolean(c))
    .map((channel) => ({
      post_id: postId,
      channel_id: channel.id,
      platform: channel.platform,
      body,
      status: "draft",
      postmypost_account_id: channel.postmypost_account_id,
    }));
  if (!rows.length) throw new Error("Не выбраны каналы");
  const { error } = await supabaseAdmin.from("social_post_targets").insert(rows);
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

  const row = {
    topic,
    body,
    property_id: input.propertyId || null,
    scheduled_at: input.scheduledAt || null,
    created_by: input.createdBy ?? "",
    source: input.source ?? "manual",
    status: input.publish ? status : "draft",
    last_error: "",
  };

  let postId = input.id ?? "";
  if (postId) {
    const { error } = await supabaseAdmin.from("social_posts").update(row).eq("id", postId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabaseAdmin.from("social_posts").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    postId = data.id;
  }

  await replaceTargets(postId, body, platforms, channels);
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
      content: (t.body || post.body).trim(),
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
