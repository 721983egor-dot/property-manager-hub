import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getStaffProperty, listStaffProperties } from "@/lib/staff-data.functions";

export type PropertyType = "apartment" | "aparts" | "house" | "villa" | "townhouse";

/** Дома и виллы: у них нет комплекса и этажа, зато есть участок. */
export function isHouseType(type: PropertyType) {
  return type === "house" || type === "villa";
}
export type PropertyStatus = "free" | "soon_free" | "rented" | "booked" | "archived";

export type PropertyPhoto = { path: string };

/** Тип услуги — только для внутренних экранов RM OS. */
export type ServiceType = "management" | "commission_only";
export type ManagementFeeType = "percent" | "amount";

export const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: "management", label: "Управление объектом" },
  { value: "commission_only", label: "Только комиссия" },
];

export function serviceTypeLabel(value: ServiceType) {
  return SERVICE_TYPES.find((s) => s.value === value)?.label ?? value;
}

export type Property = {
  id: string;
  published: boolean;
  ref_id: number;
  title: string;
  internal_name: string;
  type: PropertyType;
  complex_name: string;
  complex_id: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  floor: number | null;
  total_floors: number | null;
  rooms: number;
  bathrooms: number;
  status: PropertyStatus;
  description: string;
  photos: PropertyPhoto[];
  price_month: number | null;
  seasonal_pricing: boolean;
  summer_price_month: number | null;
  deposit: number | null;
  commission: number | null;
  area: number | null;
  land_area: number | null;
  outdoor_spaces: string[];
  appliances: string[];
  bathroom_features: string[];
  utilities_month: number | null;
  extra_features: string[];
  location_description: string;
  rent_terms: string;
  card_highlights: string[];
  service_type: ServiceType;
  management_fee_type: ManagementFeeType;
  management_fee_value: number | null;
  availability_note: string;
  beds_count: number | null;
  repair_type: string;
  wc_location_type: string;
  land_status: string;
  cian_jk_id: number | null;
  is_apartments: boolean | null;
  sort_order: number | null;
  source_url?: string | null;
  created_at: string;
  updated_at: string;
};

export const OUTDOOR_OPTIONS = [
  { value: "balcony", label: "Балкон" },
  { value: "terrace", label: "Терраса" },
  { value: "loggia", label: "Лоджия" },
];

export const EXTRA_FEATURE_OPTIONS = [
  { value: "sea_view", label: "Вид на море" },
  { value: "mountain_view", label: "Вид на горы" },
  { value: "balcony", label: "Балкон" },
  { value: "terrace", label: "Терраса" },
  { value: "heated_pool", label: "Бассейн с подогревом" },
  { value: "pool", label: "Бассейн" },
  { value: "parking", label: "Парковка" },
  { value: "beach", label: "Пляж" },
  { value: "restaurant", label: "Ресторан" },
  { value: "gym", label: "Фитнес-зал" },
  { value: "concierge", label: "Консьерж" },
  { value: "air_conditioner", label: "Кондиционеры" },
  { value: "dishwasher", label: "Посудомоечная машина" },
  { value: "washer", label: "Стиральная машина" },
  { value: "microwave", label: "Микроволновая печь" },
  { value: "oven", label: "Духовой шкаф" },
  { value: "tv", label: "TV" },
];

/** Дополнительные характеристики для домов и вилл. */
export const HOUSE_EXTRA_FEATURE_OPTIONS = [
  { value: "sea_view", label: "Вид на море" },
  { value: "mountain_view", label: "Вид на горы" },
  { value: "city_view", label: "Вид на город" },
  { value: "pool", label: "Бассейн" },
  { value: "heated_pool", label: "Бассейн с подогревом" },
  { value: "banya", label: "Баня" },
  { value: "sauna", label: "Сауна" },
  { value: "grill_zone", label: "Гриль-зона" },
  { value: "garden", label: "Сад" },
  { value: "gazebo", label: "Беседка" },
  { value: "guest_house", label: "Гостевой дом" },
  { value: "garage", label: "Гараж" },
  { value: "parking", label: "Парковка" },
];

/** Характеристики для карточки на сайте — дома и виллы (без комплекса). */
export const HOUSE_HIGHLIGHT_OPTIONS = [
  { value: "sea_view", label: "Вид на море" },
  { value: "mountain_view", label: "Вид на горы" },
  { value: "city_view", label: "Вид на город" },
  { value: "pool", label: "Бассейн" },
  { value: "banya", label: "Баня" },
  { value: "sauna", label: "Сауна" },
  { value: "grill_zone", label: "Гриль-зона" },
  { value: "garden", label: "Сад" },
  { value: "gazebo", label: "Беседка" },
  { value: "garage", label: "Гараж" },
  { value: "parking", label: "Парковка" },
];

