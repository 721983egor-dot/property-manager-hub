import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";
import { shortName, type Booking } from "@/lib/bookings";
import type { HotelRoomCategory, OccupancyStat } from "@/lib/hotel";
import { occupancyOf } from "@/lib/hotel";
import type { Property } from "@/lib/properties";
import { toISODate } from "@/lib/rentals";

const BOOKING_COLUMNS =
  "id, property_id, client_id, start_date, end_date, price_type, price_month, price_night, payment_day, deposit, source, status, comment, stay_kind, clients(id, full_name)";

export type OwnerArrival = {
  bookingId: string;
  propertyId: string;
  propertyLabel: string;
  categoryName: string | null;
  startDate: string;
  endDate: string;
  guestName: string;
  unassigned: boolean;
};

export type OwnerCabinet = {
  owner: { id: string; full_name: string; email: string };
  categories: HotelRoomCategory[];
  /** Только юниты собственника (без полос «без номера»). */
  rooms: Property[];
  /** Юниты + полосы «без номера» категорий собственника — для календаря. */
  calendarRooms: Property[];
  bookings: Booking[];
  occupancy: OccupancyStat;
  occupancyByCategory: { category: HotelRoomCategory; occupancy: OccupancyStat }[];
  nextArrivals: OwnerArrival[];
  from: string;
  to: string;
};

function mapBookingRow(row: Record<string, unknown>): Booking {
  const clientRaw = row["clients"] as { id?: string; full_name?: string } | null;
  const fullName = clientRaw?.full_name?.trim() || "Гость";
  return {
    ...(row as unknown as Booking),
    client: clientRaw
      ? { id: clientRaw.id ?? "", full_name: shortName(fullName), phone: "" }
      : null,
    periods: [],
  };
}

function propertyLabel(room: Pick<Property, "internal_name" | "title" | "is_unassigned_lane">) {
  if (room.is_unassigned_lane) return "без номера";
  return room.internal_name || room.title || "номер";
}

export const getOwnerCabinet = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { from?: string; to?: string } | undefined)
  .handler(async ({ context, data }): Promise<OwnerCabinet> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owner, error } = await supabaseAdmin
      .from("owners")
      .select("id, full_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!owner) throw new Error("Кабинет собственника не найден");

    const today = new Date();
    const todayIso = toISODate(today);
    const from = data?.from || toISODate(new Date(today.getFullYear(), today.getMonth(), 1));
    const to =
      data?.to || toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

    const empty = (): OwnerCabinet => ({
      owner: owner as OwnerCabinet["owner"],
      categories: [],
      rooms: [],
      calendarRooms: [],
      bookings: [],
      occupancy: { rooms: 0, roomNights: 0, occupied: 0, percent: 0 },
      occupancyByCategory: [],
      nextArrivals: [],
      from,
      to,
    });

    const { data: links, error: linkError } = await supabaseAdmin
      .from("property_owners")
      .select("property_id, share_percent")
      .eq("owner_id", (owner as { id: string }).id);
    if (linkError) throw new Error(linkError.message);
    const ownedIds = (links ?? []).map((l) => l.property_id as string);
    if (ownedIds.length === 0) return empty();

    const [{ data: ownedRooms, error: roomError }, { data: categories, error: catError }] =
      await Promise.all([
        supabaseAdmin.from("properties").select("*").in("id", ownedIds),
        supabaseAdmin.from("hotel_room_categories").select("*").order("sort_order"),
      ]);
    if (roomError) throw new Error(roomError.message);
    if (catError) throw new Error(catError.message);

    const rooms = ((ownedRooms ?? []) as unknown as Property[]).filter(
      (r) => !r.is_unassigned_lane,
    );
    const categoryIds = [
      ...new Set(rooms.map((r) => r.room_category_id).filter(Boolean) as string[]),
    ];

    let laneRooms: Property[] = [];
    if (categoryIds.length > 0) {
      const { data: lanes, error: laneError } = await supabaseAdmin
        .from("properties")
        .select("*")
        .eq("portfolio", "n11" as never)
        .eq("is_unassigned_lane", true)
        .in("room_category_id", categoryIds);
      if (laneError) throw new Error(laneError.message);
      laneRooms = (lanes ?? []) as unknown as Property[];
    }

    const calendarRooms = [...laneRooms, ...rooms];
    const calendarIds = calendarRooms.map((r) => r.id);
    const cats = (categories ?? []) as HotelRoomCategory[];
    const catsById = new Map(cats.map((c) => [c.id, c]));

    const { data: bookingRows, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .in("property_id", calendarIds)
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date", { ascending: true });
    if (bookingError) throw new Error(bookingError.message);

    const mappedBookings = (bookingRows ?? []).map((row) =>
      mapBookingRow(row as Record<string, unknown>),
    );

    // Ближайшие заезды: свои юниты + полосы категорий (без чужих номеров).
    const { data: upcomingRows, error: upcomingError } = await supabaseAdmin
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .in("property_id", calendarIds)
      .neq("status", "cancelled")
      .gte("start_date", todayIso)
      .order("start_date", { ascending: true })
      .limit(12);
    if (upcomingError) throw new Error(upcomingError.message);

    const roomById = new Map(calendarRooms.map((r) => [r.id, r]));
    const nextArrivals: OwnerArrival[] = ((upcomingRows ?? []) as Record<string, unknown>[]).map(
      (row) => {
        const booking = mapBookingRow(row);
        const room = roomById.get(booking.property_id);
        const category = room?.room_category_id
          ? catsById.get(room.room_category_id) ?? null
          : null;
        return {
          bookingId: booking.id,
          propertyId: booking.property_id,
          propertyLabel: room ? propertyLabel(room) : "номер",
          categoryName: category?.name ?? null,
          startDate: booking.start_date,
          endDate: booking.end_date,
          guestName: shortName(booking.client?.full_name ?? "Гость"),
          unassigned: Boolean(room?.is_unassigned_lane),
        };
      },
    );

    const occupancy = occupancyOf(rooms, mappedBookings, from, to);
    const occupancyByCategory = cats
      .map((category) => {
        const group = rooms.filter((r) => r.room_category_id === category.id);
        return { category, occupancy: occupancyOf(group, mappedBookings, from, to) };
      })
      .filter((row) => row.occupancy.rooms > 0);

    return {
      owner: owner as OwnerCabinet["owner"],
      categories: cats.filter((c) => categoryIds.includes(c.id)),
      rooms,
      calendarRooms,
      bookings: mappedBookings,
      occupancy,
      occupancyByCategory,
      nextArrivals,
      from,
      to,
    };
  });
