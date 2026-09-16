/** Правила медиа для публикации через Postmypost сразу в Instagram, VK, Telegram и Макс. */

export const SOCIAL_MEDIA_MAX_ITEMS = 10;

/** Instagram: JPEG до 8 МБ. Берём 4 МБ, чтобы альбом Telegram (сумма ≤ 50 МБ) тоже проходил. */
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTO_FORMATS = ["image/jpeg", "image/png", "image/webp"] as const;
/** Минимальная сторона после сжатия — как в требованиях Postmypost к Instagram. */
export const PHOTO_MIN_SIDE = 1080;
export const PHOTO_MAX_SIDE = 1350;

/** Instagram принимает кадр от 4:5 до ~1.91:1. */
export const PHOTO_ASPECT_MIN = 0.8;
export const PHOTO_ASPECT_MAX = 1.91;

export const PHOTO_ASPECT_PRESETS = [
  { id: "portrait", label: "4:5 Instagram", value: 4 / 5 },
  { id: "square", label: "1:1", value: 1 },
  { id: "wide", label: "1.91:1", value: 1.91 },
] as const;

/** Telegram через API Postmypost — самый жёсткий лимит на видео (50 МБ). */
export const VIDEO_MAX_BYTES = 45 * 1024 * 1024;
export const VIDEO_UPLOAD_MAX_BYTES = 80 * 1024 * 1024;
export const VIDEO_MIN_SECONDS = 3;
export const VIDEO_MAX_SECONDS = 15 * 60;
export const VIDEO_MAX_WIDTH = 1080;

export type SocialMediaKind = "photo" | "video";

export type SocialMediaCrop = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SocialMediaItem = {
  id: string;
  kind: SocialMediaKind;
  path: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  url: string;
  sortOrder: number;
};

export function photoAspect(width: number, height: number) {
  if (height <= 0) return 1;
  return width / height;
}

export function photoNeedsCrop(width: number, height: number) {
  const ratio = photoAspect(width, height);
  return ratio < PHOTO_ASPECT_MIN - 0.02 || ratio > PHOTO_ASPECT_MAX + 0.02;
}

/** Наибольший прямоугольник заданного соотношения в центре кадра (нормализовано 0–1). */
export function coverCrop(width: number, height: number, aspect = 4 / 5): SocialMediaCrop {
  const imageAspect = photoAspect(width, height);
  if (imageAspect > aspect) {
    const w = aspect / imageAspect;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = imageAspect / aspect;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

export function clampCrop(crop: SocialMediaCrop): SocialMediaCrop {
  const w = Math.min(1, Math.max(0.08, crop.w));
  const h = Math.min(1, Math.max(0.08, crop.h));
  return {
    w,
    h,
    x: Math.min(Math.max(0, crop.x), 1 - w),
    y: Math.min(Math.max(0, crop.y), 1 - h),
  };
}

export function socialMediaRulesText() {
  return [
    "Медиа для поста через Postmypost (Instagram, VK, Telegram, Макс):",
    `— не больше ${SOCIAL_MEDIA_MAX_ITEMS} файлов;`,
    "— фото JPEG до 4 МБ, кадр от 4:5 до 1.91:1, короткая сторона около 1080 px; PNG/WEBP сжимаем в JPEG, HEIC не принимаем;",
    "— если снимок не влезает в кадр, в редакторе двигают рамку;",
    "— видео MP4 H.264+AAC до 45 МБ (лимит Telegram), от 3 секунд до 15 минут, ширина до 1080; большее сжимаем на сервере;",
    "— файлы прикрепляет менеджер во вкладке «Пост». Ассистент пишет текст, фото сам не загружает.",
  ].join("\n");
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/** Постоянный адрес файла с нашего сервера — подписанные ссылки хранилища в браузере часто не открываются. */
export function socialMediaDisplayUrl(path: string) {
  const encoded = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `/api/public/feed-photo/${encoded}`;
}

/** Telegram через бота Postmypost: подпись к медиа до 1024 символов, иначе текст отдельным сообщением. */
export const MESSENGER_CAPTION_LIMIT = 1024;

/** Telegram и Макс через Postmypost: подпись к медиа до 1024 символов, иначе текст отдельным сообщением. */
export function messengerSendsTextSeparately(text: string, mediaCount: number) {
  return mediaCount > 0 && text.trim().length >= MESSENGER_CAPTION_LIMIT;
}

export function isPhotoFile(file: File) {
  if (PHOTO_FORMATS.includes(file.type as (typeof PHOTO_FORMATS)[number])) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

export function isHeicFile(file: File) {
  return file.type === "image/heic" || file.type === "image/heif" || /\.hei[cf]$/i.test(file.name);
}

export function isVideoFile(file: File) {
  if (file.type.startsWith("video/")) return true;
  return /\.(mp4|mov|m4v|webm)$/i.test(file.name);
}
