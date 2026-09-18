/**
 * Опрос входящих сообщений клиентских ботов Telegram и MAX.
 * Нужен на Бегете: внешние вебхуки часто не достучаться до сервера.
 */

import { setPlatformSecret, getPlatformSecret } from "@/lib/platform-secrets.server";

const TG_OFFSET_KEY = "TELEGRAM_CHAT_UPDATES_OFFSET";
const MAX_MARKER_KEY = "MAX_UPDATES_MARKER";

export async function pollTelegramChatUpdates(): Promise<{ updates: number }> {
  const { getTelegramChatBotToken, telegramChatCall, handleTelegramChatUpdate } =
    await import("@/lib/messengers/telegram-chat.server");
  const token = await getTelegramChatBotToken();
  if (!token) return { updates: 0 };

  const offsetRaw = (await getPlatformSecret(TG_OFFSET_KEY)).trim();
  const offset = Number(offsetRaw) || 0;

  // Короткий timeout: cron дергает часто; длинный держит воркер.
  const result = await telegramChatCall<
    { update_id: number; message?: unknown; edited_message?: unknown }[]
  >("getUpdates", {
    timeout: 0,
    offset: offset > 0 ? offset : undefined,
    allowed_updates: ["message", "edited_message"],
    limit: 50,
  });

  let nextOffset = offset;
  let count = 0;
  for (const update of result ?? []) {
    if (typeof update.update_id !== "number") continue;
    nextOffset = Math.max(nextOffset, update.update_id + 1);
    try {
      await handleTelegramChatUpdate(update as never);
      count += 1;
    } catch (e) {
      console.error("telegram chat poll item failed", e);
    }
  }
  if (nextOffset !== offset && nextOffset > 0) {
    await setPlatformSecret(TG_OFFSET_KEY, String(nextOffset));
  }
  return { updates: count };
}

export async function pollMaxUpdates(): Promise<{ updates: number }> {
  const { getMaxBotToken, maxCall, handleMaxUpdate } = await import("@/lib/messengers/max.server");
  const token = await getMaxBotToken();
  if (!token) return { updates: 0 };

  const markerRaw = (await getPlatformSecret(MAX_MARKER_KEY)).trim();
  const marker = markerRaw ? Number(markerRaw) : undefined;
  const qs = new URLSearchParams({
    limit: "50",
    timeout: "0",
    types: "message_created,bot_started",
  });
  if (Number.isFinite(marker)) qs.set("marker", String(marker));

  const result = await maxCall<{
    updates?: Record<string, unknown>[];
    marker?: number;
  }>("GET", `/updates?${qs.toString()}`);

  let count = 0;
  for (const update of result.updates ?? []) {
    try {
      await handleMaxUpdate(update as never);
      count += 1;
    } catch (e) {
      console.error("max poll item failed", e);
    }
  }
  if (typeof result.marker === "number") {
    await setPlatformSecret(MAX_MARKER_KEY, String(result.marker));
  }
  return { updates: count };
}

export async function pollMessengerInboxes(): Promise<{
  telegram: number;
  max: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let telegram = 0;
  let max = 0;
  try {
    telegram = (await pollTelegramChatUpdates()).updates;
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Telegram");
  }
  try {
    max = (await pollMaxUpdates()).updates;
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "MAX");
  }
  return { telegram, max, errors };
}
