/** Путь файла в бакете, если это не внешняя ссылка. */
export function storedVideoPath(videoUrl: string | null | undefined): string | null {
  const value = (videoUrl ?? "").trim();
  if (!value || /^https?:\/\//i.test(value)) return null;
  return value;
}

export type VideoHost = "rutube" | "vk" | "youtube" | "file";

export type ParsedPropertyVideo = {
  host: VideoHost;
  raw: string;
  /** Каноническая ссылка для фидов. У файла — null. */
  watchUrl: string | null;
  isVkClip?: boolean;
  youtubeId?: string;
  rutubeId?: string;
  path?: string;
};

export type PropertyVideoPlayback = { kind: "embed" | "file"; src: string };

export function parsePropertyVideoValue(
  videoUrl: string | null | undefined,
): ParsedPropertyVideo | null {
  const value = (videoUrl ?? "").trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    return { host: "file", raw: value, watchUrl: null, path: value };
  }
  if (isDirectVideoFile(value)) {
    return { host: "file", raw: value, watchUrl: value, path: undefined };
  }
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = youtubeId(parsed.pathname.split("/").filter(Boolean)[0]);
      return id ? youtubeParsed(value, id) : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const id = youtubeId(
        parsed.pathname.startsWith("/embed/") || parsed.pathname.startsWith("/shorts/")
          ? parsed.pathname.split("/")[2]
          : parsed.searchParams.get("v"),
      );
      return id ? youtubeParsed(value, id) : null;
    }

    if (host === "vk.com" || host === "m.vk.com" || host === "vkvideo.ru") {
      const clip = /clip/i.test(parsed.pathname);
      const fromPath = parsed.pathname.match(/(?:video|clip)(-?\d+)_(\d+)/i);
      const oid = fromPath?.[1] ?? parsed.searchParams.get("oid");
      const id = fromPath?.[2] ?? parsed.searchParams.get("id");
      const safeOid = String(oid ?? "").replace(/[^\d-]/g, "");
      const safeId = String(id ?? "").replace(/\D/g, "");
      if (!safeOid || !safeId) return null;
      return {
        host: "vk",
        raw: value,
        watchUrl: `https://vkvideo.ru/video${safeOid}_${safeId}`,
        isVkClip: clip,
      };
    }

    if (host === "rutube.ru") {
      const id = parsed.pathname.match(/\/(?:video|play\/embed)\/([a-zA-Z0-9]+)/)?.[1] ?? null;
      if (!id) return null;
      return {
        host: "rutube",
        raw: value,
        watchUrl: `https://rutube.ru/video/${id}/`,
        rutubeId: id,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Готовый источник для плеера. Неизвестный URL в iframe не кладём —
 * только YouTube, VK, Rutube или прямой файл.
 */
export function resolvePropertyVideo(
  videoUrl: string | null | undefined,
  fileSrc?: string | null,
): PropertyVideoPlayback | null {
  const parsed = parsePropertyVideoValue(videoUrl);
  if (!parsed) {
    const src = (fileSrc ?? "").trim();
    return src ? { kind: "file", src } : null;
  }
  if (parsed.host === "file") {
    const src = (parsed.watchUrl || fileSrc || "").trim();
    return src ? { kind: "file", src } : null;
  }
  if (parsed.host === "youtube" && parsed.youtubeId) {
    return { kind: "embed", src: youtubeEmbedSrc(parsed.youtubeId) };
  }
  if (parsed.host === "rutube" && parsed.rutubeId) {
    return { kind: "embed", src: `https://rutube.ru/play/embed/${parsed.rutubeId}` };
  }
  if (parsed.host === "vk" && parsed.watchUrl) {
    const match = parsed.watchUrl.match(/video(-?\d+)_(\d+)/);
    if (!match) return null;
    return {
      kind: "embed",
      src: `https://vk.com/video_ext.php?oid=${encodeURIComponent(match[1]!)}&id=${encodeURIComponent(match[2]!)}&hd=2`,
    };
  }
  return null;
}

/** ЦИАН: только VK (не клип) или Rutube. */
export function cianFeedVideoUrl(videoUrl: string | null | undefined): string | null {
  const parsed = parsePropertyVideoValue(videoUrl);
  if (!parsed?.watchUrl) return null;
  if (parsed.host === "rutube") return parsed.watchUrl;
  if (parsed.host === "vk" && !parsed.isVkClip) return parsed.watchUrl;
  return null;
}

/** Яндекс.Недвижимость: YouTube или Rutube. */
export function yandexFeedVideoReview(
  videoUrl: string | null | undefined,
): { tag: "youtube-video-review-url" | "rutube-video-review-url"; url: string } | null {
  const parsed = parsePropertyVideoValue(videoUrl);
  if (!parsed?.watchUrl) return null;
  if (parsed.host === "youtube") return { tag: "youtube-video-review-url", url: parsed.watchUrl };
  if (parsed.host === "rutube") return { tag: "rutube-video-review-url", url: parsed.watchUrl };
  return null;
}

/** Авито: прямой файл MP4 или ссылка YouTube/Rutube. */
export function avitoFeedVideo(
  videoUrl: string | null | undefined,
  fileUrl?: string | null,
): { videoUrl?: string; videoFileUrl?: string } | null {
  const parsed = parsePropertyVideoValue(videoUrl);
  if (!parsed) {
    const src = (fileUrl ?? "").trim();
    return src ? { videoFileUrl: src } : null;
  }
  if (parsed.host === "file") {
    const src = (fileUrl || parsed.watchUrl || parsed.path || "").trim();
    return src ? { videoFileUrl: src } : null;
  }
  if (parsed.host === "youtube" || parsed.host === "rutube") {
    return parsed.watchUrl ? { videoUrl: parsed.watchUrl } : null;
  }
  return null;
}

function isDirectVideoFile(url: string) {
  return /\.(mp4|m4v|webm|mov)(\?|#|$)/i.test(url);
}

function youtubeId(value: string | null | undefined) {
  const safe = (value ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 11);
  return safe.length === 11 ? safe : null;
}

function youtubeParsed(raw: string, id: string): ParsedPropertyVideo {
  return {
    host: "youtube",
    raw,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
    youtubeId: id,
  };
}

/** Обычный youtube.com/embed — nocookie даёт ошибку 153 в iframe. */
export function youtubeEmbedSrc(id: string, options?: { autoplay?: boolean; origin?: string }) {
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });
  if (options?.autoplay) {
    params.set("autoplay", "1");
    params.set("mute", "1");
  }
  if (options?.origin) params.set("origin", options.origin);
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

/** Куда ролик реально уйдёт: сайт всегда, площадки — по их правилам. */
export function videoFeedCoverage(videoUrl: string | null | undefined): {
  site: boolean;
  cian: boolean;
  avito: boolean;
  yandex: boolean;
} {
  const parsed = parsePropertyVideoValue(videoUrl);
  if (!parsed) return { site: false, cian: false, avito: false, yandex: false };
  return {
    site: true,
    cian: Boolean(cianFeedVideoUrl(videoUrl)),
    yandex: Boolean(yandexFeedVideoReview(videoUrl)),
    avito: parsed.host === "youtube" || parsed.host === "rutube" || parsed.host === "file",
  };
}
