/**
 * Клиент публичного API ЦИАН (https://public-api.cian.ru, документация:
 * https://public-api.cian.ru/docs/latest). Только сервер: использует ключ
 * доступа из секретов проекта и никогда не попадает в браузерный бандл.
 */

import type { CianOffer } from "@/lib/cian";

const BASE_URL = "https://public-api.cian.ru";

export function cianKey(): string {
  const key = process.env["CIAN_API_KEY"];
  if (!key) {
    throw new Error(
      "Кабинет ЦИАН не подключён: не задан ключ доступа. Добавьте его в настройках проекта.",
    );
  }
  return key;
}

type QueryValue = string | number | boolean | (string | number)[];

/** GET-запрос к API ЦИАН. Списки передаются повторением параметра. */
export async function cianGet<T>(
  path: string,
  params: Record<string, QueryValue> = {},
): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      search.append(key, String(item));
    }
  }
  const qs = search.toString();
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cianKey()}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`CIAN ${path} failed [${response.status}]: ${text}`);
    throw new Error(`ЦИАН ответил ошибкой ${response.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    console.error(`CIAN ${path} returned non-JSON: ${text.slice(0, 300)}`);
    throw new Error("ЦИАН вернул неожиданный ответ");
  }
}

/** Количество объявлений в кабинете (для проверки подключения). */
export async function countMyOffers(): Promise<number> {
  const payload = await cianGet<{
    result?: { totalCount?: number };
  }>("/v2/get-my-offers", {
    page: 1,
    pageSize: 1,
    statuses: ["published", "inactive"],
  });
  return Number(payload.result?.totalCount ?? 0);
}

type Announcement = { id: number; status: string };
type OfferInfo = { id: number; url: string; externalId: string };

const MAX_OFFERS = 300;

/** Все объявления кабинета (id + статус + ссылка), с пагинацией. */
export async function listMyOffers(): Promise<(Announcement & OfferInfo)[]> {
  const announcements: Announcement[] = [];
  let page = 1;
  while (announcements.length < MAX_OFFERS) {
    const payload = await cianGet<{
      result?: { announcements?: Record<string, unknown>[]; totalCount?: number };
    }>("/v2/get-my-offers", {
      page,
      pageSize: 100,
      statuses: ["published", "inactive"],
    });
    const batch = (payload.result?.announcements ?? []).map((a) => ({
      id: Number(a["id"]),
      status: String(a["status"] ?? ""),
    }));
    announcements.push(...batch.filter((a) => Number.isFinite(a.id)));
    const total = Number(payload.result?.totalCount ?? 0);
    if (batch.length === 0 || announcements.length >= total) break;
    page += 1;
  }

  const limited = announcements.slice(0, MAX_OFFERS);
  const details: OfferInfo[] = [];
  for (let i = 0; i < limited.length; i += 50) {
    const chunk = limited.slice(i, i + 50);
    const payload = await cianGet<{
      result?: { offers?: Record<string, unknown>[] };
    }>("/v1/get-my-offers-detail", { offerIds: chunk.map((a) => a.id) });
    for (const o of payload.result?.offers ?? []) {
      details.push({
        id: Number(o["id"]),
        url: String(o["url"] ?? ""),
        externalId: String(o["externalId"] ?? ""),
      });
    }
  }

  const byId = new Map(details.map((d) => [d.id, d]));
  return limited.map((a) => ({
    ...a,
    ...(byId.get(a.id) ?? { url: "", externalId: "" }),
  }));
}

// ---------------------------------------------------------------------------
// Публичный API ЦИАН не отдаёт адрес и цену объявления, а страницы сайта
// защищены капчей. Для автосопоставления обогащаем объявления данными
// из чатов кабинета: там карточки объявлений идут с адресом, ценой и фото.
// ---------------------------------------------------------------------------

type OfferCard = {
  title: string;
  address: string;
  price: number | null;
  photo: string | null;
};

function priceNumber(value: unknown): number | null {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  const n = Number(digits);
  return digits && Number.isFinite(n) ? n : null;
}

function roomsFromTitle(title: string): number | null {
  const m = title.match(/(\d+)\s*-\s*комн/i);
  if (m) return Number(m[1]);
  return /студи/i.test(title) ? 0 : null;
}

function areaFromTitle(title: string): number | null {
  const m = title.match(/([\d]+[.,]?\d*)\s*м²/i);
  return m?.[1] ? Number(m[1].replace(",", ".")) : null;
}

/** Карточки объявлений из последних сообщений чатов: offerId → адрес/цена/фото. */
export async function fetchOfferCardsFromChats(): Promise<Map<number, OfferCard>> {
  const cards = new Map<number, OfferCard>();
  let page = 1;
  while (page <= 3) {
    const payload = await cianGet<{
      result?: { chats?: Record<string, unknown>[]; totalCount?: number };
    }>("/v1/get-chats", { page, pageSize: 100, orderBy: "updatedAt", orderDir: "desc" });
    const chats = payload.result?.chats ?? [];
    for (const chat of chats) {
      const last = chat["lastMessage"] as Record<string, unknown> | undefined;
      const content = (last?.["content"] ?? {}) as Record<string, unknown>;
      for (const offer of (content["offers"] ?? []) as Record<string, unknown>[]) {
        const id = Number(offer["id"]);
        if (!Number.isFinite(id) || cards.has(id)) continue;
        const photoObj = offer["mainPhoto"] as Record<string, unknown> | undefined;
        cards.set(id, {
          title: String(offer["title"] ?? "").slice(0, 200),
          address: String(offer["address"] ?? ""),
          price: priceNumber(offer["price"]),
          photo: photoObj ? String(photoObj["fullUrl"] ?? photoObj["url"] ?? "") || null : null,
        });
      }
    }
    const total = Number(payload.result?.totalCount ?? 0);
    if (chats.length === 0 || page * 100 >= total) break;
    page += 1;
  }
  return cards;
}

/** Полный список объявлений кабинета с тем, что удалось узнать об адресе и цене. */
export async function fetchCianOffersFull(): Promise<CianOffer[]> {
  const offers = await listMyOffers();
  let cards = new Map<number, OfferCard>();
  try {
    cards = await fetchOfferCardsFromChats();
  } catch (e) {
    console.error("CIAN chats enrich failed:", e);
  }
  return offers.map((o) => {
    const card = cards.get(o.id);
    const title = card?.title ?? "";
    return {
      externalId: String(o.id),
      url: o.url || `https://www.cian.ru/rent/flat/${o.id}/`,
      title,
      address: card?.address ?? "",
      complexName: "",
      rooms: roomsFromTitle(title),
      area: areaFromTitle(title),
      floor: null,
      price: card?.price ?? null,
      photo: card?.photo ?? null,
      status: o.status,
    } satisfies CianOffer;
  });
}

