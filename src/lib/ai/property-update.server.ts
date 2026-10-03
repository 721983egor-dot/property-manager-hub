/**
 * Защита updateProperty Ассистента от «полного затирания» карточки.
 * Модель часто присылает все поля схемы пустыми строками/нулями вместе с нужной ценой.
 */

export type PropertyUpdateFields = {
  title?: string;
  internalName?: string;
  address?: string;
  complexName?: string;
  type?: string;
  rooms?: number;
  bathrooms?: number;
  area?: number;
  floor?: number;
  totalFloors?: number;
  priceMonth?: number;
  status?: string;
  deposit?: number;
  commission?: number;
  utilitiesMonth?: number;
  description?: string;
  rentTerms?: string;
  availabilityNote?: string;
  forRent?: boolean;
  videoUrl?: string;
};

const TEXT_NO_CLEAR = new Set([
  "title",
  "internalName",
  "address",
  "complexName",
  "description",
  "rentTerms",
  "availabilityNote",
]);

/** Структурные числа: 0 почти всегда галлюцинация, а не осознанное значение. */
const STRUCTURAL_NUMBERS = new Set(["rooms", "bathrooms", "area", "floor", "totalFloors"]);

/** Деньги: обнуление вместе с пачкой пустых полей — типичный wipe. */
const MONEY_NO_ZERO_WIPE = new Set(["deposit", "commission", "utilitiesMonth"]);

function sameValue(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (typeof a === "number" || typeof b === "number") {
    const na = a == null || a === "" ? null : Number(a);
    const nb = b == null || b === "" ? null : Number(b);
    if (na == null && nb == null) return true;
    if (na == null || nb == null) return false;
    return na === nb;
  }
  if (typeof a === "boolean" || typeof b === "boolean") {
    return Boolean(a) === Boolean(b);
  }
  return String(a ?? "").trim() === String(b ?? "").trim();
}

function currentOf(
  current: Record<string, unknown> | null | undefined,
  camel: keyof PropertyUpdateFields,
): unknown {
  if (!current) return undefined;
  const map: Record<string, string> = {
    title: "title",
    internalName: "internal_name",
    address: "address",
    complexName: "complex_name",
    type: "type",
    rooms: "rooms",
    bathrooms: "bathrooms",
    area: "area",
    floor: "floor",
    totalFloors: "total_floors",
    priceMonth: "price_month",
    status: "status",
    deposit: "deposit",
    commission: "commission",
    utilitiesMonth: "utilities_month",
    description: "description",
    rentTerms: "rent_terms",
    availabilityNote: "availability_note",
    forRent: "for_rent",
    videoUrl: "video_url",
  };
  return current[map[camel] ?? camel];
}

/** Считаем «мусор» в сыром payload — признак полного дампа схемы с дефолтами. */
function countWipeNoise(raw: Record<string, unknown>): number {
  let n = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") n += 1;
    else if (typeof value === "number" && value === 0 && STRUCTURAL_NUMBERS.has(key)) n += 1;
    else if (typeof value === "number" && value === 0 && MONEY_NO_ZERO_WIPE.has(key)) n += 1;
  }
  return n;
}

/**
 * Оставляет только осмысленные частичные правки.
 * Пустые строки для текста и нули для комнат/площади/этажа отбрасываются.
 * videoUrl="" допускается только если это единственное оставшееся изменение
 * (осознанное «убрать видео»), иначе вместе с wipe затирало ролик.
 * При «шумном» payload (много пустых/нулей) статус тоже не меняем — только явные правки вроде цены.
 */
export function sanitizePropertyUpdateFields(
  raw: Record<string, unknown>,
  current?: Record<string, unknown> | null,
): PropertyUpdateFields {
  const wipeNoise = countWipeNoise(raw);
  const massWipe = wipeNoise >= 5;
  const out: PropertyUpdateFields = {};

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    const k = key as keyof PropertyUpdateFields;

    if (massWipe && k === "status") continue;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (TEXT_NO_CLEAR.has(k) && trimmed === "") continue;
      if (k === "videoUrl" && trimmed === "") {
        // отложим решение — см. ниже
        (out as Record<string, unknown>)[k] = "";
        continue;
      }
      if (sameValue(trimmed, currentOf(current, k))) continue;
      (out as Record<string, unknown>)[k] = trimmed;
      continue;
    }

    if (typeof value === "number") {
      if (STRUCTURAL_NUMBERS.has(k) && value === 0) continue;
      // Обнуление денег через Ассистента почти всегда wipe; осознанный 0 — в карточке UI.
      if (MONEY_NO_ZERO_WIPE.has(k) && value === 0) continue;
      if (sameValue(value, currentOf(current, k))) continue;
      (out as Record<string, unknown>)[k] = value;
      continue;
    }

    if (typeof value === "boolean") {
      if (sameValue(value, currentOf(current, k))) continue;
      (out as Record<string, unknown>)[k] = value;
      continue;
    }

    if (sameValue(value, currentOf(current, k))) continue;
    (out as Record<string, unknown>)[k] = value;
  }

  // Пустой videoUrl — только как одиночное действие «убрать видео».
  if (out.videoUrl === "") {
    const keys = Object.keys(out);
    if (keys.length !== 1 || massWipe) {
      delete out.videoUrl;
    } else {
      const cur = String(currentOf(current, "videoUrl") ?? "").trim();
      if (!cur) delete out.videoUrl;
    }
  }

  // Шумный payload: оставляем цену и непустые текстовые правки, без type/status/forRent.
  if (massWipe) {
    const keep: PropertyUpdateFields = {};
    if (out.priceMonth != null) keep.priceMonth = out.priceMonth;
    for (const key of [
      "title",
      "internalName",
      "address",
      "complexName",
      "description",
      "rentTerms",
      "availabilityNote",
      "videoUrl",
    ] as const) {
      const value = out[key];
      if (typeof value === "string" && value.trim()) keep[key] = value;
    }
    return keep;
  }

  return out;
}

export function propertyUpdateFieldsToDbPatch(
  fields: PropertyUpdateFields,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.title != null) patch["title"] = fields.title;
  if (fields.internalName != null) patch["internal_name"] = fields.internalName;
  if (fields.address != null) patch["address"] = fields.address;
  if (fields.complexName != null) patch["complex_name"] = fields.complexName;
  if (fields.type != null) patch["type"] = fields.type;
  if (fields.rooms != null) patch["rooms"] = fields.rooms;
  if (fields.bathrooms != null) patch["bathrooms"] = fields.bathrooms;
  if (fields.area != null) patch["area"] = fields.area;
  if (fields.floor != null) patch["floor"] = fields.floor;
  if (fields.totalFloors != null) patch["total_floors"] = fields.totalFloors;
  if (fields.priceMonth != null) patch["price_month"] = fields.priceMonth;
  if (fields.status) patch["status"] = fields.status;
  if (fields.deposit != null) patch["deposit"] = fields.deposit;
  if (fields.commission != null) patch["commission"] = fields.commission;
  if (fields.utilitiesMonth != null) patch["utilities_month"] = fields.utilitiesMonth;
  if (fields.description != null) patch["description"] = fields.description;
  if (fields.rentTerms != null) patch["rent_terms"] = fields.rentTerms;
  if (fields.availabilityNote != null) patch["availability_note"] = fields.availabilityNote;
  if (fields.forRent != null) patch["for_rent"] = Boolean(fields.forRent);
  if (fields.videoUrl != null) patch["video_url"] = String(fields.videoUrl).trim();
  return patch;
}
