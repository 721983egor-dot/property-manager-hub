import { supabase } from "@/integrations/supabase/client";

export type PropertyType = "apartment" | "aparts" | "house" | "villa" | "townhouse";
export type PropertyStatus = "free" | "rented" | "booked" | "archived";

export type PropertyPhoto = { path: string };

export type Property = {
  id: string;
  ref_id: number;
  title: string;
  type: PropertyType;
  complex_name: string;
  complex_id: string | null;
  floor: number | null;
  total_floors: number | null;
  rooms: number;
  bathrooms: number;
  status: PropertyStatus;
  description: string;
  photos: PropertyPhoto[];
  created_at: string;
  updated_at: string;
};

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

function normalize(row: Record<string, unknown>): Property {
  const photos = Array.isArray(row['photos']) ? (row['photos'] as PropertyPhoto[]) : [];
  return { ...(row as unknown as Property), photos };
}

export async function fetchProperties(): Promise<Property[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
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
  complex_name: string;
  floor: number | null;
  total_floors: number | null;
  rooms: number;
  bathrooms: number;
  status: PropertyStatus;
  description: string;
  photos: PropertyPhoto[];
};

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
