import { supabase } from "@/integrations/supabase/client";

export type RentalStatus = "booked" | "rented" | "blocked";

export type Rental = {
  id: string;
  property_id: string;
  start_date: string;
  end_date: string;
  status: RentalStatus;
  tenant_name: string;
  tenant_id: string | null;
  comment: string;
};

/** Периоды аренды, пересекающиеся с интервалом [from, to] (ISO yyyy-mm-dd). */
export async function fetchRentals(from: string, to: string): Promise<Rental[]> {
  const { data, error } = await supabase
    .from("rentals")
    .select("id, property_id, start_date, end_date, status, tenant_name, tenant_id, comment")
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Rental[];
}

export function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISODate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function eachDay(from: Date, to: Date) {
  const days: Date[] = [];
  let cursor = new Date(from);
  while (cursor <= to && days.length < 400) {
    days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}

export const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export const WEEKDAYS_SHORT = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];

export function formatDateRu(value: string) {
  const d = parseISODate(value);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}
