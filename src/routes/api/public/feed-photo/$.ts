import { createFileRoute } from "@tanstack/react-router";

/**
 * Отдаёт фото объекта из приватного хранилища по постоянному адресу.
 * Нужен для XML-фида ЦИАН: подписанные ссылки живут недолго, а площадка
 * скачивает фото в произвольный момент. Раздаём только файлы из бакета
 * property-photos, без доступа к другим данным.
 */

const BUCKET = "property-photos";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export const Route = createFileRoute("/api/public/feed-photo/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
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

        return new Response(data, {
          headers: {
            "Content-Type": contentType,
            // Фото можно кэшировать сутки: при замене фото меняется и путь.
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
