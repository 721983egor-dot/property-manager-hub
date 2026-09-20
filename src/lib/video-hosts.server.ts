import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PHOTO_BUCKET, splitPropertyMedia, type Property, type PropertyPhoto } from "@/lib/properties";
import { storedVideoPath } from "@/lib/property-video";
import { propertyVideoDescription, propertyVideoTags, propertyVideoTitle, withYoutubeShortsMarkup } from "@/lib/property-video-copy";

export type VideoHostSettings = {
  rutube_email: string;
  rutube_password: string;
  rutube_token: string;
  rutube_author_id: string;
  rutube_category_id: number;
  vk_token: string;
  vk_group_id: string;
  youtube_client_id: string;
  youtube_client_secret: string;
  youtube_refresh_token: string;
  extra_hashtags: string;
};

export type VideoHostPublicStatus = {
  rutube: boolean;
  vk: boolean;
  youtube: boolean;
  extraHashtags: string;
  rutubeAuthorId: string;
  rutubeCategoryId: number;
  vkGroupId: string;
  youtubeClientId: string;
};

type PublishResult = {
  rutubeUrl: string;
  vkUrl: string;
  youtubeUrl: string;
  errors: string[];
};

const SECRET_FIELDS = [
  ["rutube_email", "RUTUBE_EMAIL"],
  ["rutube_password", "RUTUBE_PASSWORD"],
  ["rutube_token", "RUTUBE_TOKEN"],
  ["rutube_author_id", "RUTUBE_AUTHOR_ID"],
  ["vk_token", "VK_TOKEN"],
  ["vk_group_id", "VK_GROUP_ID"],
  ["youtube_client_id", "YOUTUBE_CLIENT_ID"],
  ["youtube_client_secret", "YOUTUBE_CLIENT_SECRET"],
  ["youtube_refresh_token", "YOUTUBE_REFRESH_TOKEN"],
  ["extra_hashtags", "VIDEO_EXTRA_HASHTAGS"],
] as const;

const DEFAULT_HASHTAGS = "#residencemore #сочи #арендасочи #долгосрочнаяаренда";

async function readSecret(name: string) {
  try {
    const { getPlatformSecret } = await import("@/lib/platform-secrets.server");
    return (await getPlatformSecret(name)).trim();
  } catch {
    return "";
  }
}

export async function loadVideoHostSettings(): Promise<VideoHostSettings> {
  const values = Object.fromEntries(
    await Promise.all(SECRET_FIELDS.map(async ([field, name]) => [field, await readSecret(name)])),
  ) as Record<string, string>;
  const category = Number(await readSecret("RUTUBE_CATEGORY_ID")) || 13;
  return {
    rutube_email: values.rutube_email ?? "",
    rutube_password: values.rutube_password ?? "",
    rutube_token: values.rutube_token ?? "",
    rutube_author_id: values.rutube_author_id ?? "",
    rutube_category_id: category,
    vk_token: values.vk_token ?? "",
    vk_group_id: values.vk_group_id ?? "",
    youtube_client_id: values.youtube_client_id ?? "",
    youtube_client_secret: values.youtube_client_secret ?? "",
    youtube_refresh_token: values.youtube_refresh_token ?? "",
    extra_hashtags: values.extra_hashtags || DEFAULT_HASHTAGS,
  };
}

export function publicVideoHostStatus(settings: VideoHostSettings): VideoHostPublicStatus {
  return {
    rutube: Boolean(settings.rutube_token.trim() || (settings.rutube_email && settings.rutube_password)),
    vk: Boolean(settings.vk_token.trim()),
    youtube: Boolean(
      settings.youtube_client_id.trim() &&
        settings.youtube_client_secret.trim() &&
        settings.youtube_refresh_token.trim(),
    ),
    extraHashtags: settings.extra_hashtags,
    rutubeAuthorId: settings.rutube_author_id,
    rutubeCategoryId: settings.rutube_category_id,
    vkGroupId: settings.vk_group_id,
    youtubeClientId: settings.youtube_client_id,
  };
}

export async function saveVideoHostSettings(patch: Partial<VideoHostSettings>) {
  const { setPlatformSecret } = await import("@/lib/platform-secrets.server");
  for (const [field, name] of SECRET_FIELDS) {
    const value = patch[field];
    if (typeof value !== "string") continue;
    if (value.trim() === "" && field !== "extra_hashtags" && field !== "rutube_author_id" && field !== "vk_group_id") {
      continue;
    }
    await setPlatformSecret(name, value);
  }
  if (patch.rutube_category_id != null) {
    await setPlatformSecret("RUTUBE_CATEGORY_ID", String(patch.rutube_category_id || 13));
  }
}