export const APPLIANCE_OPTIONS = [
  { value: "air_conditioner", label: "Кондиционер" },
  { value: "dishwasher", label: "Посудомоечная машина" },
  { value: "microwave", label: "Микроволновка" },
  { value: "washer", label: "Стиральная машина" },
  { value: "dryer", label: "Сушильная машина" },
];

export const BATHROOM_FEATURE_OPTIONS = [
  { value: "bath", label: "Ванна" },
  { value: "shower", label: "Душевая кабина" },
  { value: "jacuzzi", label: "Джакузи" },
];

/** Метка характеристики: из справочника либо произвольное значение как есть. */
export function extraFeatureLabel(value: string) {
  return (
    EXTRA_FEATURE_OPTIONS.find((o) => o.value === value)?.label ??
    HOUSE_EXTRA_FEATURE_OPTIONS.find((o) => o.value === value)?.label ??
    value
  );
}

export function labelsFor(
  options: { value: string; label: string }[],
  values: string[] | null | undefined,
) {
  return (values ?? []).map((v) => options.find((o) => o.value === v)?.label ?? v);
}

/** Площадь участка в сотках. */
export function formatLandArea(value: number | null | undefined) {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("ru-RU").format(value)} сот.`;
}

export function formatArea(value: number | null | undefined) {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("ru-RU").format(value)} м²`;
}

/** Летний (высокий) сезон: июнь — сентябрь. */
export const SUMMER_MONTHS = [6, 7, 8, 9];
export const SUMMER_SEASON_LABEL = "июнь — сентябрь";

export function formatMoney(value: number | null | undefined) {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

/** Ссылка на Яндекс.Карты с поиском по адресу объекта. */
export function yandexMapsUrl(address: string) {
  return `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`;
}

// NB: \b не работает с кириллицей, поэтому границы слов задаются явно.
const STREET_RE =
  /(^|[^а-яё])(улица|ул\.|проспект|пр-т|переулок|пер\.|набережная|наб\.|шоссе|бульвар|тупик|проезд|аллея|линия|спуск)(?![а-яё])/i;
const HOUSE_RE = /^\d{1,4}[а-яА-Я]?([/\-]\d+)?$/;
const NOISE_RE =
  /^россия$|(^|[^а-яё])(край|область|обл\.|федеральный округ|городской округ|внутригородской район|район|микрорайон)(?![а-яё])|^\d{6}$/i;

function addressParts(address: string): string[] {
  return address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !NOISE_RE.test(p));
}

function formatShortAddress(address: string): string {
  const parts = addressParts(address);
  if (parts.length === 0) return address;
  if (parts.length <= 3) return parts.join(", ");

  const street = parts.find((p) => STREET_RE.test(p));
  const house = parts.find((p) => HOUSE_RE.test(p));
  const rest = parts.filter((p) => p !== street && p !== house);
  const city = rest[rest.length - 1];

  const out = [city, street, house].filter((p): p is string => Boolean(p));
  const unique = out.filter((p, i) => out.indexOf(p) === i);
  return unique.length > 0 ? unique.join(", ") : parts.join(", ");
}

/** Короткий адрес для карточек: город, улица и номер дома. */
export function shortAddress(address: string): string {
  return formatShortAddress(address);
}



export const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "apartment", label: "Квартиры и Апартаменты" },
  { value: "house", label: "Дома и Виллы" },
  { value: "townhouse", label: "Таунхаус" },
];

export const PROPERTY_STATUSES: { value: PropertyStatus; label: string }[] = [
  { value: "free", label: "Свободен" },
  { value: "soon_free", label: "Скоро освободится" },
  { value: "rented", label: "Сдан" },
  { value: "booked", label: "Забронирован" },
  { value: "archived", label: "Архив" },
];

/** 0 — студия. */
export const ROOM_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
export const BATHROOM_OPTIONS = [1, 2, 3, 4, 5];

export const PHOTO_BUCKET = "property-photos";

/** Название объекта для внутренних экранов RM OS. */
export function internalTitle(p: { internal_name?: string | null; title: string }) {
  return p.internal_name?.trim() ? p.internal_name : p.title;
}

