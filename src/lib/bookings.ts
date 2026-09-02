import { supabase } from "@/integrations/supabase/client";

export type BookingStatus = "active" | "cancelled" | "completed";
export type BookingSource = "avito" | "cian" | "website" | "social" | "referral";
export type BookingPriceType = "fixed" | "periodic";

export type Client = {
  id: string;
  full_name: string;
  phone: string;
};

export type BookingPricePeriod = {
  id?: string;
  start_date: string;
  end_date: string;
  price_month: number;
};

export type Booking = {
  id: string;
  property_id: string;
  client_id: string;
  start_date: string;
  end_date: string;
  price_type: BookingPriceType;
  price_month: number | null;
  payment_day: number;
  deposit: number | null;
  source: BookingSource | null;
  status: BookingStatus;
  comment: string;
  client: Client | null;
  periods: BookingPricePeriod[];
};

export const BOOKING_SOURCES: { value: BookingSource; label: string }[] = [
  { value: "avito", label: "Авито" },
  { value: "cian", label: "Циан" },
  { value: "website", label: "Сайт" },
  { value: "social", label: "Социальные сети" },
  { value: "referral", label: "Рекомендация" },
];

export const BOOKING_STATUSES: { value: BookingStatus; label: string }[] = [
  { value: "active", label: "Активно" },
  { value: "completed", label: "Завершено" },
  { value: "cancelled", label: "Отменено" },
];

export function sourceLabel(value: BookingSource | null) {
  return BOOKING_SOURCES.find((s) => s.value === value)?.label ?? "—";
}

export function statusLabel(value: BookingStatus) {
  return BOOKING_STATUSES.find((s) => s.value === value)?.label ?? value;
}

/** Фамилия и имя клиента (первые два слова ФИО). */
export function shortName(fullName: string) {
  return fullName.trim().split(/\s+/).slice(0, 2).join(" ");
}

/** Нормализация телефона для сравнения дублей. */
export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

/** Фактическая дата ежемесячной оплаты (если числа нет в месяце — последний день). */
export function paymentDateFor(year: number, month: number, day: number) {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

/** Актуальная стоимость в месяц на дату (ISO). */
export function priceOn(booking: Booking, iso: string): number | null {
  if (booking.price_type === "periodic") {
    const period = booking.periods.find((p) => p.start_date <= iso && p.end_date >= iso);
    return period ? period.price_month : (booking.periods[0]?.price_month ?? null);
  }
  return booking.price_month;
}

const SELECT =
  "id, property_id, client_id, start_date, end_date, price_type, price_month, payment_day, deposit, source, status, comment, clients(id, full_name, phone), booking_price_periods(id, start_date, end_date, price_month)";

function normalize(row: Record<string, unknown>): Booking {
  const client = (row['clients'] ?? null) as Client | null;
  const periods = (row['booking_price_periods'] ?? []) as BookingPricePeriod[];
  return {
    ...(row as unknown as Booking),
    client,
    periods: [...periods]
      .map((p) => ({ ...p, price_month: Number(p.price_month) }))
      .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    price_month: row['price_month'] == null ? null : Number(row['price_month']),
    deposit: row['deposit'] == null ? null : Number(row['deposit']),
  };
}

export async function fetchBookings(from: string, to: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(SELECT)
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
}

export async function fetchCurrentBooking(
  propertyId: string,
  todayIso: string,
): Promise<Booking | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select(SELECT)
    .eq("property_id", propertyId)
    .neq("status", "cancelled")
    .lte("start_date", todayIso)
    .gte("end_date", todayIso)
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0];
  return row ? normalize(row as Record<string, unknown>) : null;
}

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, full_name, phone")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Client[];
}

export async function createClient(input: { full_name: string; phone: string }) {
  const { data, error } = await supabase
    .from("clients")
    .insert(input as never)
    .select("id, full_name, phone")
    .single();
  if (error) throw error;
  return data as Client;
}

export type BookingInput = {
  property_id: string;
  client_id: string;
  start_date: string;
  end_date: string;
  price_type: BookingPriceType;
  price_month: number | null;
  payment_day: number;
  deposit: number | null;
  source: BookingSource | null;
  status: BookingStatus;
  comment: string;
  periods: BookingPricePeriod[];
};

export async function saveBooking(id: string | null, input: BookingInput) {
  const { periods, ...row } = input;
  let bookingId = id;
  if (id) {
    const { error } = await supabase.from("bookings").update(row as never).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("bookings")
      .insert(row as never)
      .select("id")
      .single();
    if (error) throw error;
    bookingId = (data as { id: string }).id;
  }

  await supabase.from("booking_price_periods").delete().eq("booking_id", bookingId!);
  if (input.price_type === "periodic" && periods.length > 0) {
    const { error } = await supabase.from("booking_price_periods").insert(
      periods.map((p) => ({
        booking_id: bookingId!,
        start_date: p.start_date,
        end_date: p.end_date,
        price_month: p.price_month,
      })) as never,
    );
    if (error) throw error;
  }
  return bookingId!;
}

/** Отмечает объект как «Сдан», когда появляется активное бронирование. */
export async function markPropertyRented(propertyId: string) {
  const { error } = await supabase
    .from("properties")
    .update({ status: "rented" } as never)
    .eq("id", propertyId);
  if (error) throw error;
}

/** Удаляет бронирование и его периоды; запись клиента сохраняется. */
export async function deleteBooking(id: string) {
  const { error: periodsError } = await supabase
    .from("booking_price_periods")
    .delete()
    .eq("booking_id", id);
  if (periodsError) throw periodsError;
  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) throw error;
}

/** Все бронирования (для CRM). */
export async function fetchAllBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(SELECT)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
}

/** Бронирования конкретного клиента, от новых к старым. */
export async function fetchClientBookings(clientId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(SELECT)
    .eq("client_id", clientId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
}
