import {
  PHOTO_MAX_BYTES,
  PHOTO_MAX_SIDE,
  PHOTO_MIN_SIDE,
  clampCrop,
  type SocialMediaCrop,
} from "@/lib/social-media";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось открыть изображение"));
    };
    img.src = url;
  });
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Не удалось сжать фото");
  return blob;
}

/** Кадрирует и сжимает фото до JPEG под лимиты Postmypost / Instagram. */
export async function cropAndCompressPhoto(
  file: File,
  crop: SocialMediaCrop,
): Promise<{ file: File; width: number; height: number }> {
  const img = await loadImage(file);
  const safe = clampCrop(crop);
  const srcW = Math.max(1, Math.round(img.naturalWidth * safe.w));
  const srcH = Math.max(1, Math.round(img.naturalHeight * safe.h));
  const srcX = Math.round(img.naturalWidth * safe.x);
  const srcY = Math.round(img.naturalHeight * safe.y);

  const long = Math.max(srcW, srcH);
  const short = Math.min(srcW, srcH);
  let scale = 1;
  if (short > PHOTO_MAX_SIDE) scale = PHOTO_MAX_SIDE / short;
  else if (short < PHOTO_MIN_SIDE && long * (PHOTO_MIN_SIDE / short) <= PHOTO_MAX_SIDE * 2) {
    scale = PHOTO_MIN_SIDE / short;
  }
  if (long * scale > 1920) scale = 1920 / long;

  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Браузер не смог обработать фото");
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

  let quality = 0.86;
  let blob = await canvasToJpeg(canvas, quality);
  while (blob.size > PHOTO_MAX_BYTES && quality > 0.45) {
    quality -= 0.12;
    blob = await canvasToJpeg(canvas, quality);
  }
  if (blob.size > PHOTO_MAX_BYTES) {
    canvas.width = Math.max(1, Math.round(outW * 0.82));
    canvas.height = Math.max(1, Math.round(outH * 0.82));
    const again = canvas.getContext("2d");
    if (!again) throw new Error("Браузер не смог обработать фото");
    again.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
    blob = await canvasToJpeg(canvas, 0.72);
  }
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return {
    file: new File([blob], `${base}.jpg`, { type: "image/jpeg" }),
    width: canvas.width,
    height: canvas.height,
  };
}

export async function readImageSize(file: File) {
  const img = await loadImage(file);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

export function readVideoMeta(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration = video.duration;
      URL.revokeObjectURL(url);
      resolve({ width, height, duration: Number.isFinite(duration) ? duration : 0 });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать видео"));
    };
    video.src = url;
  });
}
