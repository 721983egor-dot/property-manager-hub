/**
 * Частичные обновления объекта через Ассистента.
 * Правило: в БД уходят только явно переданные и осмысленные поля.
 * Пустые строки / нули из «дампа схемы» модели никогда не затирают карточку.
 * Осознанная очистка — только через clearFields (или одиночный videoUrl="").
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
  locationDescription?: string;
  rentTerms?: string;
  availabilityNote?: string;
  forRent?: boolean;
  videoUrl?: string;
};

/** Поля, которые можно осознанно очистить через clearFields. */
export const PROPERTY_CLEARABLE_FIELDS = [
  "title",
  "internalName",
  "address",
  "complexName",
  "description",
  "locationDescription",
  "rentTerms",
  "availabilityNote",
  "videoUrl",
  "deposit",
  "commission",
  "utilitiesMonth",
] as const;

export type PropertyClearableField = (typeof PROPERTY_CLEARABLE_FIELDS)[number];

const TEXT_FIELDS = new Set<string>([
  "title",
  "internalName",
  "address",
  "complexName",
  "description",
  "locationDescription",
  "rentTerms",
  "availabilityNote",
  "videoUrl",
]);

/** Структурные числа: 0 почти всегда галлюцинация, а не осознанное значение. */
const STRUCTURAL_NUMBERS = new Set(["rooms", "bathrooms", "area", "floor", "totalFloors"]);

/** Деньги: обнуление без clearFields — типичный wipe. */
const MONEY_FIELDS = new Set(["deposit", "commission", "utilitiesMonth", "priceMonth"]);

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
    locationDescription: "location_description",
    rentTerms: "rent_terms",
    availabilityNote: "availability_note",
    forRent: "for_rent",
    videoUrl: "video_url",
  };
  return current[map[camel] ?? camel];
}

/** Считаем «мусор» в сыром payload — признак полного дампа схемы с дефолтами. */
export function countWipeNoise(raw: Record<string, unknown>): number {
  let n = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (key === "clearFields" || value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") n += 1;
    else if (typeof value === "number" && value === 0 && STRUCTURAL_NUMBERS.has(key)) n += 1;
    else if (
      typeof value === "number" &&
      value === 0 &&
      MONEY_FIELDS.has(key) &&
      key !== "priceMonth"
    )
      n += 1;
  }
  return n;
}

function normalizeClearFields(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw
      .map((item) => String(item ?? "").trim())
      .filter((item): item is PropertyClearableField =>
        (PROPERTY_CLEARABLE_FIELDS as readonly string[]).includes(item),
      ),
  );
}

/**
 * Оставляет только осмысленный частичный патч.
 * - отсутствуют / null / undefined → не трогаем;
 * - "" и 0 → отбрасываем, кроме явного clearFields (и одиночного videoUrl="");
 * - значения без изменения относительно current → отбрасываем;
 * - «шумный» dump (≥5 пустых/нулей) → только цена и непустые текстовые правки.
 */
