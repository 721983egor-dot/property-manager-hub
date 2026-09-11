/**
 * Ключи доступа к площадкам (ЦИАН, Яндекс и т. д.).
 *
 * Сначала берём значение из переменных окружения сервера, а если его там нет —
 * из таблицы `platform_secrets` в базе. Так ключ переживает переезд на другой
 * сервер: он хранится в базе, а не только в файле окружения.
 */

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: string; at: number }>();

export async function getPlatformSecret(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const fromEnv = process.env[name]?.trim() ?? "";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("platform_secrets")
      .select("value")
      .eq("name", name)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const value = ((data as { value?: string } | null)?.value ?? "").trim() || fromEnv;
    cache.set(name, { value, at: Date.now() });
    return value;
  } catch (error) {
    console.error(`Не удалось прочитать ключ площадки ${name}:`, error);
    if (fromEnv) return fromEnv;
    throw new Error("Хранилище ключей на этом сервере не готово. Сначала обновите систему.");
  }
}

export async function setPlatformSecret(name: string, value: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("platform_secrets")
    .upsert({ name, value: value.trim(), updated_at: new Date().toISOString() }, { onConflict: "name" });
  if (error) throw new Error(error.message);
  cache.set(name, { value: value.trim(), at: Date.now() });
}
