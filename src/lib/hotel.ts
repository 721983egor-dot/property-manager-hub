import type { Booking } from "@/lib/bookings";
import type { Property } from "@/lib/properties";
import { PORTFOLIOS, type Portfolio } from "@/lib/portfolios";
import { addDays, eachDay, parseISODate, toISODate } from "@/lib/rentals";

export type HotelRoomCategory = {
  id: string;
  code: string;
  name: string;
  description: string;
  guests: number;
  area: number | null;
  price_night: number | null;
  sort_order: number;
  bnovo_room_type_id: string | null;
};

export type Owner = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  comment: string;
  user_id: string | null;
  created_at: string;
};

export type PropertyOwnerLink = {
  id: string;
  property_id: string;
  owner_id: string;
  share_percent: number | null;
};

export type BnovoSyncRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "error" | string;
  summary: string;
  details: Record<string, unknown>;
};

export type OccupancyStat = {
  rooms: number;
  roomNights: number;
  occupied: number;
  percent: number;
};

export function isHotelProperty(property: Pick<Property, "portfolio">) {
  return property.portfolio === "n11";
}

export function nightsBetween(start: string, end: string) {
  const from = parseISODate(start);
  const to = parseISODate(end);
  const ms = to.getTime() - from.getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

/** Последняя ночь проживания: день выезда в отеле обычно свободен. */
export function lastOccupiedNight(arrival: string, departure: string) {
  if (!departure || departure <= arrival) return arrival;
  return toISODate(addDays(parseISODate(departure), -1));
}

export function occupancyOf(
  rooms: Pick<Property, "id">[],
  bookings: Pick<Booking, "property_id" | "start_date" | "end_date" | "status">[],
  from: string,
  to: string,
): OccupancyStat {
  const days = eachDay(parseISODate(from), parseISODate(to));
  const roomNights = rooms.length * days.length;
  if (roomNights === 0) return { rooms: rooms.length, roomNights: 0, occupied: 0, percent: 0 };
  const active = bookings.filter((b) => b.status !== "cancelled");
  let occupied = 0;
  for (const room of rooms) {
    for (const day of days) {
      const iso = toISODate(day);
      if (
        active.some(
          (booking) =>
            booking.property_id === room.id &&
            booking.start_date <= iso &&
            booking.end_date >= iso,
        )
      ) {
        occupied += 1;
      }
    }
  }
  return {
    rooms: rooms.length,
    roomNights,
    occupied,
    percent: Math.round((occupied / roomNights) * 1000) / 10,
  };
}

export function groupHotelRooms<T extends Pick<Property, "id" | "room_category_id" | "sort_order" | "internal_name" | "title">>(
  rooms: T[],
  categories: HotelRoomCategory[],
) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const groups: { category: HotelRoomCategory | null; rooms: T[] }[] = [];
  const seen = new Set<string | null>();
  const ordered = [...rooms].sort((a, b) => {
    const ca = a.room_category_id ? (byId.get(a.room_category_id)?.sort_order ?? 999) : 999;
    const cb = b.room_category_id ? (byId.get(b.room_category_id)?.sort_order ?? 999) : 999;
    if (ca !== cb) return ca - cb;
    const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.internal_name || a.title).localeCompare(b.internal_name || b.title, "ru");
  });
  for (const room of ordered) {
    const key = room.room_category_id;
    if (!seen.has(key)) {
      seen.add(key);
      groups.push({ category: key ? byId.get(key) ?? null : null, rooms: [] });
    }
    groups[groups.length - 1]!.rooms.push(room);
  }
  return groups;
}

export function portfolioBadge(value: Portfolio) {
  return PORTFOLIOS.find((p) => p.value === value) ?? PORTFOLIOS[1]!;
}
