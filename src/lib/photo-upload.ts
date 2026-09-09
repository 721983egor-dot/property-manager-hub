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

/** Читает файл в картинку без createImageBitmap (нужен для части браузеров). */
function loadViaImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("браузер не смог открыть изображение"));
    };
    img.src = url;
  });
}

/** Уменьшает снимок и пережимает в JPEG, чтобы не упираться в лимит хранилища. */
async function compressImage(file: File): Promise<File> {
  let width = 0;
  let height = 0;
  let source: CanvasImageSource;
  let bitmap: ImageBitmap | null = null;

  if (typeof createImageBitmap === "function") {
    bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    source = bitmap;
  } else {
    const img = await loadViaImage(file);
    width = img.naturalWidth;
    height = img.naturalHeight;
    source = img;
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    // Маленький JPEG без масштабирования — грузим как есть.
    if (scale === 1 && file.type === "image/jpeg" && file.size <= 4 * 1024 * 1024) {
      return file;
    }
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(source, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap?.close();
  }
}

function reason(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
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
    if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|avif)$/i.test(file.name)) {
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
    // Сжатие не должно мешать загрузке: если оно не удалось, отправляем исходник.
    let prepared = file;
    try {
      prepared = await compressImage(file);
    } catch {
      prepared = file;
    }
    try {
      uploaded.push(await uploadPhoto(prepared));
    } catch (error) {
      failures.push({ name: file.name, reason: reason(error, "не удалось загрузить файл") });
    }
  }
  return { uploaded, failures };
}

