/**
 * Клиент открытого API Bnovo PMS v1 («Старт»).
 * Документация: https://help.bnovo.ru/knowledgebase/открытое-api-bnovo-pms/
 *
 * v1 умеет только читать брони:
 *   POST /api/v1/auth  → bearer access_token
 *   GET  /api/v1/bookings?date_from=&date_to=&limit=&offset=
 *   GET  /api/v1/bookings/{id}
 */

const DEFAULT_BASE = "https://api.pms.bnovo.ru";

export type BnovoCredentials = {
  accountId: string;
  password: string;
  baseUrl?: string;
};

export type BnovoBooking = {
  id: string;
  status: string;
  arrival: string;
  departure: string;
  roomId: string;
  roomName: string;
  categoryName: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  amount: number | null;
  source: string;
  adults: number | null;
  children: number | null;
  comment: string;
  raw: Record<string, unknown>;
};

type TokenCache = { token: string; at: number };
let tokenCache: TokenCache | null = null;

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

function numOf(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOf(value: unknown): string {
  const raw = textOf(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return "";
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const parts = key.split(".");
    let cur: unknown = obj;
    for (const part of parts) {
      const rec = recordOf(cur);
      if (!rec || !(part in rec)) {
        cur = undefined;
        break;
      }
      cur = rec[part];
    }
    if (cur != null && cur !== "") return cur;
  }
  return undefined;
}

export function normalizeBnovoBooking(raw: Record<string, unknown>): BnovoBooking | null {
  const id = textOf(pick(raw, ["id", "booking_id", "bookingId", "number", "uid"]));
  const arrival = dateOf(
    pick(raw, [
      "dates.arrival",
      "arrival",
      "arrival_date",
      "date_from",
      "start_date",
      "checkin",
      "check_in",
      "from",
    ]),
  );
  const departure = dateOf(
    pick(raw, [
      "dates.departure",
      "departure",
      "departure_date",
      "date_to",
      "end_date",
      "checkout",
      "check_out",
      "to",
    ]),
  );
  if (!id || !arrival) return null;
  const room = recordOf(pick(raw, ["room", "rooms.0"])) ?? {};
  const guest =
    recordOf(pick(raw, ["customer", "guest", "guests.0", "client", "contact"])) ?? {};
  const people = Array.isArray(raw["guests"]) ? raw["guests"] : [];
  const firstGuest = recordOf(people[0]) ?? {};
  const statusRaw = pick(raw, ["status.name", "status", "status_name", "state"]);
  const sourceRaw = pick(raw, ["source.name", "source", "channel", "ota", "provider", "origin"]);
  const guestName =
    [textOf(pick(guest, ["name"])), textOf(pick(guest, ["surname", "lastname", "last_name"]))]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    textOf(
      pick(raw, ["name", "full_name", "customer_name"]) ||
        pick(guest, ["full_name", "fio"]) ||
        pick(firstGuest, ["name", "full_name", "fio"]),
    );
  return {
    id,
    status: textOf(statusRaw).toLowerCase(),
    arrival,
    departure: departure || arrival,
    roomId: textOf(
      pick(raw, ["room_id", "roomId", "room.id", "room_number_id"]) ||
        pick(room, ["id", "room_id"]),
    ),
    roomName: textOf(
      pick(raw, ["room_name", "room_number", "room.name", "room.number", "number_name"]) ||
        pick(room, ["name", "number", "title"]),
    ),
    categoryName: textOf(
      pick(raw, ["category", "category_name", "room_type", "room.category_name", "plan_name"]) ||
        pick(room, ["category", "category_name", "type"]),
    ),
    guestName,
    guestPhone: textOf(
      pick(raw, ["phone", "customer_phone"]) ||
        pick(guest, ["phone", "tel", "mobile"]) ||
        pick(firstGuest, ["phone", "tel", "mobile"]),
    ),
    guestEmail: textOf(
      pick(guest, ["email"]) || pick(firstGuest, ["email"]) || pick(raw, ["email"]),
    ),
    amount: numOf(pick(raw, ["amount", "total", "price", "sum", "prices.total"])),
    source: textOf(sourceRaw),
    adults: numOf(pick(raw, ["adults", "adult", "guests_count", "persons"])),
    children: numOf(pick(raw, ["children", "child"])),
    comment: textOf(pick(raw, ["notes", "comment", "note", "special_wishes", "customer.notes"])),
    raw,
  };
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const rec = recordOf(json);
    const err = recordOf(pick(rec ?? {}, ["error"])) ?? rec;
    const details = recordOf(err ? err["errors"] : null);
    const detailText = details
      ? Object.entries(details)
          .map(([key, value]) => `${key}: ${textOf(value)}`)
          .join("; ")
      : "";
    const message =
      textOf(pick(err ?? {}, ["message", "error", "detail"])) ||
      textOf(pick(rec ?? {}, ["message", "error", "detail"])) ||
      `Bnovo HTTP ${response.status}`;
    throw new Error(detailText ? `${message} (${detailText})` : message);
  }
  return json;
}

