import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { loadPublishedProperties } from "@/lib/public-catalog.functions";
import { propertySlug, slugifyName } from "@/lib/seo";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refIdFromKey(key: string): number | null {
  if (/^\d+$/.test(key)) return Number(key);
  const tail = key.match(/-(\d+)$/);
  if (!tail) return null;
  const n = Number(tail[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Публичная карточка объекта для сайта residence-more.ru.
 * Ищет по UUID, номеру объекта в конце slug или по транслиту названия.
 */
export const getPublicProperty = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ data: input }) => {
    const key = String(input.id ?? "").trim();
    if (!key || key.toLowerCase() === "jk") return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const published = () =>
      supabaseAdmin.from("properties").select("*").eq("published", true).neq("status", "archived");

    if (UUID_RE.test(key)) {
      const { data, error } = await published().eq("id", key).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }

    const refId = refIdFromKey(key);
    if (refId != null) {
      const { data, error } = await published().eq("ref_id", refId).maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return data;
    }

    const all = await loadPublishedProperties();
    const wanted = key.toLowerCase();
    return (
      all.find((p) => propertySlug(p) === wanted) ??
      all.find((p) => slugifyName(p.title) === wanted) ??
      null
    );
  });

export function publicPropertyQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["public-property", id],
    queryFn: async () => {
      const property = await getPublicProperty({ data: { id } });
      if (!property) throw new Error("Объект не найден");
      return property;
    },
  });
}
