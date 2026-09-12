/**
 * Клиент API Авито (https://api.avito.ru). Только сервер:
 * client_id и client_secret берутся из хранилища ключей и не попадают в браузер.
 */

import { getPlatformSecret } from "@/lib/platform-secrets.server";

const BASE_URL = "https://api.avito.ru";

type TokenCache = { token: string; expiresAt: number; userId: number };
let cache: TokenCache | null = null;

async function credentials(): Promise<{ clientId: string; clientSecret: string }> {
  const clientId = (await getPlatformSecret("AVITO_CLIENT_ID")).trim();
  const clientSecret = (await getPlatformSecret("AVITO_CLIENT_SECRET")).trim();
  if (!clientId || !clientSecret) {
    throw new Error("Авито не подключён: не заданы Client ID и секрет. Сохраните их в настройках площадок.");
  }
  return { clientId, clientSecret };
}

async function access(): Promise<TokenCache> {
  if (cache && Date.now() < cache.expiresAt - 60_000) return cache;
  const { clientId, clientSecret } = await credentials();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetch(`${BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Авито не принял ключи (${response.status})`);
  }
  const payload = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("Авито не вернул ключ доступа");

  const me = await fetch(`${BASE_URL}/core/v1/accounts/self`, {
    headers: { Authorization: `Bearer ${payload.access_token}` },
  });
  const meText = await me.text();
  if (!me.ok) throw new Error(`Авито не открыл кабинет (${me.status})`);
  const account = JSON.parse(meText) as { id?: number };
  const userId = Number(account.id);
  if (!Number.isFinite(userId)) throw new Error("Авито не вернул номер кабинета");

  cache = {
    token: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in ?? 86_400) * 1000,
    userId,
  };
  return cache;
}

async function avitoFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const auth = await access();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Авито ответил ошибкой ${response.status}: ${text.slice(0, 240)}`);
  }
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Авито вернул неожиданный ответ");
  }
}

export type AvitoChat = {
  chatId: string;
  itemId: string | null;
  title: string;
  updatedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toIso(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  const text = String(value ?? "");
  if (!text) return new Date().toISOString();
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

/** Последние чаты кабинета. */
export async function fetchAvitoChats(limit = 50): Promise<AvitoChat[]> {
  const auth = await access();
  const payload = asRecord(
    await avitoFetch(`/messenger/v2/accounts/${auth.userId}/chats?limit=${limit}&offset=0`),
  );
  const chats = (payload.chats ?? asRecord(payload.result).chats ?? []) as unknown[];
  return chats
    .map((raw) => {
      const chat = asRecord(raw);
      const context = asRecord(chat.context);
      const value = asRecord(context.value);
      const chatId = String(chat.id ?? "");
      const itemId = value.id ?? chat.item_id ?? chat.itemId;
      return {
        chatId,
        itemId: itemId == null || itemId === "" ? null : String(itemId),
        title: String(value.title ?? value.url ?? "").slice(0, 200),
        updatedAt: toIso(chat.updated ?? chat.updated_at ?? chat.created),
      };
    })
    .filter((chat) => chat.chatId.length > 0);
}

export type AvitoMessage = {
  messageId: string;
  direction: "in" | "out";
  text: string;
  createdAt: string;
};

/** Последние сообщения чата. */
export async function fetchAvitoMessages(chatId: string, limit = 50): Promise<AvitoMessage[]> {
  const auth = await access();
  const payload = asRecord(
    await avitoFetch(
      `/messenger/v3/accounts/${auth.userId}/chats/${encodeURIComponent(chatId)}/messages/?limit=${limit}`,
    ),
  );
  const messages = (payload.messages ?? asRecord(payload.result).messages ?? []) as unknown[];
  return messages
    .map((raw) => {
      const message = asRecord(raw);
      const content = asRecord(message.content);
      const authorId = Number(message.author_id ?? message.authorId);
      const explicit = String(message.direction ?? "");
      const direction: "in" | "out" =
        explicit === "out" || (Number.isFinite(authorId) && authorId === auth.userId) ? "out" : "in";
      return {
        messageId: String(message.id ?? ""),
        direction,
        text: String(content.text ?? message.text ?? ""),
        createdAt: toIso(message.created ?? message.created_at),
      };
    })
    .filter((message) => message.messageId.length > 0);
}

/** Ответ менеджера уходит клиенту в чат Авито. */
export async function sendAvitoMessage(chatId: string, text: string): Promise<string> {
  const auth = await access();
  const payload = asRecord(
    await avitoFetch(`/messenger/v1/accounts/${auth.userId}/chats/${encodeURIComponent(chatId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ type: "text", message: { text } }),
    }),
  );
  return String(payload.id ?? asRecord(payload.result).id ?? "");
}