export async function bnovoAuth(creds: BnovoCredentials): Promise<string> {
  if (tokenCache && Date.now() - tokenCache.at < 25 * 60 * 1000) return tokenCache.token;
  const base = (creds.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  const json = await requestJson(`${base}/api/v1/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ id: creds.accountId, password: creds.password }),
  });
  const rec = recordOf(json) ?? {};
  const token = textOf(
    pick(rec, ["access_token", "token", "data.access_token", "data.token", "bearer"]),
  );
  if (!token) throw new Error("Bnovo не вернул access_token");
  tokenCache = { token, at: Date.now() };
  return token;
}

export function clearBnovoToken() {
  tokenCache = null;
}

function bookingsFromPayload(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json.filter(recordOf) as Record<string, unknown>[];
  const rec = recordOf(json);
  if (!rec) return [];
  for (const key of ["data", "bookings", "items", "result"]) {
    const value = rec[key];
    if (Array.isArray(value)) return value.filter(recordOf) as Record<string, unknown>[];
    const nested = recordOf(value);
    if (nested && Array.isArray(nested["bookings"])) {
      return nested["bookings"].filter(recordOf) as Record<string, unknown>[];
    }
  }
  return [];
}

export async function listBnovoBookings(
  creds: BnovoCredentials,
  from: string,
  to: string,
): Promise<BnovoBooking[]> {
  const token = await bnovoAuth(creds);
  const base = (creds.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  const pageSize = 100;
  const collected: Record<string, unknown>[] = [];
  let offset = 0;
  let total: number | null = null;
  while (true) {
    const url =
      `${base}/api/v1/bookings?date_from=${encodeURIComponent(from)}` +
      `&date_to=${encodeURIComponent(to)}&limit=${pageSize}&offset=${offset}`;
    const json = await requestJson(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const page = bookingsFromPayload(json);
    collected.push(...page);
    const rec = recordOf(json);
    const data = recordOf(rec?.["data"]) ?? rec;
    const meta = recordOf(data?.["meta"]);
    total = numOf(meta?.["total"]) ?? total;
    offset += page.length;
    if (page.length === 0) break;
    if (total != null && offset >= total) break;
    if (page.length < pageSize) break;
  }
  return collected
    .map((row) => normalizeBnovoBooking(row))
    .filter((row): row is BnovoBooking => Boolean(row));
}

export async function getBnovoBooking(creds: BnovoCredentials, id: string): Promise<BnovoBooking | null> {
  const token = await bnovoAuth(creds);
  const base = (creds.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  const json = await requestJson(`${base}/api/v1/bookings/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const rec = recordOf(json);
  const inner = rec ? recordOf(rec["data"]) ?? rec : null;
  return inner ? normalizeBnovoBooking(inner) : null;
}
