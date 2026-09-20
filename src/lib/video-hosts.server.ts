import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PHOTO_BUCKET, splitPropertyMedia, type Property, type PropertyPhoto } from "@/lib/properties";
import { storedVideoPath } from "@/lib/property-video";
import { propertyVideoDescription, propertyVideoTags, propertyVideoTitle } from "@/lib/property-video-copy";
import { feedPhotoUrl } from "@/lib/cian-feed.server";
import { SITE_ORIGIN } from "@/lib/site";

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
  return (
    storedVideoPath(property.video_file_path) ||
    storedVideoPath(property.video_url) ||
    splitPropertyMedia(property.photos).videoPath ||
    null
  );
}

function publicFileOrigin() {
  return (
    process.env["PUBLIC_SITE_URL"] ||
    process.env["PUBLIC_BASE_URL"] ||
    SITE_ORIGIN
  ).replace(/\/$/, "");
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

function rutubeErrorText(payload: Record<string, unknown>, status: number) {
  const parts = [
    payload["detail"],
    payload["non_field_errors"],
    payload["username"],
    payload["password"],
    payload["raw"],
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return parts.join(" ") || String(status);
}

async function rutubeToken(settings: VideoHostSettings) {
  if (settings.rutube_token.trim()) return settings.rutube_token.trim();
  if (!settings.rutube_email || !settings.rutube_password) {
    throw new Error("Rutube не подключён");
  }
  const email = settings.rutube_email.trim();
  const password = settings.rutube_password;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "Rutube_PHPClient",
  };
  const attempts: Array<{ body: string; contentType: string }> = [
    {
      body: JSON.stringify({ username: email, password }),
      contentType: "application/json",
    },
    {
      body: JSON.stringify({ username: email, email, password }),
      contentType: "application/json",
    },
    {
      body: new URLSearchParams({ username: email, password }).toString(),
      contentType: "application/x-www-form-urlencoded",
    },
  ];
  let last = "400";
  for (const attempt of attempts) {
    const response = await fetch("https://rutube.ru/api/accounts/token_auth/", {
      method: "POST",
      headers: { ...headers, "Content-Type": attempt.contentType },
      body: attempt.body,
    });
    const payload = await jsonOrText(response);
    const token = String(payload["token"] ?? payload["key"] ?? "").trim();
    if (response.ok && token) {
      await saveVideoHostSettings({ rutube_token: token });
      return token;
    }
    last = rutubeErrorText(payload, response.status);
  }
  throw new Error(
    `Rutube вход: ${last}. Пароль с сайта Rutube для API не подходит (часто из‑за капчи). В Настройках → Видеоканалы вставьте Token API.`,
  );
}

async function publishRutube(settings: VideoHostSettings, title: string, description: string, fileUrl: string) {
  const token = await rutubeToken(settings);
  const body: Record<string, unknown> = {
    url: fileUrl,
    title,
    description,
    is_hidden: 0,
    category: settings.rutube_category_id,
    hidden: false,
  };
  if (settings.rutube_author_id.trim()) body["author"] = Number(settings.rutube_author_id) || settings.rutube_author_id;
  const response = await fetch("https://rutube.ru/api/video/", {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await jsonOrText(response);
  const id = String(payload["video_id"] ?? payload["id"] ?? "").replace(/[^a-zA-Z0-9]/g, "");
  if (!response.ok || !id) {
    throw new Error(`Rutube: ${String(payload["detail"] ?? payload["raw"] ?? response.status)}`);
  }
  return `https://rutube.ru/video/${id}/`;
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
) {
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
          title: title.slice(0, 100),
          description,
          tags: tags.map((t) => t.replace(/^#/, "")).slice(0, 15),
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
  return `https://www.youtube.com/watch?v=${id}`;
}

async function publishVk(settings: VideoHostSettings, title: string, description: string, link: string) {
  const group = settings.vk_group_id.replace(/[^\d]/g, "");
  const params = new URLSearchParams({
    access_token: settings.vk_token.trim(),
    v: "5.199",
    name: title.slice(0, 128),
    description,
    wallpost: "0",
    link,
  });
  if (group) params.set("group_id", group);
  const save = await fetch(`https://api.vk.com/method/video.save?${params.toString()}`);
  const payload = await jsonOrText(save);
  const error = payload["error"] as { error_msg?: string } | undefined;
  const response = payload["response"] as Record<string, unknown> | undefined;
  if (error?.error_msg) throw new Error(`VK: ${error.error_msg}`);
  const uploadUrl = String(response?.["upload_url"] ?? "");
  const ownerId = response?.["owner_id"];
  const videoId = response?.["video_id"];
  if (uploadUrl) {
    await fetch(uploadUrl, { method: "POST" }).catch(() => undefined);
  }
  if (ownerId == null || videoId == null) {
    throw new Error("VK не вернул идентификатор видео");
  }
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
  const fileUrl = feedPhotoUrl(publicFileOrigin(), publishPath);

  await persistVideoPhoto(propertyId, { path: publishPath, publishStatus: "publishing" });
  await tryUpdateProperty(propertyId, {
    video_file_path: publishPath,
    video_publish_status: "publishing",
    video_publish_error: "",
  });

  let rutubeUrl = property.video_url && /rutube\.ru/i.test(property.video_url) ? property.video_url : "";
  let youtubeUrl = property.video_youtube_url || "";
  let vkUrl = property.video_vk_url || "";

  const canRutube = Boolean(settings.rutube_token.trim() || (settings.rutube_email && settings.rutube_password));
  if (canRutube && !rutubeUrl) {
    try {
      rutubeUrl = await publishRutube(settings, title, description, fileUrl);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Rutube");
    }
  } else if (!canRutube) {
    errors.push("Rutube не подключён (Настройки → Видеоканалы)");
  }

  if (
    settings.youtube_client_id &&
    settings.youtube_client_secret &&
    settings.youtube_refresh_token &&
    !youtubeUrl
  ) {
    try {
      const bytes = await downloadPropertyVideo(publishPath);
      youtubeUrl = await publishYoutube(settings, title, description, tags, bytes, "video/mp4");
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "YouTube");
    }
  }

  const vkLink = rutubeUrl || youtubeUrl;
  if (settings.vk_token.trim() && vkLink && !vkUrl) {
    try {
      vkUrl = await publishVk(settings, title, description, vkLink);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "VK");
    }
  } else if (settings.vk_token.trim() && !vkLink) {
    errors.push("VK: сначала нужен Rutube или YouTube, чтобы добавить ролик в сообщество");
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
    .in("video_publish_status", ["pending", "publishing"])
    .order("updated_at", { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);
  const due = (data ?? []).filter((row) => {
    if (row.video_publish_status === "pending") return true;
    return new Date(String(row.updated_at)).getTime() < cutoff;
  }).slice(0, limit);
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
