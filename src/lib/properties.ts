import { supabase } from "@/integrations/supabase/client";

export type PropertyType = "apartment" | "aparts" | "house" | "villa" | "townhouse";
export type PropertyStatus = "free" | "rented" | "booked" | "archived";

export type PropertyPhoto = { path: string };

export type Property = {
  id: string;
  published: boolean;
  ref_id: number;
  title: string;
  type: PropertyType;
  complex_name: string;
  complex_id: string | null;
  address: string;
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
  outdoor_spaces: string[];
  appliances: string[];
  bathroom_features: string[];
  utilities_month: number | null;
  extra_features: string[];
  location_description: string;
  rent_terms: string;
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
  return EXTRA_FEATURE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function labelsFor(
  options: { value: string; label: string }[],
  values: string[] | null | undefined,
) {
  return (values ?? []).map((v) => options.find((o) => o.value === v)?.label ?? v);
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


export const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "apartment", label: "Квартира" },
  { value: "aparts", label: "Апартаменты" },
  { value: "house", label: "Дом" },
  { value: "villa", label: "Вилла" },
  { value: "townhouse", label: "Таунхаус" },
];

export const PROPERTY_STATUSES: { value: PropertyStatus; label: string }[] = [
  { value: "free", label: "Свободен" },
  { value: "rented", label: "Сдан" },
  { value: "booked", label: "Забронирован" },
  { value: "archived", label: "Архив" },
];

export const ROOM_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];
export const BATHROOM_OPTIONS = [1, 2, 3, 4, 5];

export const PHOTO_BUCKET = "property-photos";

export function typeLabel(value: PropertyType) {
  return PROPERTY_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function statusLabel(value: PropertyStatus) {
  return PROPERTY_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export function roomsLabel(rooms: number) {
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
    price_month: num(row['price_month']),
    summer_price_month: num(row['summer_price_month']),
    deposit: num(row['deposit']),
    commission: num(row['commission']),
    seasonal_pricing: Boolean(row['seasonal_pricing']),
    area: num(row['area']),
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
  };
}


export async function fetchProperties(): Promise<Property[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
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
  const { data, error } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Объект не найден");
  return normalize(data as Record<string, unknown>);
}

export type PropertyInput = {
  title: string;
  type: PropertyType;
  complex_id: string | null;
  complex_name: string;
  address: string;
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
  outdoor_spaces: string[];
  appliances: string[];
  bathroom_features: string[];
  utilities_month: number | null;
  extra_features: string[];
  location_description: string;
  rent_terms: string;
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

export async function uploadPhoto(file: File): Promise<PropertyPhoto> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `uploads/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return { path };
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
