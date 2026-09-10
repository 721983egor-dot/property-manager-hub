/** Вызовы Telegram Bot API через шлюз коннекторов Lovable. Только сервер. */

import { loadTelegramRuntimeCredentials } from "@/lib/telegram/runtime-credentials.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

async function keys() {
  const credentials = await loadTelegramRuntimeCredentials();
  if (!credentials) throw new Error("Telegram credentials are not configured");
  return {
    lovable: credentials.lovableApiKey,
    telegram: credentials.telegramApiKey,
  };
}

export async function telegramCall<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { lovable, telegram } = await keys();
  const response = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": telegram,
      "Content-Type": "application/json",
    },
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

export type InlineKeyboard = { text: string; callback_data: string }[][];

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

/** Скачивает файл Telegram (голосовое сообщение и т.п.) через шлюз. */
export async function downloadFile(fileId: string): Promise<{ bytes: ArrayBuffer; path: string }> {
  const { lovable, telegram } = await keys();
  const file = await telegramCall<{ file_path: string }>("getFile", { file_id: fileId });
  const response = await fetch(`${GATEWAY_URL}/file/${file.file_path}`, {
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": telegram,
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Не удалось скачать файл [${response.status}]: ${body}`);
  }
  return { bytes: await response.arrayBuffer(), path: file.file_path };
}

/** Секрет заголовка вебхука, выведенный из ключа подключения. */
export async function webhookSecret(): Promise<string> {
  const { telegram } = await keys();
  const data = new TextEncoder().encode(`telegram-webhook:${telegram}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