function filePathOf(property: Property) {
  const candidates = [
    storedVideoPath(property.video_url),
    storedVideoPath(property.video_file_path),
    splitPropertyMedia(property.photos).videoPath || null,
  ].filter((path): path is string => Boolean(path));
  const original = candidates.find((path) => !/-logo\.(mp4|m4v|mov|webm)$/i.test(path));
  return original || candidates[0] || null;
}

async function persistVideoPhoto(propertyId: string, entry: PropertyPhoto) {
  const { data } = await supabaseAdmin.from("properties").select("photos").eq("id", propertyId).maybeSingle();
  const { images } = splitPropertyMedia(
    Array.isArray(data?.["photos"]) ? (data?.["photos"] as PropertyPhoto[]) : [],
  );
  await supabaseAdmin
    .from("properties")
    .update({ photos: [...images, { kind: "video", ...entry }] } as never)
    .eq("id", propertyId);
}

async function tryUpdateProperty(propertyId: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("properties").update(patch as never).eq("id", propertyId);
  if (error) console.error("video property update skipped", error.message);
}

async function jsonOrText(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

async function youtubeAccessToken(settings: VideoHostSettings) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.youtube_client_id.trim(),
      client_secret: settings.youtube_client_secret.trim(),
      refresh_token: settings.youtube_refresh_token.trim(),
      grant_type: "refresh_token",
    }),
  });
  const payload = await jsonOrText(response);
  const token = String(payload["access_token"] ?? "");
  if (!response.ok || !token) {
    throw new Error(`YouTube токен: ${String(payload["error_description"] ?? payload["error"] ?? response.status)}`);
  }
  return token;
}

async function publishYoutube(
  settings: VideoHostSettings,
  title: string,
  description: string,
  tags: string[],
  bytes: ArrayBuffer,
  mime: string,
  asShort: boolean,
) {
  const copy = asShort ? withYoutubeShortsMarkup(title, description, tags) : { title, description, tags };
  const access = await youtubeAccessToken(settings);
  const start = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mime || "video/mp4",
        "X-Upload-Content-Length": String(bytes.byteLength),
      },
      body: JSON.stringify({
        snippet: {
          title: copy.title.slice(0, 100),
          description: copy.description,
          tags: copy.tags.map((t) => t.replace(/^#/, "")).slice(0, 15),
          categoryId: "19",
        },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      }),
    },
  );
  const uploadUrl = start.headers.get("location");
  if (!start.ok || !uploadUrl) {
    const payload = await jsonOrText(start);
    throw new Error(`YouTube старт: ${JSON.stringify(payload["error"] ?? payload)}`);
  }
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": mime || "video/mp4",
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });
  const payload = await jsonOrText(put);
  const id = String(payload["id"] ?? "");
  if (!put.ok || !id) {
    throw new Error(`YouTube загрузка: ${JSON.stringify(payload["error"] ?? payload)}`);
  }
  return asShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;
}

async function vkCall(method: string, params: URLSearchParams) {
  const save = await fetch(`https://api.vk.com/method/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  return jsonOrText(save);
}

function vkErrorMessage(payload: Record<string, unknown>, prefix = "VK") {
  const error = payload["error"] as { error_msg?: string; error_code?: number } | undefined;
  const message = error?.error_msg || "";
  if (!message) return null;
  if (error?.error_code === 5 || /user authorization failed/i.test(message)) {
    return `${prefix}: токен не принят. Нужен ключ пользователя или сообщества с правом «Видео», не мини-приложение. Ссылку vk.ru/residencemore можно оставить — ID группы подставим сами.`;
  }
  return `${prefix}: ${message}`;
}

function parseVkGroupRef(raw: string): { id?: string; screen?: string } {
  const value = raw.trim();
  if (!value) return {};
  if (/^\d+$/.test(value)) return { id: value };
  const slug = (() => {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://vk.com/${value.replace(/^@/, "")}`);
      return url.pathname.replace(/^\//, "").split("/")[0] ?? "";
    } catch {
      return value.replace(/^@/, "");
    }
  })();
  const club = slug.match(/^(?:club|public|event)(\d+)$/i);
  if (club?.[1]) return { id: club[1] };
  if (/^\d+$/.test(slug)) return { id: slug };
  return slug ? { screen: slug } : {};
}

