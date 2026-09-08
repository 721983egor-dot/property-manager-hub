import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TelegramAccount = {
  id: string;
  telegram_user_id: number;
  display_name: string;
  username: string;
  active: boolean;
  last_seen_at: string | null;
  created_at: string;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

/** Статус подключения бота и список привязанных аккаунтов. */
export const getTelegramStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{
    connected: boolean;
    botName: string;
    webhookUrl: string;
    error: string;
    accounts: TelegramAccount[];
  }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("telegram_accounts")
      .select("id, telegram_user_id, display_name, username, active, last_seen_at, created_at")
      .order("created_at", { ascending: false });
    const accounts = (data ?? []) as TelegramAccount[];

    try {
      const { telegramCall } = await import("@/lib/telegram/api.server");
      const me = await telegramCall<{ username?: string; first_name?: string }>("getMe", {});
      const info = await telegramCall<{ url?: string; last_error_message?: string }>(
        "getWebhookInfo",
        {},
      );
      return {
        connected: true,
        botName: me.username ? `@${me.username}` : (me.first_name ?? "бот"),
        webhookUrl: info.url ?? "",
        error: info.last_error_message ?? "",
        accounts,
      };
    } catch (e) {
      return {
        connected: false,
        botName: "",
        webhookUrl: "",
        error: e instanceof Error ? e.message : "Бот не подключён",
        accounts,
      };
    }
  });

/** Одноразовый код привязки Telegram-аккаунта (действует 30 минут). */
export const createTelegramLinkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ code: string; expiresAt: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = newCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const email = (context.claims as { email?: string } | undefined)?.email ?? "";
    const { error } = await supabaseAdmin.from("telegram_link_codes").insert({
      code,
      user_id: context.userId,
      created_by_email: email,
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);
    return { code, expiresAt };
  });

/** Отвязать Telegram-аккаунт. */
export const unlinkTelegramAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("telegram_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Зарегистрировать адрес вебхука в Telegram. */
export const registerTelegramWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as { baseUrl: string })
  .handler(async ({ data }): Promise<{ ok: boolean; url: string }> => {
    const { telegramCall, webhookSecret } = await import("@/lib/telegram/api.server");
    const base = data.baseUrl.replace(/\/+$/, "");
    const url = `${base}/api/public/telegram/webhook`;
    await telegramCall("setWebhook", {
      url,
      secret_token: await webhookSecret(),
      allowed_updates: ["message", "edited_message", "callback_query"],
    });
    return { ok: true, url };
  });
