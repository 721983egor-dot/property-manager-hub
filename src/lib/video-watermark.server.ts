import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PHOTO_BUCKET } from "@/lib/properties";

const exec = promisify(execFile);

/** Белый логотип без подложки, справа внизу — как на примере для роликов. */
const VIDEO_WATERMARK_WIDTH_RATIO = 0.48;
const VIDEO_WATERMARK_MARGIN_RATIO = 0.04;
const VIDEO_WATERMARK_OPACITY = 0.92;
/** Длинная сторона после сжатия — хватает для сайта и телефона. */
const VIDEO_MAX_EDGE = 1280;
/** Целевой размер файла на сайте, чтобы ролик грузился с телефона. */
const VIDEO_TARGET_BYTES = 25 * 1024 * 1024;

function watermarkPngPath() {
  const candidates = [
    join(process.cwd(), "public/video-watermark.png"),
    join(process.cwd(), ".output/public/video-watermark.png"),
    join(process.cwd(), "video-watermark.png"),
    join(process.cwd(), "public/photo-watermark.png"),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

async function hasFfmpeg() {
  return exec("ffmpeg", ["-version"], { timeout: 8000 }).then(
    () => true,
    () => false,
  );
}

type VideoShape = {
  width: number;
  height: number;
  durationSec: number;
  youtubeShort: boolean;
  vkClip: boolean;
  /** 90 / -90 / 270 — телефонное видео, в файле лежит «лёжа». */
  rotation: number;
};

const EMPTY_SHAPE: VideoShape = {
  width: 0,
  height: 0,
  durationSec: 0,
  youtubeShort: false,
  vkClip: false,
  rotation: 0,
};

function transposeExpr(rotation: number) {
  const turns = ((Math.round(rotation) % 360) + 360) % 360;
  if (turns === 90) return "transpose=1";
  if (turns === 270 || turns === -90) return "transpose=2";
  if (turns === 180) return "transpose=1,transpose=1";
  return "";
}

function shapeFromSize(width: number, height: number, durationSec: number, rotation: number): VideoShape {
  const turns = ((Math.round(rotation) % 360) + 360) % 360;
  const swapped = turns === 90 || turns === 270;
  const displayW = swapped ? height : width;
  const displayH = swapped ? width : height;
  const portrait = displayH > 0 && displayW > 0 && displayH >= displayW;
  const clipRatio = displayH > 0 && displayW > 0 && displayH / displayW >= 1.2;
  return {
    width: displayW,
    height: displayH,
    durationSec,
    rotation,
    youtubeShort: portrait && durationSec > 0 && durationSec <= 180,
    vkClip: clipRatio && durationSec > 0 && durationSec <= 60,
  };
}

async function probeVideoFile(src: string): Promise<VideoShape> {
  const { stdout } = await exec(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,duration,side_data_list:stream_tags=rotate",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      src,
    ],
    { timeout: 30_000 },
  );
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{
      width?: number;
      height?: number;
      duration?: string;
      tags?: { rotate?: string };
      side_data_list?: Array<{ rotation?: number }>;
    }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0] ?? {};
  const tagRotate = Number(stream.tags?.rotate);
  const matrixRotate = Number(stream.side_data_list?.find((item) => item.rotation != null)?.rotation);
  const rotation = Number.isFinite(tagRotate) && tagRotate !== 0 ? tagRotate : Number.isFinite(matrixRotate) ? matrixRotate : 0;
  const durationSec = Number(stream.duration || parsed.format?.duration) || 0;
  return shapeFromSize(Number(stream.width) || 0, Number(stream.height) || 0, durationSec, rotation);
}