// ---------------------------------------------------------------------------
// Статистика
// ---------------------------------------------------------------------------

export type CianDayStat = {
  date: string;
  impressions: number;
  views: number;
  contact_views: number;
  calls: number;
  messages: number;
  favorites: number;
};

type DayRow = { date?: string };

function indexByDate<T extends DayRow>(
  rows: T[] | undefined,
  pick: (row: T) => number,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    const date = String(row.date ?? "").slice(0, 10);
    if (date.length === 10) map.set(date, pick(row));
  }
  return map;
}

/** Статистика объявления по дням за период (YYYY-MM-DD). */
export async function fetchOfferStatsByDays(
  offerId: number,
  from: string,
  to: string,
): Promise<CianDayStat[]> {
  const payload = await cianGet<{ result?: Record<string, unknown> }>(
    "/v1/get-views-statistics-by-days",
    { offerId, dateFrom: from, dateTo: to },
  );
  const r = payload.result ?? {};

  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };

  const shows = indexByDate(
    r["showsByDays"] as Record<string, unknown>[] | undefined,
    (row) => num(row["shows"]),
  );
  const views = indexByDate(
    r["viewsByDays"] as Record<string, unknown>[] | undefined,
    (row) => num(row["views"]),
  );
  const phoneShows = indexByDate(
    r["phoneShowsByDays"] as Record<string, unknown>[] | undefined,
    (row) => num(row["phoneShows"]),
  );
  const calls = indexByDate(r["callsByDays"] as Record<string, unknown>[] | undefined, (row) =>
    num(row["calls"]),
  );
  const chats = indexByDate(r["chatsByDays"] as Record<string, unknown>[] | undefined, (row) =>
    num(row["chats"]),
  );
  const favorites = indexByDate(
    r["addToFavoritesByDays"] as Record<string, unknown>[] | undefined,
    (row) => num(row["addToFavorites"]),
  );

  const dates = new Set<string>([
    ...shows.keys(),
    ...views.keys(),
    ...phoneShows.keys(),
    ...calls.keys(),
    ...chats.keys(),
    ...favorites.keys(),
  ]);

  return [...dates].sort().map((date) => ({
    date,
    impressions: shows.get(date) ?? 0,
    views: views.get(date) ?? 0,
    contact_views: phoneShows.get(date) ?? 0,
    calls: calls.get(date) ?? 0,
    messages: chats.get(date) ?? 0,
    favorites: favorites.get(date) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Чаты и сообщения
// ---------------------------------------------------------------------------

export type CianChat = {
  chatId: number;
  offerId: number | null;
  updatedAt: string;
};

/** Чаты кабинета, новые первыми. */
export async function fetchChats(max = 200): Promise<CianChat[]> {
  const chats: CianChat[] = [];
  let page = 1;
  while (chats.length < max) {
    const payload = await cianGet<{
      result?: { chats?: Record<string, unknown>[]; totalCount?: number };
    }>("/v1/get-chats", {
      page,
      pageSize: 100,
      orderBy: "updatedAt",
      orderDir: "desc",
    });
    const batch = (payload.result?.chats ?? []).map((c) => ({
      chatId: Number(c["chatId"]),
      offerId:
        c["offer"] && typeof c["offer"] === "object"
          ? Number((c["offer"] as Record<string, unknown>)["id"]) || null
          : null,
      updatedAt: String(c["updatedAt"] ?? ""),
    }));
    chats.push(...batch.filter((c) => Number.isFinite(c.chatId)));
    const total = Number(payload.result?.totalCount ?? 0);
    if (batch.length === 0 || chats.length >= total) break;
    page += 1;
  }
  return chats.slice(0, max);
}

export type CianMessage = {
  messageId: string;
  chatId: number;
  direction: "in" | "out";
  text: string;
  author: string;
  createdAt: string;
};

/** Последние сообщения чата. */
export async function fetchChatMessages(chatId: number, pageSize = 50): Promise<CianMessage[]> {
  const payload = await cianGet<{
    result?: {
      messages?: Record<string, unknown>[];
      users?: Record<string, unknown>[];
    };
  }>("/v1/get-messages", { chatId, page: 1, pageSize, readChat: false });

  const names = new Map<number, string>();
  for (const u of payload.result?.users ?? []) {
    const id = Number(u["userId"]);
    const name =
      String(u["name"] ?? "") ||
      [u["firstName"], u["lastName"]].map((v) => String(v ?? "")).join(" ").trim();
    if (Number.isFinite(id) && name) names.set(id, name);
  }

  return (payload.result?.messages ?? []).map((m) => {
    const content = (m["content"] ?? {}) as Record<string, unknown>;
    return {
      messageId: String(m["messageId"] ?? ""),
      chatId,
      direction: String(m["direction"]) === "out" ? ("out" as const) : ("in" as const),
      text: String(content["text"] ?? ""),
      author: names.get(Number(m["userId"])) ?? "Клиент",
      createdAt: String(m["createdAt"] ?? ""),
    };
  });
}
