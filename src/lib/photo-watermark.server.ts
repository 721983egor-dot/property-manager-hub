import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { PHOTO_WATERMARK_OPACITY, PHOTO_WATERMARK_WIDTH_RATIO } from "@/lib/photo-watermark-style";

const exec = promisify(execFile);

function photoWatermarkPngPath() {
  const candidates = [
    join(process.cwd(), "public/photo-watermark.png"),
    join(process.cwd(), ".output/public/photo-watermark.png"),
    join(process.cwd(), "photo-watermark.png"),
    join(process.cwd(), "public/video-watermark.png"),
    join(process.cwd(), ".output/public/video-watermark.png"),
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
 * Белый логотип Residence More по центру кадра — тот же вид, что на сайте и в фидах.
 */
export async function overlayPhotoWatermark(input: Buffer): Promise<{ bytes: Buffer; contentType: string }> {
  const mark = photoWatermarkPngPath();
  if (!mark) throw new Error("Файл водяного знака не найден");
  if (!(await hasFfmpeg())) throw new Error("ffmpeg недоступен");

  const dir = await mkdtemp(join(tmpdir(), "rm-pwm-"));
  const src = join(dir, "in.jpg");
  const dest = join(dir, "out.jpg");
  try {
    await writeFile(src, input);
    const alpha = PHOTO_WATERMARK_OPACITY.toFixed(2);
    const width = PHOTO_WATERMARK_WIDTH_RATIO.toFixed(2);
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
          `[1:v]format=rgba,colorchannelmixer=aa=${alpha}[logo]`,
          `[logo][0:v]scale2ref=w=main_w*${width}:h=ow/mdar[wm][main]`,
          "[main][wm]overlay=(W-w)/2:(H-h)/2:format=auto",
        ].join(";"),
        "-frames:v",
        "1",
        "-q:v",
        "3",
        dest,
      ],
      { timeout: 60_000 },
    );
    return { bytes: await readFile(dest), contentType: "image/jpeg" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