/** Короткая понятная метка объекта для узкой колонки календаря. */
export function shortPropertyLabel(
  p: { internal_name?: string | null; title: string },
  max = 22,
): string {
  const title = internalTitle(p);
  if (title.length <= max) return title;
  const [first] = title.split(/\s+/);
  if (first && first.length > 0 && first.length <= max - 1) {
    return `${first}…`;
  }
  return `${title.slice(0, max - 1)}…`;
}


export function typeLabel(value: PropertyType) {
  const normalized: PropertyType =
    value === "villa" ? "house" : value === "aparts" ? "apartment" : value;
  return PROPERTY_TYPES.find((t) => t.value === normalized)?.label ?? value;
}

/** Характеристики карточки для квартир и апартаментов. */
export const APARTMENT_HIGHLIGHT_OPTIONS = [
  { value: "sea_view", label: "Вид на море" },
  { value: "mountain_view", label: "Вид на горы" },
  { value: "city_view", label: "Вид на город" },
  { value: "pool", label: "Бассейн" },
  { value: "heated_pool", label: "Бассейн с подогревом" },
  { value: "gym", label: "Фитнес-зал" },
  { value: "spa", label: "СПА" },
  { value: "terrace", label: "Терраса" },
  { value: "balcony", label: "Балкон" },
  { value: "jacuzzi", label: "Джакузи" },
  { value: "parking", label: "Парковка" },
  { value: "security", label: "Охрана" },
  { value: "gated", label: "Закрытая территория" },
  { value: "near_sea", label: "Рядом с морем" },
  { value: "beach", label: "Пляж" },
  { value: "playground", label: "Детская площадка" },
  { value: "concierge", label: "Консьерж" },
  { value: "restaurant", label: "Ресторан" },
];