export function sanitizePropertyUpdateFields(
  raw: Record<string, unknown>,
  current?: Record<string, unknown> | null,
): PropertyUpdateFields {
  const clearFields = normalizeClearFields(raw["clearFields"]);
  const wipeNoise = countWipeNoise(raw);
  const hasPriceIntent = typeof raw["priceMonth"] === "number" && Number(raw["priceMonth"]) > 0;
  // Полный dump схемы: много пустых/нулей. С ценой — достаточно ≥3 шума (типичный «поставь цену»).
  const massWipe = wipeNoise >= 5 || (hasPriceIntent && wipeNoise >= 3);
  const out: PropertyUpdateFields = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key === "clearFields") continue;
    if (value === undefined || value === null) continue;
    const k = key as keyof PropertyUpdateFields;

    if (massWipe && (k === "status" || k === "type" || k === "forRent")) continue;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") {
        if (clearFields.has(k) || (k === "videoUrl" && !massWipe)) {
          (out as Record<string, unknown>)[k] = "";
        }
        continue;
      }
      if (sameValue(trimmed, currentOf(current, k))) continue;
      (out as Record<string, unknown>)[k] = trimmed;
      continue;
    }

    if (typeof value === "number") {
      if (value === 0) {
        // 0 для комнат/площади/этажа и денег — wipe-дефолт; деньги только через clearFields.
        if (STRUCTURAL_NUMBERS.has(k)) continue;
        if (k === "priceMonth") continue;
        if (MONEY_FIELDS.has(k) && !clearFields.has(k)) continue;
      }
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

  // Явные очистки из clearFields (если модель не продублировала "" в том же ключе).
  for (const key of clearFields) {
    if (key in out) continue;
    if (TEXT_FIELDS.has(key)) {
      const cur = String(currentOf(current, key as keyof PropertyUpdateFields) ?? "").trim();
      if (cur) (out as Record<string, unknown>)[key] = "";
    } else if (MONEY_FIELDS.has(key) && key !== "priceMonth") {
      const cur = currentOf(current, key as keyof PropertyUpdateFields);
      if (cur != null && Number(cur) !== 0) (out as Record<string, unknown>)[key] = 0;
    }
  }

  // Пустой videoUrl — только clearFields или одиночное «убрать видео».
  if (out.videoUrl === "") {
    const alone = Object.keys(out).length === 1;
    if (massWipe) {
      delete out.videoUrl;
    } else if (!clearFields.has("videoUrl") && !alone) {
      delete out.videoUrl;
    } else {
      const cur = String(currentOf(current, "videoUrl") ?? "").trim();
      if (!cur) delete out.videoUrl;
    }
  }

  if (massWipe) {
    const keep: PropertyUpdateFields = {};
    if (out.priceMonth != null && out.priceMonth !== 0) keep.priceMonth = out.priceMonth;
    for (const key of [
      "title",
      "internalName",
      "address",
      "complexName",
      "description",
      "locationDescription",
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
  if (fields.locationDescription != null)
    patch["location_description"] = fields.locationDescription;
  if (fields.rentTerms != null) patch["rent_terms"] = fields.rentTerms;
  if (fields.availabilityNote != null) patch["availability_note"] = fields.availabilityNote;
  if (fields.forRent != null) patch["for_rent"] = Boolean(fields.forRent);
  if (fields.videoUrl != null) patch["video_url"] = String(fields.videoUrl).trim();
  return patch;
}

/**
 * Общий helper для partial-update: в патч попадают только ключи с осмысленным значением.
 * Пустые строки и null не пишутся, если ключ не в allowEmpty.
 */
export function pickDefinedPatch<T extends Record<string, unknown>>(
  source: T,
  keys: (keyof T)[],
  options?: { allowEmpty?: (keyof T)[] },
): Partial<T> {
  const allowEmpty = new Set(options?.allowEmpty ?? []);
  const out: Partial<T> = {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = source[key];
    if (value === undefined) continue;
    if (value === null) {
      if (allowEmpty.has(key)) out[key] = value;
      continue;
    }
    if (typeof value === "string" && value.trim() === "" && !allowEmpty.has(key)) continue;
    out[key] = value;
  }
  return out;
}

const moneyRu = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

/**
 * Текст подтверждения для Ассистента: только ключи из уже санитизированного патча.
 * Никогда не перечисляет пустые «» / нули из дампа схемы модели.
 */
export function summarizePropertyUpdateFields(fields: PropertyUpdateFields): string[] {
  const parts: string[] = [];
  if (Object.prototype.hasOwnProperty.call(fields, "title")) {
    parts.push(fields.title ? `название «${fields.title}»` : "очистить название");
  }
  if (Object.prototype.hasOwnProperty.call(fields, "internalName")) {
    parts.push(fields.internalName ? `внутреннее «${fields.internalName}»` : "очистить внутреннее");
  }
  if (Object.prototype.hasOwnProperty.call(fields, "address")) {
    parts.push(fields.address ? "адрес" : "очистить адрес");
  }
  if (Object.prototype.hasOwnProperty.call(fields, "complexName")) {
    parts.push(fields.complexName ? `комплекс «${fields.complexName}»` : "очистить комплекс");
  }
  if (fields.type) parts.push(`тип «${fields.type}»`);
  if (fields.rooms != null) parts.push(`${fields.rooms} комн.`);
  if (fields.bathrooms != null) parts.push(`${fields.bathrooms} с/у`);
  if (fields.area != null) parts.push(`площадь ${fields.area}`);
  if (fields.floor != null) parts.push(`этаж ${fields.floor}`);
  if (fields.totalFloors != null) parts.push(`этажей ${fields.totalFloors}`);
  if (fields.priceMonth != null) parts.push(`цена ${moneyRu(fields.priceMonth)}/мес`);
  if (fields.status) parts.push(`статус «${fields.status}»`);
  if (Object.prototype.hasOwnProperty.call(fields, "deposit")) {
    parts.push(fields.deposit ? `депозит ${moneyRu(fields.deposit)}` : "очистить депозит");
  }
  if (fields.commission != null) parts.push(`комиссия ${fields.commission}%`);
  if (Object.prototype.hasOwnProperty.call(fields, "utilitiesMonth")) {
    parts.push(
      fields.utilitiesMonth
        ? `коммунальные ${moneyRu(fields.utilitiesMonth)}`
        : "очистить коммунальные",
    );
  }
  if (Object.prototype.hasOwnProperty.call(fields, "description")) {
    parts.push(fields.description ? "новое описание" : "очистить описание");
  }
  if (Object.prototype.hasOwnProperty.call(fields, "locationDescription")) {
    parts.push(
      fields.locationDescription
        ? `описание локации: ${fields.locationDescription}`
        : "очистить описание локации",
    );
  }
  if (Object.prototype.hasOwnProperty.call(fields, "rentTerms")) {
    parts.push(fields.rentTerms ? "новые условия аренды" : "очистить условия аренды");
  }
  if (Object.prototype.hasOwnProperty.call(fields, "availabilityNote")) {
    parts.push(fields.availabilityNote ? "заметка о доступности" : "очистить заметку");
  }
  if (fields.forRent === true) parts.push("в аренду");
  if (fields.forRent === false) parts.push("только обслуживание (не в аренду)");
  if (Object.prototype.hasOwnProperty.call(fields, "videoUrl")) {
    parts.push(String(fields.videoUrl ?? "").trim() ? "ссылка на видео" : "убрать видео");
  }
  return parts;
}

/** Полная строка «Изменить …» для кнопки подтверждения. */
export function formatPropertyUpdateConfirmLabel(
  propertyText: string,
  fields: PropertyUpdateFields,
): string | null {
  const parts = summarizePropertyUpdateFields(fields);
  if (!parts.length) return null;
  return `Изменить «${propertyText}»: ${parts.join(", ")}`;
}
