import { supabase } from "@/integrations/supabase/client";
import type { Booking } from "@/lib/bookings";
import { toISODate } from "@/lib/rentals";

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

export async function fetchCrmClients(): Promise<CrmClient[]> {
  const { data, error } = await supabase
    .from("clients")
    .select(SELECT)
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CrmClient[];
}

export async function fetchCrmClient(id: string): Promise<CrmClient | null> {
  const { data, error } = await supabase.from("clients").select(SELECT).eq("id", id).limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as CrmClient) ?? null;
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
