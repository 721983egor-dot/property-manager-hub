/**
 * Клиентский бот MAX для раздела «Чаты» RM OS.
 * Документация: https://dev.max.ru/docs-api
 */

import { getPlatformSecret, setPlatformSecret } from "@/lib/platform-secrets.server";
import {
  appendInboundMessengerMessage,
  claimMessengerUpdate,
  releaseMessengerUpdate,
  upsertMessengerThread,
} from "@/lib/messengers/inbox.server";

const MAX_API_URL = "https://platform-api2.max.ru";
const TOKEN_SECRET = "MAX_BOT_TOKEN";
const WEBHOOK_SECRET_NAME = "MAX_WEBHOOK_SECRET";

export async function getMaxBotToken(): Promise<string> {
  return (await getPlatformSecret(TOKEN_SECRET)).trim();
}

export async function getMaxWebhookSecret(): Promise<string> {
  let secret = (await getPlatformSecret(WEBHOOK_SECRET_NAME)).trim();
  if (secret.length >= 8) return secret;
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  await setPlatformSecret(WEBHOOK_SECRET_NAME, secret);
  return secret;
}

async function maxFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getMaxBotToken();
  if (!token) {
    throw new Error("MAX не подключён: сохраните токен бота в Настройки → Мессенджеры.");
  }
  const url = path.startsWith("http") ? path : `${MAX_API_URL}${path}`;
  const headers = new Headers({
    Authorization: token,
    "Content-Type": "application/json",
  });
  if (init?.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((value, key) => headers.set(key, value));
  }
  const requestInit: RequestInit = { headers };
  if (init?.method) requestInit.method = init.method;
  if (init?.body != null) requestInit.body = init.body;
  return fetch(url, requestInit);
}

export async function maxCall<T = unknown>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await maxFetch(path, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MAX ${method} ${path} failed [${response.status}]: ${text.slice(0, 400)}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function getMaxBotMe(): Promise<{
  user_id?: number;
  name?: string;
  username?: string;
  first_name?: string;
}> {
  return maxCall("GET", "/me");
}

export async function sendMaxMessage(userId: string | number, text: string): Promise<string> {
  const result = await maxCall<{ message?: { body?: { mid?: string } } }>(
    "POST",
    `/messages?user_id=${encodeURIComponent(String(userId))}`,
    { text: text.slice(0, 4000) },
  );
  return String(result.message?.body?.mid ?? `${Date.now()}`);
}

/** Снять webhook-подписки — иначе long poll /updates не работает. */
export async function clearMaxSubscriptions(): Promise<void> {
  try {
    const list = await maxCall<{ subscriptions?: { url?: string }[] }>("GET", "/subscriptions");
    for (const sub of list.subscriptions ?? []) {
      if (!sub.url) continue;
      try {
        await maxCall("DELETE", `/subscriptions?url=${encodeURIComponent(sub.url)}`);
      } catch {
        /* ignore single delete */
      }
    }
  } catch {
    /* нет подписок — ок */
  }
}

export async function registerMaxWebhook(url: string): Promise<void> {
  const secret = await getMaxWebhookSecret();
  await clearMaxSubscriptions();
  await maxCall("POST", "/subscriptions", {
    url,
    update_types: ["message_created", "bot_started"],
    secret,
  });
}

export type MaxUpdate = {
  update_type?: string;
  timestamp?: number;
  message?: {
    sender?: {
      user_id?: number;
      first_name?: string;
      last_name?: string;
      name?: string;
      username?: string;
      is_bot?: boolean;
    };
    recipient?: { chat_id?: number; chat_type?: string; user_id?: number };
    timestamp?: number;
    body?: { mid?: string; text?: string };
  };
};

function maxDisplayName(
  sender: MaxUpdate["message"] extends infer M
    ? M extends { sender?: infer S }
      ? S
      : never
    : never,
): string {
  if (!sender) return "";
  const name =
    String(sender.name ?? "").trim() ||
    [sender.first_name, sender.last_name].filter(Boolean).join(" ").trim();
  return name || (sender.username ? `@${sender.username}` : "");
}

/** Входящий апдейт MAX → диалог в «Чаты». */
export async function handleMaxUpdate(update: MaxUpdate): Promise<void> {
  const updateType = String(update.update_type ?? "");
  if (updateType === "bot_started") {
    const userId = update.message?.sender?.user_id;
    if (userId) {
      try {
        await sendMaxMessage(
          userId,
          "Здравствуйте! Напишите ваш вопрос — менеджер Резиденция&Море ответит здесь.",
        );
      } catch {
        /* ignore */
      }
    }
    return;
  }

  if (updateType !== "message_created") return;
  const msg = update.message;
  if (!msg?.sender || msg.sender.is_bot) return;

  const userId = msg.sender.user_id;
  if (!userId) return;

  const text = String(msg.body?.text ?? "").trim();
  if (!text) return;

  const mid = String(msg.body?.mid ?? "").trim() || `${userId}:${msg.timestamp ?? Date.now()}`;
  const claimed = await claimMessengerUpdate("max", mid);
  if (!claimed) return;

  try {
    const threadId = await upsertMessengerThread({
      source: "max",
      externalId: String(userId),
      name: maxDisplayName(msg.sender),
      ...(msg.sender.username ? { username: msg.sender.username } : {}),
    });

    const createdAt = msg.timestamp
      ? new Date(msg.timestamp).toISOString()
      : new Date().toISOString();

    await appendInboundMessengerMessage({
      threadId,
      externalId: mid,
      body: text,
      createdAt,
    });
  } catch (e) {
    await releaseMessengerUpdate("max", mid);
    throw e;
  }
}
