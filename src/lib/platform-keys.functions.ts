import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/lib/auth-user-middleware";

/** Ключи площадок, которые можно задать из интерфейса. */
const ALLOWED = ["CIAN_API_KEY", "YANDEX_REALTY_TOKEN"] as const;
export type PlatformKeyName = (typeof ALLOWED)[number];

export type PlatformKeyStatus = { name: PlatformKeyName; filled: boolean };

/** Какие ключи площадок уже заданы (сами значения наружу не отдаём). */
export const getPlatformKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async (): Promise<PlatformKeyStatus[]> => {
    const { getPlatformSecret } = await import("@/lib/platform-secrets.server");
    const result: PlatformKeyStatus[] = [];
    for (const name of ALLOWED) {
      result.push({ name, filled: Boolean(await getPlatformSecret(name)) });
    }
    return result;
  });

/** Сохраняет ключ доступа площадки в системе (переживает переезд сервера). */
export const savePlatformKey = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: { name: PlatformKeyName; value: string }) => {
    if (!input || !ALLOWED.includes(input.name)) throw new Error("Неизвестный ключ");
    const value = String(input.value ?? "").trim();
    if (value.length < 8) throw new Error("Ключ слишком короткий");
    return { name: input.name, value };
  })
  .handler(async ({ data }) => {
    const { setPlatformSecret } = await import("@/lib/platform-secrets.server");
    await setPlatformSecret(data.name, data.value);
    return { ok: true };
  });
