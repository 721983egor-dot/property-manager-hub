/**
 * Клиентский Telegram-бот для раздела «Чаты» RM OS.
 * Отдельный токен TELEGRAM_CHAT_BOT_TOKEN — не путать с ботом Ассистента.
 */

import dns from "node:dns";
import { getPlatformSecret } from "@/lib/platform-secrets.server";
import {
  appendInboundMessengerMessage,
  claimMessengerUpdate,
  releaseMessengerUpdate,
  upsertMessengerThread,
} from "@/lib/messengers/inbox.server";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  /* ignore */
}

const TELEGRAM_API_URL = "https://api.telegram.org";
const TOKEN_SECRET = "TELEGRAM_CHAT_BOT_TOKEN";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function errorDetail(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const c = cause as { code?: string; message?: string };
    return [e.message, c.code, c.message].filter(Boolean).join(" | ");
  }
  return e.message;
}

export async function getTelegramChatBotToken(): Promise<string> {
  const token = (await getPlatformSecret(TOKEN_SECRET)).trim();
  if (!token.includes(":")) return "";
  return token;
}

export async function telegramChatWebhookSecret(): Promise<string> {
  const token = await getTelegramChatBotToken();
  if (!token) return "";
  const seed = `telegram-chat-webhook:${token}`;
  const data = new TextEncoder().encode(seed);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function telegramFetch(url: string, init?: RequestInit, retries = 4): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastErr = e;
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
    }
  }
  throw new Error(`Telegram недоступен: ${errorDetail(lastErr)}`);
}

export async function telegramChatCall<T = unknown>(
  method: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const token = await getTelegramChatBotToken();
  if (!token) {
    throw new Error(
      "Telegram для чатов не подключён: сохраните токен бота в Настройки → Мессенджеры.",
    );
  }
  const response = await telegramFetch(`${TELEGRAM_API_URL}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Telegram ${method} failed [${response.status}]: ${text}`);
  }
  const json = JSON.parse(text) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) {
    throw new Error(`Telegram ${method} error: ${json.description ?? text}`);
  }
  return json.result as T;
}

export async function sendTelegramChatMessage(
  chatId: string | number,
  text: string,
): Promise<string> {
  const result = await telegramChatCall<{ message_id: number }>("sendMessage", {
    chat_id: Number(chatId),
    text: text.slice(0, 4000),
    disable_web_page_preview: true,
  });
  return String(result.message_id);
}

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TgMessage = {
  message_id: number;
  chat: { id: number; type?: string };
  from?: TgUser;
  text?: string;
  caption?: string;
  date?: number;
};
export type TelegramChatUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
};

function displayName(from?: TgUser): string {
  if (!from) return "";
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  return name || (from.username ? `@${from.username}` : "");
}

/** Обработка апдейта клиентского бота → диалог в «Чаты». */
export async function handleTelegramChatUpdate(update: TelegramChatUpdate): Promise<void> {
  if (typeof update.update_id !== "number") return;
  const claimed = await claimMessengerUpdate("telegram", String(update.update_id));
  if (!claimed) return;

  try {
    const msg = update.message ?? update.edited_message;
    if (!msg?.from || msg.from.id <= 0) return;
    // Группы пока не берём — только личные диалоги с ботом.
    if (msg.chat.type && msg.chat.type !== "private") return;

    const text = String(msg.text ?? msg.caption ?? "").trim();
    if (!text) return;

    if (text === "/start" || text.startsWith("/start ")) {
      try {
        await sendTelegramChatMessage(
          msg.chat.id,
          "Здравствуйте! Напишите ваш вопрос — менеджер Резиденция&Море ответит здесь.",
        );
      } catch {
        /* ignore welcome failure */
      }
      // /start без текста вопроса не создаём как переписку, если только команда
      if (text === "/start" || /^\/start\s*$/.test(text)) return;
    }

    const threadId = await upsertMessengerThread({
      source: "telegram",
      externalId: String(msg.chat.id),
      name: displayName(msg.from),
      ...(msg.from.username ? { username: msg.from.username } : {}),
    });

    const createdAt = msg.date
      ? new Date(msg.date * 1000).toISOString()
      : new Date().toISOString();

    await appendInboundMessengerMessage({
      threadId,
      externalId: String(msg.message_id),
      body: text,
      createdAt,
    });
  } catch (e) {
    await releaseMessengerUpdate("telegram", String(update.update_id));
    throw e;
  }
}
