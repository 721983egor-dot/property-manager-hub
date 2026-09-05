import { uploadPhoto, type PropertyPhoto } from "@/lib/properties";

/** Длинная сторона после сжатия. */
const MAX_DIMENSION = 2560;
const JPEG_QUALITY = 0.85;

export type UploadFailure = { name: string; reason: string };

function isHeic(file: File) {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.hei[cf]$/i.test(file.name)
  );
}

/** Уменьшает снимок и пережимает в JPEG, чтобы не упираться в лимит хранилища. */
async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    // Маленький JPEG без масштабирования — грузим как есть.
    if (scale === 1 && file.type === "image/jpeg" && file.size <= 4 * 1024 * 1024) {
      return file;
    }
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

/**
 * Загружает фото по одному: сжимает, шлёт в хранилище, собирает успехи и причины ошибок.
 * Одна неудачная фотография не отменяет остальные.
 */
export async function uploadPhotos(
  files: FileList | File[],
): Promise<{ uploaded: PropertyPhoto[]; failures: UploadFailure[] }> {
  const uploaded: PropertyPhoto[] = [];
  const failures: UploadFailure[] = [];
  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/")) {
      failures.push({ name: file.name, reason: "это не изображение" });
      continue;
    }
    if (isHeic(file)) {
      failures.push({
        name: file.name,
        reason: "формат HEIC не поддерживается — сохраните фото как JPG",
      });
      continue;
    }
    try {
      const compressed = await compressImage(file);
      uploaded.push(await uploadPhoto(compressed));
    } catch {
      failures.push({ name: file.name, reason: "не удалось загрузить файл" });
    }
  }
  return { uploaded, failures };
}