export type AvitoDayStat = {
  date: string;
  impressions: number;
  views: number;
  contact_views: number;
  calls: number;
  messages: number;
  favorites: number;
};

/** Статистика объявлений по дням. itemIds — номера объявлений Авито. */
export async function fetchAvitoStats(itemIds: number[], from: string, to: string): Promise<Map<number, AvitoDayStat[]>> {
  const auth = await access();
  const result = new Map<number, AvitoDayStat[]>();
  for (let i = 0; i < itemIds.length; i += 100) {
    const chunk = itemIds.slice(i, i + 100);
    const payload = asRecord(
      await avitoFetch(`/stats/v1/accounts/${auth.userId}/items`, {
        method: "POST",
        body: JSON.stringify({
          dateFrom: from,
          dateTo: to,
          itemIds: chunk,
          periodGrouping: "day",
          fields: ["uniqViews", "uniqContacts", "uniqFavorites"],
        }),
      }),
    );
    const items = (asRecord(payload.result).items ?? []) as unknown[];
    for (const raw of items) {
      const item = asRecord(raw);
      const itemId = Number(item.itemId);
      if (!Number.isFinite(itemId)) continue;
      const days = ((item.stats ?? []) as unknown[]).map((dayRaw) => {
        const day = asRecord(dayRaw);
        const views = Number(day.uniqViews ?? 0);
        const contacts = Number(day.uniqContacts ?? 0);
        const favorites = Number(day.uniqFavorites ?? 0);
        return {
          date: String(day.date ?? "").slice(0, 10),
          impressions: Number.isFinite(views) ? views : 0,
          views: Number.isFinite(views) ? views : 0,
          contact_views: Number.isFinite(contacts) ? contacts : 0,
          calls: 0,
          messages: 0,
          favorites: Number.isFinite(favorites) ? favorites : 0,
        };
      }).filter((day) => day.date.length === 10);
      result.set(itemId, days);
    }
  }
  return result;
}

export type AvitoItem = {
  id: string;
  title: string;
  address: string;
  price: number | null;
  url: string;
};

/** Активные объявления кабинета. Нужны для ручной привязки к объектам RM OS. */
export async function fetchAvitoItems(): Promise<AvitoItem[]> {
  const items: AvitoItem[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = asRecord(await avitoFetch(`/core/v1/items?status=active&per_page=100&page=${page}`));
    const resources = (payload.resources ?? asRecord(payload.result).resources ?? []) as unknown[];
    if (resources.length === 0) break;
    for (const raw of resources) {
      const item = asRecord(raw);
      const id = String(item.id ?? "");
      if (!id) continue;
      const priceRaw = item.price;
      const price = typeof priceRaw === "number" ? priceRaw : Number(asRecord(priceRaw).value ?? priceRaw);
      items.push({
        id,
        title: String(item.title ?? ""),
        address: String(item.address ?? ""),
        price: Number.isFinite(price) ? price : null,
        url: String(item.url ?? ""),
      });
    }
    if (resources.length < 100) break;
  }
  return items;
}

/**
 * Соответствие «наш Id в фиде → номер объявления на Авито».
 * Нужно, чтобы после автозагрузки подтянуть AvitoId и не плодить дубли.
 */
export async function fetchAvitoIdsByAdIds(adIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const unique = [...new Set(adIds.map((id) => id.trim()).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const payload = asRecord(
      await avitoFetch(`/autoload/v2/items/avito_ids?query=${encodeURIComponent(chunk.join(","))}`),
    );
    const items = (payload.items ?? []) as unknown[];
    for (const raw of items) {
      const item = asRecord(raw);
      const adId = String(item.ad_id ?? "");
      const avitoId = Number(item.avito_id);
      if (adId && Number.isFinite(avitoId) && avitoId > 0) result.set(adId, avitoId);
    }
  }
  return result;
}