/** Метка характеристики карточки: для домов — свой справочник. */
export function houseHighlightLabel(value: string) {
  return HOUSE_HIGHLIGHT_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Универсальная подпись характеристики карточки — по всем справочникам. */
export function highlightLabel(value: string) {
  const all = [
    ...HOUSE_HIGHLIGHT_OPTIONS,
    ...APARTMENT_HIGHLIGHT_OPTIONS,
    ...HOUSE_EXTRA_FEATURE_OPTIONS,
    ...EXTRA_FEATURE_OPTIONS,
    ...APPLIANCE_OPTIONS,
    ...BATHROOM_FEATURE_OPTIONS,
    ...OUTDOOR_OPTIONS,
  ];
  return all.find((o) => o.value === value)?.label ?? value;
}


export function statusLabel(value: PropertyStatus) {
  return PROPERTY_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export function roomsLabel(rooms: number) {
  if (rooms === 0) return "Студия";
  if (rooms === 1) return "1 комната";
  if (rooms >= 2 && rooms <= 4) return `${rooms} комнаты`;
  return `${rooms} комнат`;
}

export function floorLabel(p: Pick<Property, "floor" | "total_floors">) {
  if (p.floor == null && p.total_floors == null) return "—";
  return `${p.floor ?? "—"}/${p.total_floors ?? "—"}`;
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalize(row: Record<string, unknown>): Property {
  const photos = Array.isArray(row['photos']) ? (row['photos'] as PropertyPhoto[]) : [];
  return {
    ...(row as unknown as Property),
    photos,
    published: Boolean(row['published']),
    latitude: num(row['latitude']),
    longitude: num(row['longitude']),
    price_month: num(row['price_month']),
    summer_price_month: num(row['summer_price_month']),
    deposit: num(row['deposit']),
    commission: num(row['commission']),
    seasonal_pricing: Boolean(row['seasonal_pricing']),
    area: num(row['area']),
    land_area: num(row['land_area']),
    utilities_month: num(row['utilities_month']),
    outdoor_spaces: Array.isArray(row['outdoor_spaces']) ? (row['outdoor_spaces'] as string[]) : [],
    appliances: Array.isArray(row['appliances']) ? (row['appliances'] as string[]) : [],
    bathroom_features: Array.isArray(row['bathroom_features'])
      ? (row['bathroom_features'] as string[])
      : [],
    extra_features: Array.isArray(row['extra_features']) ? (row['extra_features'] as string[]) : [],
    location_description: typeof row['location_description'] === "string"
      ? (row['location_description'] as string)
      : "",
    rent_terms: typeof row['rent_terms'] === "string" ? (row['rent_terms'] as string) : "",
    internal_name:
      typeof row['internal_name'] === "string" ? (row['internal_name'] as string) : "",
    card_highlights: Array.isArray(row['card_highlights'])
      ? (row['card_highlights'] as string[])
      : [],
    service_type: (row['service_type'] === "commission_only"
      ? "commission_only"
      : "management") as ServiceType,
    management_fee_type: (row['management_fee_type'] === "amount"
      ? "amount"
      : "percent") as ManagementFeeType,
    management_fee_value: num(row['management_fee_value']),
    beds_count: num(row['beds_count']),
    repair_type: typeof row['repair_type'] === "string" ? (row['repair_type'] as string) : "",
    wc_location_type:
      typeof row['wc_location_type'] === "string" ? (row['wc_location_type'] as string) : "",
    land_status: typeof row['land_status'] === "string" ? (row['land_status'] as string) : "",
    cian_jk_id: num(row['cian_jk_id']),
    is_apartments: typeof row['is_apartments'] === "boolean" ? (row['is_apartments'] as boolean) : null,
    availability_note:
      typeof row['availability_note'] === "string" ? (row['availability_note'] as string) : "",
    sort_order: num(row['sort_order']),
  };
}

/** Сохраняет порядок объектов в календаре (перетаскивание строк). */
export async function savePropertyOrder(ids: string[]) {
  await Promise.all(
    ids.map((id, index) =>
      supabase
        .from("properties")
        .update({ sort_order: index } as never)
        .eq("id", id),
    ),
  );
}


export async function fetchProperties(): Promise<Property[]> {
  const data = await listStaffProperties();
  return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
}

export async function fetchPublishedProperties(): Promise<Property[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
}

export async function fetchProperty(id: string): Promise<Property> {
  const data = await getStaffProperty({ data: { id } });
  if (!data) throw new Error("Объект не найден");
  return normalize(data as Record<string, unknown>);
}

export type PropertyInput = {
  title: string;
  internal_name: string;
  type: PropertyType;
  complex_id: string | null;
  complex_name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  floor: number | null;
  total_floors: number | null;
  rooms: number;
  bathrooms: number;
  status: PropertyStatus;
  description: string;
  photos: PropertyPhoto[];
  published: boolean;
  price_month: number | null;
  seasonal_pricing: boolean;
  summer_price_month: number | null;
  deposit: number | null;
  commission: number | null;
  area: number | null;
  land_area: number | null;
  outdoor_spaces: string[];
  appliances: string[];
  bathroom_features: string[];
  utilities_month: number | null;
  extra_features: string[];
  location_description: string;
  rent_terms: string;
  card_highlights: string[];
  service_type: ServiceType;
  management_fee_type: ManagementFeeType;
  management_fee_value: number | null;
  availability_note: string;
  beds_count: number | null;
  repair_type: string;
  wc_location_type: string;
  land_status: string;
  cian_jk_id: number | null;
  is_apartments: boolean | null;
};

/** Базовый текст условий аренды — подставляется в форму и редактируется. */
export const DEFAULT_RENT_TERMS = [
  "Коммунальные платежи оплачиваются отдельно",
  "Проживание с домашними животными обсуждается индивидуально",
  "Страховой депозит вносится при заселении и возвращается при выезде, при условии сохранности имущества",
  "Договор заключается на срок от 11 месяцев",
].join("\n");


export async function createProperty(input: PropertyInput) {
  const { data, error } = await supabase
    .from("properties")
    .insert(input as never)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function updateProperty(id: string, input: Partial<PropertyInput>) {
  const { error } = await supabase
    .from("properties")
    .update(input as never)
    .eq("id", id);
  if (error) throw error;
}

export async function setPropertyStatus(id: string, status: PropertyStatus) {
  return updateProperty(id, { status });
}

/** Удаляет объект. Бронирования на объект блокируют удаление. */
export async function deleteProperty(id: string) {
  const { count, error: countError } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("property_id", id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error("У объекта есть бронирования — сначала удалите их в календаре");
  }
  const { error } = await supabase.from("properties").delete().eq("id", id);
  if (error) throw error;
}


/** Сетевой сбой (нет ответа сервера), а не отказ хранилища. */
function isNetworkFailure(error: unknown): boolean {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? "");
  return /failed to fetch|load failed|network|fetch failed|aborted/i.test(message);
}

/** Запасная загрузка через наш сервер — когда прямой запрос в хранилище не проходит. */
async function uploadPhotoViaServer(file: File): Promise<PropertyPhoto> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Требуется вход в систему");
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await fetch("/api/photo-upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const payload = (await response.json().catch(() => null)) as
    | { path?: string; error?: string }
    | null;
  if (!response.ok || !payload?.path) {
    throw new Error(payload?.error || "Не удалось загрузить файл");
  }
  return { path: payload.path };
}

export async function uploadPhoto(file: File): Promise<PropertyPhoto> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `uploads/${crypto.randomUUID()}.${ext}`;
  try {
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw error;
    return { path };
  } catch (error) {
    // Сетевой сбой — пробуем ещё раз, затем через наш сервер.
    if (!isNetworkFailure(error)) throw error;
    try {
      const retry = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (!retry.error) return { path };
    } catch {
      // игнорируем — уходим на запасной путь
    }
    return uploadPhotoViaServer(file);
  }
}

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(unique, 60 * 60 * 6);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

const MONTHS_GEN = [
  "января","февраля","марта","апреля","мая","июня",
  "июля","августа","сентября","октября","ноября","декабря",
];

/** «01 ноября 2026» */
export function formatDateLongRu(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d ?? 1).padStart(2, "0")} ${MONTHS_GEN[(m ?? 1) - 1]} ${y}`;
}

export type PublicStatusView = { text: string; tone: "green" | "red" | "yellow" | "gold" } | null;

/**
 * Статус объекта для публичных страниц.
 * freeFromIso — первый свободный день (конец текущей аренды + 1),
 * используется только для объектов на управлении.
 */
export function publicStatusView(
  p: { status: PropertyStatus; service_type?: ServiceType },
  freeFromIso?: string | null,
): PublicStatusView {
  if (p.status === "free") return { text: "Сейчас свободно", tone: "green" };
  if (p.status === "soon_free") {
    if (freeFromIso) {
      return { text: `Освободится с ${formatDateLongRu(freeFromIso)}`, tone: "gold" };
    }
    return { text: "Скоро освободится", tone: "gold" };
  }
  if (p.status === "booked") return { text: "Объект забронирован", tone: "yellow" };
  if (p.status === "rented") {
    if ((p.service_type ?? "management") === "management" && freeFromIso) {
      const days = Math.ceil(
        (new Date(`${freeFromIso}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) /
          86400000,
      );
      if (days >= 0 && days < 30) {
        return { text: `Освободится с ${formatDateLongRu(freeFromIso)}`, tone: "gold" };
      }
    }
    return { text: "Объект сдан", tone: "red" };
  }
  return null;
}

