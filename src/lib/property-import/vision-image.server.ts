import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
const exec = promisify(execFile);

/** Bounded JPEG input for vision; nothing uploaded or persisted in the object before approval. */
export async function visionJpeg(bytes: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "rm-vision-"));
  try {
    const input = join(dir, "input");
    const output = join(dir, "vision.jpg");
    await writeFile(input, bytes);
    await exec(
      "ffmpeg",
      [
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-vf",
        "scale=1280:1280:force_original_aspect_ratio=decrease",
        "-frames:v",
        "1",
        "-q:v",
        "5",
        output,
      ],
      { timeout: 15000 },
    );
    const image = await readFile(output);
    if (image.length > 2 * 1024 * 1024) throw new Error("Не удалось подготовить фото для анализа");
    return image;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
