import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Запасной путь загрузки фото и видео объекта: браузер отправляет файл
 * на наш адрес, сервер кладёт его в хранилище.
 */

const BUCKET = "property-photos";
const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
const VIDEO_MAX_BYTES = 80 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
};

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const VIDEO_EXT = new Set(["mp4", "mov", "webm", "m4v"]);

export const Route = createFileRoute("/api/photo-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token || token.split(".").length !== 3) {
          return Response.json({ error: "Требуется вход в систему" }, { status: 401 });
        }

        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key) {
          return Response.json({ error: "Хранилище не настроено" }, { status: 500 });
        }

        const auth = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userError } = await auth.auth.getUser(token);
        if (userError || !userData?.user) {
          return Response.json({ error: "Требуется вход в систему" }, { status: 401 });
        }

        let file: File | null = null;
        let wantPhotoWatermark = false;
        try {
          const form = await request.formData();
          const value = form.get("file");
          if (value instanceof File) file = value;
          wantPhotoWatermark = String(form.get("watermark") ?? "") === "1";
        } catch {
          file = null;
        }
        if (!file) return Response.json({ error: "Файл не получен" }, { status: 400 });

        const contentType = file.type || "image/jpeg";
        const ext =
          EXT_BY_TYPE[contentType] ?? (file.name.split(".").pop() || "jpg").toLowerCase();
        const isVideo = VIDEO_EXT.has(ext);
        if (!IMAGE_EXT.has(ext) && !isVideo) {
          return Response.json({ error: "Неподдерживаемый формат" }, { status: 400 });
        }
        const maxBytes = isVideo ? VIDEO_MAX_BYTES : PHOTO_MAX_BYTES;
        if (file.size > maxBytes) {
          return Response.json(
            { error: isVideo ? "Файл больше 80 МБ" : "Файл больше 25 МБ" },
            { status: 413 },
          );
        }

        let body: ArrayBuffer | Buffer = await file.arrayBuffer();
        let outType = contentType;
        let outExt = ext;
        let watermarked = false;
        if (isVideo) {
          try {
            const { watermarkVideoBytes } = await import("@/lib/video-watermark.server");
            const marked = await watermarkVideoBytes(body);
            body = marked.bytes;
            outType = marked.contentType;
            outExt = "mp4";
            watermarked = true;
          } catch (error) {
            console.error("video watermark skipped", error);
          }
        } else if (wantPhotoWatermark) {
          try {
            const { overlayPhotoWatermark } = await import("@/lib/photo-watermark.server");
            const marked = await overlayPhotoWatermark(Buffer.from(body));
            body = marked.bytes;
            outType = marked.contentType;
            outExt = "jpg";
            watermarked = true;
          } catch (error) {
            console.error("photo watermark skipped", error);
          }
        }

        const path = `uploads/${crypto.randomUUID()}${watermarked ? "-logo" : ""}.${outExt}`;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, body, {
          cacheControl: "3600",
          upsert: false,
          contentType: outType,
        });
        if (error) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        return Response.json({ path });
      },
    },
  },
});
