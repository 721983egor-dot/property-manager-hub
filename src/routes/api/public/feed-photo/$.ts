import { createFileRoute } from "@tanstack/react-router";

/**
 * Отдаёт фото и видео объекта из приватного хранилища по постоянному адресу.
 * Нужен для XML-фида ЦИАН: подписанные ссылки живут недолго, а площадка
 * скачивает файлы в произвольный момент. Раздаём только файлы из бакета
 * property-photos, без доступа к другим данным.
 *
 * Видео отдаём с Accept-Ranges: Safari на iPhone иначе показывает чёрный
 * экран и перечёркнутую кнопку play.
 */

const BUCKET = "property-photos";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function mediaResponse(bytes: Uint8Array, contentType: string, rangeHeader: string | null) {
  const total = bytes.byteLength;
  const base: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400",
  };
  if (!VIDEO_TYPES.has(contentType)) {
    return new Response(bytes, { headers: base });
  }

  base["Accept-Ranges"] = "bytes";
  if (!rangeHeader) {
    return new Response(bytes, {
      headers: { ...base, "Content-Length": String(total) },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) {
    return new Response("Invalid range", { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  }
  const start = match[1] ? Number(match[1]) : 0;
  const requestedEnd = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd) || start >= total || start < 0 || requestedEnd < start) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }
  const end = Math.min(requestedEnd, total - 1);
  const slice = bytes.subarray(start, end + 1);
  return new Response(slice, {
    status: 206,
    headers: {
      ...base,
      "Content-Length": String(slice.byteLength),
      "Content-Range": `bytes ${start}-${end}/${total}`,
    },
  });
}

export const Route = createFileRoute("/api/public/feed-photo/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const path = String(params._splat ?? "");
        if (!path || path.includes("..") || path.startsWith("/") || path.length > 300) {
          return new Response("Not found", { status: 404 });
        }
        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        const contentType = CONTENT_TYPES[ext];
        if (!contentType) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
        if (error || !data) return new Response("Not found", { status: 404 });

        const bytes = new Uint8Array(await data.arrayBuffer());
        return mediaResponse(bytes, contentType, request.headers.get("range"));
      },
    },
  },
});
