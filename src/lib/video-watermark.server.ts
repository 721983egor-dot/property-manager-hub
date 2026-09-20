import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PHOTO_BUCKET } from "@/lib/properties";

const exec = promisify(execFile);

function watermarkPngPath() {
  const candidates = [
    join(process.cwd(), "public/video-watermark.png"),
    join(process.cwd(), ".output/public/video-watermark.png"),
    join(process.cwd(), "video-watermark.png"),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

async function hasFfmpeg() {
  return exec("ffmpeg", ["-version"], { timeout: 8000 }).then(
    () => true,
    () => false,
  );
}

/**
 * Накладывает логотип Residence More в правом нижнем углу.
 * Под ним — полупрозрачная «стеклянная» подложка, сам знак крупнее и слегка прозрачный.
 */
export async function overlayVideoWatermark(input: Buffer): Promise<Buffer> {
  const mark = watermarkPngPath();
  if (!mark) throw new Error("Файл водяного знака не найден");
  if (!(await hasFfmpeg())) throw new Error("ffmpeg недоступен");

  const dir = await mkdtemp(join(tmpdir(), "rm-wm-"));
  const src = join(dir, "in.mp4");
  const dest = join(dir, "out.mp4");
  try {
    await writeFile(src, input);
    await exec(
      "ffmpeg",
      [
        "-y",
        "-i",
        src,
        "-i",
        mark,
        "-filter_complex",
        [
          "[1:v]format=rgba,colorchannelmixer=aa=0.80[logo]",
          "[logo][0:v]scale2ref=w=main_w*0.30:h=ow/mdar[wm][base]",
          "[wm]split[mark][plate]",
          "[plate]format=rgba,pad=iw+72:ih+52:36:26:white@0.20,boxblur=16:8[glass]",
          "[base][glass]overlay=W-w-14:H-h-12[tmp]",
          "[tmp][mark]overlay=W-w-50:H-h-38:format=auto",
        ].join(";"),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        dest,
      ],
      { timeout: 300_000 },
    );
    return await readFile(dest);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function isWatermarkedVideoPath(path: string) {
  return /-glass\.(mp4|m4v|mov|webm)$/i.test(path);
}

/** Скачивает ролик, ставит стеклянный логотип и сохраняет как *-glass.mp4. */
export async function ensureWatermarkedPropertyVideo(path: string): Promise<string> {
  if (!path || isWatermarkedVideoPath(path)) return path;
  const { data, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || "Не удалось скачать видео для водяного знака");
  const overlayed = await overlayVideoWatermark(Buffer.from(await data.arrayBuffer()));
  const next = `uploads/${crypto.randomUUID()}-glass.mp4`;
  const { error: uploadError } = await supabaseAdmin.storage.from(PHOTO_BUCKET).upload(next, overlayed, {
    cacheControl: "3600",
    upsert: false,
    contentType: "video/mp4",
  });
  if (uploadError) throw new Error(uploadError.message);
  return next;
}

export async function watermarkVideoBytes(bytes: ArrayBuffer): Promise<{ bytes: Buffer; contentType: string }> {
  const overlayed = await overlayVideoWatermark(Buffer.from(bytes));
  return { bytes: overlayed, contentType: "video/mp4" };
}
