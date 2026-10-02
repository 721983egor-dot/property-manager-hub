import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  listN11VisitorMessages,
  n11ChatBodySchema,
  n11ChatCorsHeaders,
  n11ChatJson,
  n11VisitorKeySchema,
  sendN11VisitorMessage,
} from "@/lib/n11-chat.server";

/**
 * Публичный API чата сайта H11 Резиденция → раздел «Чаты» RM OS.
 * Заменяет Bitrix24 на старой Tilda. CORS только для домена отеля и localhost.
 */
export const Route = createFileRoute("/api/public/n11-chat")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: n11ChatCorsHeaders(request),
        }),

      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const visitorKey = n11VisitorKeySchema.parse(url.searchParams.get("visitorKey") ?? "");
          const messages = await listN11VisitorMessages(visitorKey);
          return n11ChatJson(request, { ok: true, messages });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Ошибка";
          return n11ChatJson(request, { ok: false, error: message }, 400);
        }
      },

      POST: async ({ request }) => {
        try {
          const raw = (await request.json()) as unknown;
          const data = z
            .object({
              visitorKey: n11VisitorKeySchema,
              body: n11ChatBodySchema,
              page: z.string().trim().max(300).optional().default(""),
              name: z.string().trim().max(120).optional().default(""),
              phone: z.string().trim().max(32).optional().default(""),
            })
            .parse(raw);

          const message = await sendN11VisitorMessage(data);
          return n11ChatJson(request, { ok: true, message });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Ошибка";
          const status = /слишком много/i.test(message) ? 429 : 400;
          return n11ChatJson(request, { ok: false, error: message }, status);
        }
      },
    },
  },
});