async function resolveVkGroupId(settings: VideoHostSettings): Promise<string> {
  const parsed = parseVkGroupRef(settings.vk_group_id);
  if (parsed.id) return parsed.id;
  if (!parsed.screen || !settings.vk_token.trim()) return "";
  const params = new URLSearchParams({
    access_token: settings.vk_token.trim(),
    v: "5.199",
    screen_name: parsed.screen,
  });
  const payload = await vkCall("utils.resolveScreenName", params);
  const authError = vkErrorMessage(payload, "VK");
  if (authError) throw new Error(authError);
  const response = payload["response"] as { type?: string; object_id?: number } | undefined;
  if (response?.type === "group" || response?.type === "page") {
    return String(response.object_id ?? "");
  }
  throw new Error(`VK: «${parsed.screen}» — это не сообщество. Укажите ссылку вида https://vk.ru/residencemore`);
}

async function publishVkClip(
  settings: VideoHostSettings,
  description: string,
  bytes: ArrayBuffer,
) {
  const group = await resolveVkGroupId(settings);
  const params = new URLSearchParams({
    access_token: settings.vk_token.trim(),
    v: "5.199",
    file_size: String(bytes.byteLength),
    description: description.slice(0, 4000),
    wallpost: "0",
  });
  if (group) params.set("group_id", group);
  const payload = await vkCall("shortVideo.create", params);
  const clipError = vkErrorMessage(payload, "VK клип");
  if (clipError) throw new Error(clipError);
  const response = payload["response"] as Record<string, unknown> | undefined;
  const uploadUrl = String(response?.["upload_url"] ?? "");
  const ownerId = response?.["owner_id"];
  const videoId = response?.["video_id"];
  if (!uploadUrl) throw new Error("VK клип: нет адреса загрузки");
  const blob = new Blob([bytes], { type: "video/mp4" });
  const form = new FormData();
  form.append("file", blob, "clip.mp4");
  let uploaded = await fetch(uploadUrl, { method: "POST", body: form });
  if (!uploaded.ok) {
    const retry = new FormData();
    retry.append("data", blob, "clip.mp4");
    uploaded = await fetch(uploadUrl, { method: "POST", body: retry });
  }
  if (!uploaded.ok) throw new Error(`VK клип загрузка: ${uploaded.status}`);
  if (ownerId == null || videoId == null) {
    const body = await jsonOrText(uploaded);
    const oid = body["owner_id"] ?? body["ownerId"];
    const vid = body["video_id"] ?? body["videoId"] ?? body["clip_id"];
    if (oid != null && vid != null) return `https://vk.com/clip${oid}_${vid}`;
    throw new Error("VK клип не вернул идентификатор");
  }
  return `https://vk.com/clip${ownerId}_${videoId}`;
}

async function publishVkFile(
  settings: VideoHostSettings,
  title: string,
  description: string,
  bytes: ArrayBuffer,
) {
  const group = await resolveVkGroupId(settings);
  const params = new URLSearchParams({
    access_token: settings.vk_token.trim(),
    v: "5.199",
    name: title.slice(0, 128),
    description,
    wallpost: "0",
  });
  if (group) params.set("group_id", group);
  const payload = await vkCall("video.save", params);
  const saveError = vkErrorMessage(payload, "VK");
  if (saveError) throw new Error(saveError);
  const response = payload["response"] as Record<string, unknown> | undefined;
  const uploadUrl = String(response?.["upload_url"] ?? "");
  const ownerId = response?.["owner_id"];
  const videoId = response?.["video_id"];
  if (!uploadUrl) throw new Error("VK не вернул адрес загрузки");
  const form = new FormData();
  form.append("video_file", new Blob([bytes], { type: "video/mp4" }), "video.mp4");
  const uploaded = await fetch(uploadUrl, { method: "POST", body: form });
  if (!uploaded.ok) throw new Error(`VK загрузка: ${uploaded.status}`);
  if (ownerId == null || videoId == null) throw new Error("VK не вернул идентификатор видео");
  return `https://vkvideo.ru/video${ownerId}_${videoId}`;
}

async function downloadPropertyVideo(path: string) {
  const { data, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || "Не удалось скачать видео из хранилища");
  return data.arrayBuffer();
}

