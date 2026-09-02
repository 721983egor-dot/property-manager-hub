import { supabase } from "@/integrations/supabase/client";
import type { PropertyPhoto } from "@/lib/properties";

export type Complex = {
  id: string;
  name: string;
  description: string;
  location_description: string;
  photos: PropertyPhoto[];
  main_photo: string | null;
  infrastructure: string[];
  created_at: string;
  updated_at: string;
};

export const INFRASTRUCTURE_OPTIONS = [
  { value: "pool", label: "Бассейн" },
  { value: "gated", label: "Закрытая территория" },
  { value: "parking", label: "Парковка" },
  { value: "near_sea", label: "Рядом с морем" },
  { value: "fountain", label: "Фонтан" },
  { value: "security", label: "Охрана" },
  { value: "playground", label: "Детская площадка" },
  { value: "beach", label: "Пляж" },
];

export function infrastructureLabel(value: string) {
  return INFRASTRUCTURE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Главное фото комплекса: явно выбранное либо первое из списка. */
export function mainPhotoPath(complex: Pick<Complex, "photos" | "main_photo">) {
  if (complex.main_photo) return complex.main_photo;
  return complex.photos[0]?.path ?? null;
}

function normalize(row: Record<string, unknown>): Complex {
  return {
    ...(row as unknown as Complex),
    photos: Array.isArray(row['photos']) ? (row['photos'] as PropertyPhoto[]) : [],
    infrastructure: Array.isArray(row['infrastructure'])
      ? (row['infrastructure'] as string[])
      : [],
    main_photo: typeof row['main_photo'] === "string" ? (row['main_photo'] as string) : null,
    description: typeof row['description'] === "string" ? (row['description'] as string) : "",
    location_description:
      typeof row['location_description'] === "string" ? (row['location_description'] as string) : "",
  };
}

export async function fetchComplexes(): Promise<Complex[]> {
  const { data, error } = await supabase
    .from("complexes")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
}

export async function fetchComplex(id: string): Promise<Complex> {
  const { data, error } = await supabase.from("complexes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Комплекс не найден");
  return normalize(data as Record<string, unknown>);
}

export type ComplexInput = {
  name: string;
  description: string;
  location_description: string;
  photos: PropertyPhoto[];
  main_photo: string | null;
  infrastructure: string[];
};

export async function createComplex(input: ComplexInput): Promise<Complex> {
  const { data, error } = await supabase
    .from("complexes")
    .insert(input as never)
    .select("*")
    .single();
  if (error) throw error;
  return normalize(data as Record<string, unknown>);
}

export async function updateComplex(id: string, input: Partial<ComplexInput>) {
  const { error } = await supabase
    .from("complexes")
    .update(input as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteComplex(id: string) {
  const { error } = await supabase.from("complexes").delete().eq("id", id);
  if (error) throw error;
}
