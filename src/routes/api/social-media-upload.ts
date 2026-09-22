import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { VIDEO_UPLOAD_MAX_BYTES, type SocialMediaKind } from "@/lib/social-media";

export const Route = createFileRoute("/api/social-media-upload")({
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .eq("role", "social_owner")
          .limit(1);
        if (!roles?.length) {
          return Response.json({ error: "Раздел «Соцсети» доступен с ролью social_owner" }, { status: 403 });
        }

        let file: File | null = null;
        let kind: SocialMediaKind = "photo";
        let width: number | undefined;
        let height: number | undefined;
        let durationSec: number | undefined;
        try {
          const form = await request.formData();
          const value = form.get("file");
          if (value instanceof File) file = value;
          if (form.get("kind") === "video") kind = "video";
          const w = Number(form.get("width"));
          const h = Number(form.get("height"));
          const d = Number(form.get("durationSec"));
          if (Number.isFinite(w) && w > 0) width = w;
          if (Number.isFinite(h) && h > 0) height = h;
          if (Number.isFinite(d) && d > 0) durationSec = d;
        } catch {
          file = null;
        }
        if (!file) return Response.json({ error: "Файл не получен" }, { status: 400 });
        if (file.size > VIDEO_UPLOAD_MAX_BYTES) {
          return Response.json({ error: "Файл больше 80 МБ" }, { status: 413 });
        }

        try {
          const { storeSocialMediaFile } = await import("@/lib/social-media.server");
          const stored = await storeSocialMediaFile({ file, kind, width, height, durationSec });
          return Response.json(stored);
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Не удалось сохранить файл" },
            { status: 400 },
          );
        }
      },
    },
  },
});
