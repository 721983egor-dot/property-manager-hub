import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function osBaseUrl() {
  return (process.env["RM_OS_URL"] || "https://rm-os.residence-more.ru").replace(/\/$/, "");
}

export type MessengerStatus = {
  telegram: {
    configured: boolean;
    connected: boolean;
    botName: string;
    botUsername: string;
    clientLink: string;
    error: string;
  };
  max: {
    configured: boolean;
    connected: boolean;
    botName: string;
    botUsername: string;
    clientLink: string;
    webhookUrl: string;
    error: string;
  };
};

/** Статус клиентских ботов Telegram и MAX. */
export const getMessengerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<MessengerStatus> => {
    const { getTelegramChatBotToken, telegramChatCall } = await import(
      "@/lib/messengers/telegram-chat.server"
    );
    const { getMaxBotToken, getMaxBotMe } = await import("@/lib/messengers/max.server");

    const telegramToken = await getTelegramChatBotToken();
    const maxToken = await getMaxBotToken();

    const result: MessengerStatus = {
      telegram: {
        configured: Boolean(telegramToken),
        connected: false,
        botName: "",
        botUsername: "",
        clientLink: "",
        error: telegramToken ? "" : "Токен не сохранён",
      },
      max: {
        configured: Boolean(maxToken),
        connected: false,
        botName: "",
        botUsername: "",
        clientLink: "",
        webhookUrl: `${osBaseUrl()}/api/public/max/webhook`,
        error: maxToken ? "" : "Токен не сохранён",
      },
    };

    if (telegramToken) {
      try {
        const me = await telegramChatCall<{ username?: string; first_name?: string }>("getMe", {});
        const username = me.username ? String(me.username) : "";
        result.telegram.connected = true;
        result.telegram.botUsername = username;
        result.telegram.botName = username ? `@${username}` : (me.first_name ?? "бот");
        result.telegram.clientLink = username ? `https://t.me/${username}` : "";
        result.telegram.error = "";
      } catch (e) {
        result.telegram.error = e instanceof Error ? e.message : "Бот не отвечает";
      }
    }

    if (maxToken) {
      try {
        const me = await getMaxBotMe();
        const username = String(me.username ?? "").replace(/^@/, "");
        result.max.connected = true;
        result.max.botUsername = username;
        result.max.botName = username
          ? `@${username}`
          : String(me.name ?? me.first_name ?? "бот MAX");
        result.max.clientLink = username ? `https://max.ru/${username}` : "";
        result.max.error = "";
      } catch (e) {
        result.max.error = e instanceof Error ? e.message : "Бот не отвечает";
      }
    }

    return result;
  });

/** Сохранить токен клиентского Telegram-бота. */
export const saveTelegramChatBotToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) =>
    z
      .object({
        token: z
          .string()
          .trim()
          .min(20, "Токен слишком короткий")
          .refine((v) => v.includes(":"), "Токен Telegram должен содержать «:»"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { setPlatformSecret } = await import("@/lib/platform-secrets.server");
    await setPlatformSecret("TELEGRAM_CHAT_BOT_TOKEN", data.token);
    // Проверим, что бот отвечает.
    const { telegramChatCall } = await import("@/lib/messengers/telegram-chat.server");
    const me = await telegramChatCall<{ username?: string; first_name?: string }>("getMe", {});
    // Снимаем webhook — на Бегете апдейты забирает poller.
    try {
      await telegramChatCall("deleteWebhook", { drop_pending_updates: false });
    } catch {
      /* ok */
    }
    return {
      ok: true as const,
      botName: me.username ? `@${me.username}` : (me.first_name ?? "бот"),
    };
  });

/** Сохранить токен бота MAX и включить приём сообщений. */
export const saveMaxBotToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) =>
    z.object({ token: z.string().trim().min(16, "Токен слишком короткий") }).parse(input),
  )
  .handler(async ({ data }) => {
    const { setPlatformSecret } = await import("@/lib/platform-secrets.server");
    await setPlatformSecret("MAX_BOT_TOKEN", data.token);
    const { getMaxBotMe, clearMaxSubscriptions } = await import("@/lib/messengers/max.server");
    const me = await getMaxBotMe();
    // На Бегете входящий HTTPS часто недоступен — сообщения забираем опросом.
    try {
      await clearMaxSubscriptions();
    } catch {
      /* ok */
    }
    return {
      ok: true as const,
      botName: String(me.username ? `@${me.username}` : me.name ?? "бот MAX"),
      webhookUrl: `${osBaseUrl()}/api/public/max/webhook`,
    };
  });

/** Включить webhook MAX (если сервер принимает входящий HTTPS). */
export const registerMaxChatWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { registerMaxWebhook } = await import("@/lib/messengers/max.server");
    const webhookUrl = `${osBaseUrl()}/api/public/max/webhook`;
    await registerMaxWebhook(webhookUrl);
    return { ok: true as const, url: webhookUrl };
  });
