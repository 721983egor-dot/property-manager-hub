import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Запасной путь загрузки фото: браузер отправляет файл на наш же адрес,
 * а сервер кладёт его в хранилище. Нужен, когда прямой запрос в хранилище
 * не проходит (блокировщики, прокси, нестабильная сеть) и падает с «Failed to fetch».
 */

const BUCKET = "property-photos";
const MAX_BYTES = 25 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

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
        try {
          const form = await request.formData();
          const value = form.get("file");
          if (value instanceof File) file = value;
        } catch {
          file = null;
        }
        if (!file) return Response.json({ error: "Файл не получен" }, { status: 400 });
        if (file.size > MAX_BYTES) {
          return Response.json({ error: "Файл больше 25 МБ" }, { status: 413 });
        }

        const contentType = file.type || "image/jpeg";
        const ext =
          EXT_BY_TYPE[contentType] ?? (file.name.split(".").pop() || "jpg").toLowerCase();
        if (!Object.values(EXT_BY_TYPE).includes(ext)) {
          return Response.json({ error: "Неподдерживаемый формат" }, { status: 400 });
        }

        const path = `uploads/${crypto.randomUUID()}.${ext}`;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(path, await file.arrayBuffer(), {
            cacheControl: "3600",
            upsert: false,
            contentType,
          });
        if (error) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        return Response.json({ path });
      },
    },
  },
});