/**
 * Накладывает белый логотип Residence More в правом нижнем углу.
 * Без подложки; ширина около половины кадра, чтобы знак читался.
 * Телефонные ролики с метаданными поворота разворачиваются в настоящую вертикаль —
 * иначе YouTube считает их обычным горизонтальным видео, а не Shorts.
 * Большой исходник ужимаем до Full HD и примерно 25 МБ.
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
    const probed = await probeVideoFile(src).catch(() => EMPTY_SHAPE);
    const rotate = transposeExpr(probed.rotation);
    const alpha = VIDEO_WATERMARK_OPACITY.toFixed(2);
    const width = VIDEO_WATERMARK_WIDTH_RATIO.toFixed(2);
    const margin = VIDEO_WATERMARK_MARGIN_RATIO.toFixed(2);
    const scale = `scale='min(${VIDEO_MAX_EDGE},iw)':'min(${VIDEO_MAX_EDGE},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
    const filters = [
      rotate ? `[0:v]${rotate},${scale}[v0]` : `[0:v]${scale}[v0]`,
      `[1:v]format=rgba,colorchannelmixer=aa=${alpha}[logo]`,
      `[logo][v0]scale2ref=w=ref_w*${width}:h=ow/mdar[wm][main]`,
      `[main][wm]overlay=W-w-W*${margin}:H-h-H*${margin}:format=auto`,
    ];
    const common = [
      "-y",
      "-noautorotate",
      "-i",
      src,
      "-i",
      mark,
      "-filter_complex",
      filters.join(";"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "main",
      "-level",
      "4.0",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
    ];

    const run = (extra: string[]) =>
      exec("ffmpeg", [...common, ...extra, dest], { timeout: 420_000 });

    await run(["-crf", "23", "-maxrate", "2500k", "-bufsize", "5000k"]);
    let out = await readFile(dest);
    if (out.byteLength > VIDEO_TARGET_BYTES) {
      await run(["-crf", "28", "-maxrate", "1600k", "-bufsize", "3200k"]);
      out = await readFile(dest);
    }
    if (out.byteLength > VIDEO_TARGET_BYTES && probed.durationSec > 1) {
      const audioBits = 96_000 * probed.durationSec;
      const videoBits = Math.max(400_000, (VIDEO_TARGET_BYTES * 8 * 0.92 - audioBits) / probed.durationSec);
      const kbps = Math.max(400, Math.min(1800, Math.floor(videoBits / 1000)));
      await run(["-b:v", `${kbps}k`, "-maxrate", `${kbps}k`, "-bufsize", `${kbps * 2}k`]);
      out = await readFile(dest);
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function isWatermarkedVideoPath(path: string) {
  return /-logo\.(mp4|m4v|mov|webm)$/i.test(path);
}

/** Скачивает ролик, ставит прозрачный логотип и сохраняет как *-logo.mp4. */
export async function ensureWatermarkedPropertyVideo(path: string): Promise<string> {
  if (!path || isWatermarkedVideoPath(path)) return path;
  const { data, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || "Не удалось скачать видео для водяного знака");
  const overlayed = await overlayVideoWatermark(Buffer.from(await data.arrayBuffer()));
  const next = `uploads/${crypto.randomUUID()}-logo.mp4`;
  const { error: uploadError } = await supabaseAdmin.storage.from(PHOTO_BUCKET).upload(next, overlayed, {
    cacheControl: "3600",
    upsert: false,
    contentType: "video/mp4",
  });
  if (uploadError) throw new Error(uploadError.message);
  return next;
}

export async function probeVideoShape(input: Buffer): Promise<VideoShape> {
  if (!(await hasFfmpeg())) return EMPTY_SHAPE;
  const dir = await mkdtemp(join(tmpdir(), "rm-probe-"));
  const src = join(dir, "in.mp4");
  try {
    await writeFile(src, input);
    return await probeVideoFile(src);
  } catch {
    return EMPTY_SHAPE;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function watermarkVideoBytes(bytes: ArrayBuffer): Promise<{ bytes: Buffer; contentType: string }> {
  const overlayed = await overlayVideoWatermark(Buffer.from(bytes));
  return { bytes: overlayed, contentType: "video/mp4" };
}