export const STATUS_TONE_CLASS: Record<"green" | "red" | "yellow" | "gold", string> = {
  green: "text-site-green",
  red: "text-site-red",
  yellow: "text-site-yellow",
  gold: "text-site-gold",
};

/** React Query-опции для публичной страницы объекта. */
export function propertyQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["properties", id],
    queryFn: () => fetchProperty(id),
  });
}

/** Короткое существительное типа объекта (им.п., мн.ч. для апартаментов). */
export function propertyTypeNoun(value: PropertyType) {
  switch (value) {
    case "apartment":
    case "aparts":
      return "апартаменты";
    case "house":
    case "villa":
      return "дом";
    case "townhouse":
      return "таунхаус";
  }
}

function ucFirst(s: string) {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

function fitMetaTitle(core: string): string {
  const suffix = " — Резиденция&Море";
  const maxCore = 60 - suffix.length - 1; // оставляем место для многоточия
  if ((core + suffix).length <= 60) return core + suffix;
  const trimmed = core.slice(0, Math.max(1, maxCore)).replace(/\s+$/, "");
  return `${trimmed}…${suffix}`;
}

/** Title страницы объекта (стараемся уложиться в 60 символов). */
export function propertyMetaTitle(p: Property) {
  const type = propertyTypeNoun(p.type);
  const area = p.area ? formatArea(p.area) : "";
  const price = p.price_month ? formatMoney(p.price_month) : "";
  const core = `${p.title}, ${ucFirst(type)}${area ? `, ${area}` : ""}${price ? `, ${price}/мес` : ""}`;
  return fitMetaTitle(core);
}

/** Description страницы объекта (стараемся уложиться в 160 символов). */
export function propertyMetaDescription(p: Property) {
  const parts: string[] = [`Сдаётся ${propertyTypeNoun(p.type)} в Сочи`];
  if (p.area) parts.push(formatArea(p.area));
  if (p.rooms != null) parts.push(roomsLabel(p.rooms));
  if (p.price_month) parts.push(`${formatMoney(p.price_month)}/мес`);
  const location = p.complex_id ? p.complex_name : shortAddress(p.address);
  if (location) parts.push(location);
  const sentence = parts.join(" — ") + ". Аренда премиум-недвижимости в Сочи от Резиденция&Море.";
  if (sentence.length <= 160) return sentence;
  return sentence.slice(0, 159).replace(/\s+$/, "") + "…";
}
