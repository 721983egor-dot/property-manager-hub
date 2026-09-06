import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

const leadSchema = z.object({
  name: z.string().trim().min(2, "Укажите имя").max(120),
  phone: z.string().trim().min(5, "Укажите телефон").max(32),
  topic: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
  source: z.string().trim().max(60).optional().default("site"),
});

/** Публичная отправка заявки с сайта (anon insert по политике). */
export const submitLead = createServerFn({ method: "POST" })
  .inputValidator((data) => leadSchema.parse(data))
  .handler(async ({ data }) => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const supabasePublic = createClient<Database>(
      process.env["SUPABASE_URL"]!,
      key,
      {
        auth: { persistSession: false },
        global: {
          fetch: (input, init) => {
            const h = new Headers(init?.headers);
            if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
              h.delete("Authorization");
            }
            h.set("apikey", key);
            return fetch(input, { ...init, headers: h });
          },
        },
      },
    );

    const { error } = await supabasePublic.from("leads").insert({
      name: data.name,
      phone: data.phone,
      topic: data.topic,
      message: data.message,
      source: data.source,
    });
    if (error) throw new Error("Не удалось отправить заявку");
    return { ok: true as const };
  });
