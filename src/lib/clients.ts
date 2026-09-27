import { supabase } from "@/integrations/supabase/client";
import type { Booking } from "@/lib/bookings";
import { toISODate } from "@/lib/rentals";
import { getStaffClient, listStaffClients } from "@/lib/staff-data.functions";

import { asPortfolios, type Portfolio } from "@/lib/portfolios";

/** Кто клиент в CRM: арендатор РМ, собственник или Н11. */
export type ClientPartyKind = "rm" | "owner" | "n11";

export const CLIENT_PARTY_KINDS: { value: ClientPartyKind; label: string }[] = [
  { value: "rm", label: "РМ" },
  { value: "owner", label: "Собственник" },
  { value: "n11", label: "Н11" },
];

export function asPartyKind(value: unknown): ClientPartyKind {
  if (value === "owner" || value === "n11") return value;
  return "rm";
}

export function partyKindLabel(value: ClientPartyKind | string | null | undefined) {
  return CLIENT_PARTY_KINDS.find((item) => item.value === value)?.label ?? value ?? "—";
}

export type CrmClient = {
  id: string;
  full_name: string;
  phone: string;
  comment: string;
  blacklisted: boolean;
  blacklist_reason: string;
  portfolios: Portfolio[];
  party_kind: ClientPartyKind;
  /** Источник обращения — тот же список, что у сделки. */
  source: string;
  /** Аккаунт Telegram (@username). */
  telegram: string;
  /** По какому объекту обратился. */
  property_id: string | null;
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

function mapClient(
  c: CrmClient & {
    party_kind?: unknown;
    source?: unknown;
    telegram?: unknown;
    property_id?: unknown;
  },
): CrmClient {
  return {
    ...c,
    portfolios: asPortfolios(c.portfolios),
    party_kind: asPartyKind(c.party_kind),
    source: typeof c.source === "string" ? c.source : "",
    telegram: typeof c.telegram === "string" ? c.telegram : "",
    property_id: typeof c.property_id === "string" ? c.property_id : null,
  };
}

export async function fetchCrmClients(): Promise<CrmClient[]> {
  const data = await listStaffClients();
  return ((data ?? []) as CrmClient[]).map(mapClient);
}

export async function fetchCrmClient(id: string): Promise<CrmClient | null> {
  const data = await getStaffClient({ data: { id } });
  if (!data) return null;
  return mapClient(data as CrmClient);
}

export type ClientInput = {
  full_name: string;
  phone: string;
  comment: string;
  blacklisted: boolean;
  blacklist_reason: string;
  portfolios: Portfolio[];
  party_kind: ClientPartyKind;
  source: string;
  telegram: string;
  property_id: string | null;
};

function stripMissingClientColumns(message: string, row: Record<string, unknown>) {
  let next = { ...row };
  if (/party_kind|schema cache|could not find/i.test(message) && "party_kind" in next) {
    const { party_kind: _pk, ...rest } = next;
    next = rest;
  }
  if (
    /source|telegram|property_id|schema cache|could not find/i.test(message) &&
    ("source" in next || "telegram" in next || "property_id" in next)
  ) {
    const { source: _s, telegram: _t, property_id: _p, ...rest } = next;
    next = rest;
  }
  return next;
}

export async function saveClient(id: string | null, input: ClientInput) {
  const write = async (row: Record<string, unknown>) =>
    id
      ? supabase.from("clients").update(row as never).eq("id", id)
      : supabase.from("clients").insert(row as never).select("id").single();

  let row: Record<string, unknown> = { ...input };
  let result = await write(row);
  if (result.error) {
    const stripped = stripMissingClientColumns(result.error.message, row);
    if (JSON.stringify(stripped) !== JSON.stringify(row)) {
      row = stripped;
      result = await write(row);
    }
  }
  if (result.error) throw result.error;
  if (id) return id;
  return (result.data as { id: string }).id;
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
