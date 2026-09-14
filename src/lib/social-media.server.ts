import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PHOTO_MAX_BYTES, VIDEO_MAX_BYTES, VIDEO_MAX_WIDTH, type SocialMediaKind } from "@/lib/social-media";

const PHOTO_BUCKET = "property-photos";

const exec = promisify(execFile);

export type StoredSocialMedia = {
  path: string;
  kind: SocialMediaKind;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  url: string;
};

async function signedUrl(path: string) {
  const { data, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60 * 24);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Не удалось получить ссылку на файл");
  return data.signedUrl;
}

function hasFfmpeg() {
  return exec("ffmpeg", ["-version"], { timeout: 8000 }).then(
    () => true,
    () => false,
  );
}

async function transcodeVideo(input: Buffer, name: string) {
  const dir = await mkdtemp(join(tmpdir(), "rm-social-"));
  const ext = /\.mov$/i.test(name) ? ".mov" : ".mp4";
  const src = join(dir, `in${ext}`);
  const dest = join(dir, "out.mp4");
  try {
    await writeFile(src, input);
    const vf = `scale='min(${VIDEO_MAX_WIDTH},iw)':-2`;
    const run = (crf: string) =>
      exec(
        "ffmpeg",
        [
          "-y",
          "-i",
          src,
          "-vf",
          vf,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          crf,
          "-maxrate",
          "4M",
          "-bufsize",
          "8M",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          "-t",
          "900",
          dest,
        ],
        { timeout: 180_000 },
      );
    await run("23");
    let out = await readFile(dest);
    if (out.byteLength > VIDEO_MAX_BYTES) {
      await run("28");
      out = await readFile(dest);
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function storeSocialMediaFile(input: {
  file: File;
  kind: SocialMediaKind;
  width?: number;
  height?: number;
  durationSec?: number;
}): Promise<StoredSocialMedia> {
  let bytes = Buffer.from(await input.file.arrayBuffer());
  let mime = input.file.type || (input.kind === "video" ? "video/mp4" : "image/jpeg");
  let name = input.file.name || (input.kind === "video" ? "video.mp4" : "photo.jpg");

  if (input.kind === "photo" && bytes.byteLength > PHOTO_MAX_BYTES) {
    throw new Error("Фото больше 4 МБ. Выберите кадр ещё раз — мы сожмём его в редакторе.");
  }

  if (input.kind === "video" && (bytes.byteLength > VIDEO_MAX_BYTES || !/mp4|m4v/i.test(mime + name))) {
    if (!(await hasFfmpeg())) {
      throw new Error(
        bytes.byteLength > VIDEO_MAX_BYTES
          ? "Видео больше 45 МБ, а сжатие на сервере ещё недоступно. Загрузите MP4 легче 45 МБ."
          : "Нужен MP4 (H.264). MOV сожмётся на сервере после обновления системы.",
      );
    }
    bytes = await transcodeVideo(bytes, name);
    mime = "video/mp4";
    name = name.replace(/\.[^.]+$/, "") + ".mp4";
    if (bytes.byteLength > VIDEO_MAX_BYTES) {
      throw new Error("Даже после сжатия видео больше 45 МБ (лимит Telegram в Postmypost)");
    }
  }

  const ext = input.kind === "video" ? "mp4" : "jpg";
  const path = `social/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).upload(path, bytes, {
    cacheControl: "3600",
    upsert: false,
    contentType: mime,
  });
  if (error) throw new Error(error.message);
  return {
    path,
    kind: input.kind,
    mime,
    bytes: bytes.byteLength,
    width: input.width ?? null,
    height: input.height ?? null,
    durationSec: input.durationSec ?? null,
    url: await signedUrl(path),
  };
}

export async function downloadSocialMedia(path: string) {
  const { data, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || "Файл не найден");
  const buf = Buffer.from(await data.arrayBuffer());
  return { bytes: buf, mime: data.type || "application/octet-stream", name: path.split("/").pop() || "file" };
}

export async function signedSocialMediaUrls(paths: string[]) {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  const map: Record<string, string> = {};
  if (!unique.length) return map;
  const { data, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).createSignedUrls(unique, 60 * 60 * 12);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
  }
  return map;
}
