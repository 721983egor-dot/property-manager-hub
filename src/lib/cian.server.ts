/**
 * Низкоуровневый клиент ЦИАН API. Только сервер: использует ключ доступа
 * из секретов проекта и никогда не попадает в браузерный бандл.
 */

import type { CianOffer } from "@/lib/cian";

const BASE_URL = "https://public-api.cian.ru/v1";

export function cianKey(): string {
  const key = process.env["CIAN_API_KEY"];
  if (!key) {
    throw new Error(
      "Кабинет ЦИАН не подключён: не задан ключ доступа. Добавьте его в настройках проекта.",
    );
  }
  return key;
}

/** Запрос к ЦИАН с понятной ошибкой при неуспехе. */
export async function cianRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? "POST",
    headers: {
      Authorization: `Bearer ${cianKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
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

type RawOffer = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function numOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && value !== null && value !== "" ? n : null;
}

function pick(row: RawOffer, keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/** Приводит объявление ЦИАН к внутреннему виду, терпимо к разным именам полей. */
export function normalizeOffer(row: RawOffer): CianOffer {
  const bargainTerms = (row["bargainTerms"] ?? {}) as RawOffer;
  const building = (row["building"] ?? {}) as RawOffer;
  const geo = (row["geo"] ?? {}) as RawOffer;
  const photos = Array.isArray(row["photos"]) ? (row["photos"] as RawOffer[]) : [];

  const externalId = str(pick(row, ["id", "cianId", "offerId", "externalId"]));

  return {
    externalId,
    url: str(pick(row, ["url", "offerUrl", "fullUrl"])) || `https://www.cian.ru/rent/flat/${externalId}/`,
    title: str(pick(row, ["title", "name", "description"])).slice(0, 200),
    address: str(pick(row, ["address", "fullAddress"])) || str(pick(geo, ["userInput", "address"])),
    complexName: str(pick(row, ["newbuildingName", "jkName"])) || str(pick(building, ["name"])),
    rooms: numOrNull(pick(row, ["roomsCount", "rooms"])),
    area: numOrNull(pick(row, ["totalArea", "area"])),
    floor: numOrNull(pick(row, ["floorNumber", "floor"])),
    price: numOrNull(pick(bargainTerms, ["price"]) ?? pick(row, ["price"])),
    photo: photos.length > 0 ? str(pick(photos[0] as RawOffer, ["fullUrl", "url"])) || null : null,
    status: str(pick(row, ["status", "state"])) || "published",
  };
}

/** Достаёт массив объявлений из разных возможных обёрток ответа. */
export function extractOffers(payload: unknown): RawOffer[] {
  if (Array.isArray(payload)) return payload as RawOffer[];
  const obj = (payload ?? {}) as RawOffer;
  for (const key of ["offers", "items", "result", "data", "objects"]) {
    const value = obj[key];
    if (Array.isArray(value)) return value as RawOffer[];
    if (value && typeof value === "object") {
      const nested = extractOffers(value);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}
