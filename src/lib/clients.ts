import { supabase } from "@/integrations/supabase/client";
import type { Booking } from "@/lib/bookings";
import { toISODate } from "@/lib/rentals";
import { getStaffClient, listStaffClients } from "@/lib/staff-data.functions";

export type CrmClient = {
  id: string;
  full_name: string;
  phone: string;
  comment: string;
  blacklisted: boolean;
  blacklist_reason: string;
};

export type ClientStatus = "renting" | "booked" | "left" | "none";

export const CLIENT_STATUSES: { value: ClientStatus; label: string }[] = [
  { value: "renting", label: "Арендует" },
  { value: "booked", label: "Забронировал" },
  { value: "left", label: "Съехал" },
  { value: "none", label: "Без бронирований" },
];

export function clientStatusLabel(status: ClientStatus) {
  return CLIENT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

const SELECT = "id, full_name, phone, comment, blacklisted, blacklist_reason";

/** Нормализация цифр телефона: Российский номер с 8 → 7, результат без '+'.
 *  Примеры: 8 900 001 51 96 → 79000015196, +7 900 001 51 96 → 79000015196. */
export function phoneDigits(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return "7" + digits.slice(1);
  if (digits.length === 11 && digits.startsWith("7")) return digits;
  return digits;
}

/** Отформатированный телефон для отображения: +7 900 001-51-96. */
export function formatPhone(phone: string) {
  const digits = phoneDigits(phone);
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return phone.trim() || "";
}

/** Ссылки для связи с клиентом. */
export function telLink(phone: string) {
  const digits = phoneDigits(phone);
  if (digits.length === 11) return `tel:+${digits}`;
  return `tel:${phone.trim()}`;
}
export function waLink(phone: string) {
  const digits = phoneDigits(phone);
  if (digits.length === 11) return `https://wa.me/${digits}`;
  return "#";
}
export function tgLink(phone: string) {
  const digits = phoneDigits(phone);
  if (digits.length === 11) return `https://t.me/+${digits}`;
  return "#";
}
export function maxLink(phone: string) {
  const digits = phoneDigits(phone);
  if (digits.length === 11) return `https://max.ru/u/+${digits}`;
  return "#";
}
export function hasCallablePhone(phone: string) {
  return phoneDigits(phone).length === 11;
}

export async function fetchCrmClients(): Promise<CrmClient[]> {
  const data = await listStaffClients();
  return (data ?? []) as CrmClient[];
}

export async function fetchCrmClient(id: string): Promise<CrmClient | null> {
  const data = await getStaffClient({ data: { id } });
  return (data as CrmClient | null) ?? null;
}

export type ClientInput = {
  full_name: string;
  phone: string;
  comment: string;
  blacklisted: boolean;
  blacklist_reason: string;
};

export async function saveClient(id: string | null, input: ClientInput) {
  if (id) {
    const { error } = await supabase.from("clients").update(input as never).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("clients")
    .insert(input as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteClient(id: string) {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}

/** Активные бронирования клиента (отменённые не учитываются). */
function activeOf(bookings: Booking[]) {
  return bookings.filter((b) => b.status !== "cancelled");
}

export function currentBookingOf(bookings: Booking[], today = toISODate(new Date())) {
  return (
    activeOf(bookings).find(
      (b) => b.status === "active" && b.start_date <= today && b.end_date >= today,
    ) ?? null
  );
}

export function upcomingBookingOf(bookings: Booking[], today = toISODate(new Date())) {
  return (
    activeOf(bookings)
      .filter((b) => b.status === "active" && b.start_date > today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null
  );
}

export function clientStatusOf(bookings: Booking[], today = toISODate(new Date())): ClientStatus {
  const relevant = activeOf(bookings);
  if (relevant.length === 0) return "none";
  if (currentBookingOf(relevant, today)) return "renting";
  if (upcomingBookingOf(relevant, today)) return "booked";
  return "left";
}

/** Цвет полосы бронирования в карточке клиента. */
export function bookingTone(booking: Booking, today = toISODate(new Date())) {
  if (booking.status === "cancelled") return "border-red-200 bg-red-50";
  if (booking.status === "completed") return "border-border bg-muted/50";
  if (booking.start_date <= today && booking.end_date >= today)
    return "border-emerald-200 bg-emerald-50";
  if (booking.start_date > today) return "border-amber-200 bg-amber-50";
  return "border-border bg-muted/50";
}
