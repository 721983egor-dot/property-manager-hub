/** Вызовы Telegram Bot API напрямую (без шлюза Lovable). Только сервер. */

import dns from "node:dns";

// На Beget IPv6 до api.telegram.org часто ENETUNREACH → Node отдаёт fetch failed.
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  /* старые Node — игнор */
}

const TELEGRAM_API_URL = "https://api.telegram.org";

function botToken(): string {
  const token = (process.env["TELEGRAM_BOT_TOKEN"] ?? "").trim();
  if (!token.includes(":")) {
    throw new Error(
      "Telegram не настроен: задайте TELEGRAM_BOT_TOKEN на сервере Бегета (токен от @BotFather).",
    );
  }
  return token;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function errorDetail(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const c = cause as { code?: string; message?: string; errors?: { code?: string }[] };
    const nested = c.errors?.map((x) => x.code).filter(Boolean).join(",") || "";
    return [e.message, c.code, c.message, nested].filter(Boolean).join(" | ");
  }
  return e.message;
}

async function telegramFetch(url: string, init?: RequestInit, retries = 4): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastErr = e;
      console.error(`telegram fetch attempt ${attempt + 1}/${retries}:`, errorDetail(e));
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
    }
  }
  throw new Error(`Telegram недоступен: ${errorDetail(lastErr)}`);
}

export async function telegramCall<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = botToken();
  const response = await telegramFetch(`${TELEGRAM_API_URL}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`Telegram ${method} failed [${response.status}]: ${text}`);
    throw new Error(`Telegram ${method} failed [${response.status}]: ${text}`);
  }
  const json = JSON.parse(text) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) {
    console.error(`Telegram ${method} error: ${json.description ?? text}`);
    throw new Error(`Telegram ${method} error: ${json.description ?? text}`);
  }
  return json.result as T;
}

export type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};
export type InlineKeyboard = InlineKeyboardButton[][];

export async function sendMessage(
  chatId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<{ message_id: number }> {
  return telegramCall<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: false,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export async function editMessageText(chatId: number, messageId: number, text: string) {
  try {
    await telegramCall("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
    });
  } catch (e) {
    console.error("editMessageText failed", e);
  }
}

export async function answerCallbackQuery(id: string, text = "") {
  try {
    await telegramCall("answerCallbackQuery", { callback_query_id: id, text });
  } catch (e) {
    console.error("answerCallbackQuery failed", e);
  }
}

export async function sendChatAction(chatId: number, action = "typing") {
  try {
    await telegramCall("sendChatAction", { chat_id: chatId, action });
  } catch {
    /* некритично */
  }
}

/** Скачивает файл Telegram (голосовое сообщение и т.п.) с ретраями. */
export async function downloadFile(fileId: string): Promise<{ bytes: ArrayBuffer; path: string }> {
  const token = botToken();
  const file = await telegramCall<{ file_path: string }>("getFile", { file_id: fileId });
  const response = await telegramFetch(`${TELEGRAM_API_URL}/file/bot${token}/${file.file_path}`);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Не удалось скачать файл [${response.status}]: ${body}`);
  }
  return { bytes: await response.arrayBuffer(), path: file.file_path };
}

/** Секрет заголовка вебхука. */
export async function webhookSecret(): Promise<string> {
  const token = botToken();
  const seed = `telegram-webhook:${token}`;
  const data = new TextEncoder().encode(seed);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