export async function publishPropertyVideoToHosts(propertyId: string): Promise<PublishResult> {
  const { data, error } = await supabaseAdmin.from("properties").select("*").eq("id", propertyId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Объект не найден");
  const property = data as unknown as Property;
  const path = filePathOf(property);
  if (!path) throw new Error("Нет видеофайла для выгрузки — загрузите MP4 в карточке объекта");

  const errors: string[] = [];
  let publishPath = path;
  try {
    const { ensureWatermarkedPropertyVideo } = await import("@/lib/video-watermark.server");
    publishPath = await ensureWatermarkedPropertyVideo(path);
  } catch (e) {
    errors.push(e instanceof Error ? `Водяной знак: ${e.message}` : "Водяной знак");
  }

  const settings = await loadVideoHostSettings();
  const title = propertyVideoTitle(property);
  const description = propertyVideoDescription(property, settings.extra_hashtags);
  const tags = propertyVideoTags(settings.extra_hashtags);
  let bytes: ArrayBuffer | null = null;
  try {
    bytes = await downloadPropertyVideo(publishPath);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Не удалось скачать видео");
  }
  const shape = bytes
    ? await (await import("@/lib/video-watermark.server")).probeVideoShape(Buffer.from(bytes))
    : { youtubeShort: false, vkClip: false, width: 0, height: 0, durationSec: 0 };

  await persistVideoPhoto(propertyId, { path: publishPath, publishStatus: "publishing" });
  await tryUpdateProperty(propertyId, {
    video_file_path: publishPath,
    video_publish_status: "publishing",
    video_publish_error: "",
  });

  const rutubeUrl = property.video_url && /rutube\.ru/i.test(property.video_url) ? property.video_url : "";
  let youtubeUrl = property.video_youtube_url || "";
  let vkUrl = property.video_vk_url || "";

  const youtubeReady = Boolean(
    settings.youtube_client_id && settings.youtube_client_secret && settings.youtube_refresh_token,
  );
  const youtubeAlreadyShort = /youtube\.com\/shorts\//i.test(youtubeUrl);
  if (youtubeReady && bytes && (!youtubeUrl || (shape.youtubeShort && !youtubeAlreadyShort))) {
    try {
      youtubeUrl = await publishYoutube(
        settings,
        title,
        description,
        tags,
        bytes,
        "video/mp4",
        shape.youtubeShort,
      );
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "YouTube");
    }
  } else if (!youtubeReady && !youtubeUrl) {
    errors.push("YouTube не подключён (Настройки → Видеоканалы)");
  }

  if (settings.vk_token.trim() && !vkUrl && bytes) {
    try {
      if (shape.vkClip) {
        try {
          vkUrl = await publishVkClip(settings, description, bytes);
        } catch {
          vkUrl = await publishVkFile(settings, title, description, bytes);
        }
      } else {
        vkUrl = await publishVkFile(settings, title, description, bytes);
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "VK");
    }
  } else if (!settings.vk_token.trim() && !vkUrl) {
    errors.push("VK не подключён (Настройки → Видеоканалы)");
  }

  const status = rutubeUrl || youtubeUrl || vkUrl ? "published" : "failed";
  await persistVideoPhoto(propertyId, {
    path: publishPath,
    rutubeUrl,
    youtubeUrl,
    vkUrl,
    publishStatus: status,
    publishError: errors.join("; "),
  });
  await tryUpdateProperty(propertyId, {
    video_file_path: publishPath,
    video_url: rutubeUrl || property.video_url || publishPath,
    video_vk_url: vkUrl,
    video_youtube_url: youtubeUrl,
    video_publish_status: status,
    video_publish_error: errors.join("; "),
  });

  return { rutubeUrl, vkUrl, youtubeUrl, errors };
}

export async function queuePropertyVideoPublish(propertyId: string, filePath: string) {
  await persistVideoPhoto(propertyId, { path: filePath, publishStatus: "pending" });
  await tryUpdateProperty(propertyId, {
    video_file_path: filePath,
    video_publish_status: "pending",
    video_publish_error: "",
  });
}

export async function processPendingPropertyVideos(limit = 3) {
  const cutoff = Date.now() - 10 * 60 * 1000;
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("id, video_publish_status, updated_at")
    .neq("video_file_path", "")
    .in("video_publish_status", ["publishing"])
    .order("updated_at", { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);
  const due = (data ?? [])
    .filter((row) => new Date(String(row.updated_at)).getTime() < cutoff)
    .slice(0, limit);
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const row of due) {
    try {
      await publishPropertyVideoToHosts(row.id);
      results.push({ id: row.id, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "ошибка";
      await supabaseAdmin
        .from("properties")
        .update({ video_publish_status: "failed", video_publish_error: message } as never)
        .eq("id", row.id);
      results.push({ id: row.id, ok: false, error: message });
    }
  }
  return results;
}
