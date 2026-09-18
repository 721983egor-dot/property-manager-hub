import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";
import type { Booking } from "@/lib/bookings";
import type { HotelRoomCategory, OccupancyStat } from "@/lib/hotel";
import { occupancyOf } from "@/lib/hotel";
import type { Property } from "@/lib/properties";
import { toISODate } from "@/lib/rentals";

const BOOKING_COLUMNS =
  "id, property_id, client_id, start_date, end_date, price_type, price_month, price_night, payment_day, deposit, source, status, comment, stay_kind, clients(id, full_name, phone)";

export type OwnerCabinet = {
  owner: { id: string; full_name: string; email: string };
  categories: HotelRoomCategory[];
  rooms: Property[];
  bookings: Booking[];
  occupancy: OccupancyStat;
  occupancyByCategory: { category: HotelRoomCategory; occupancy: OccupancyStat }[];
  from: string;
  to: string;
};

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
    const from = data?.from || toISODate(new Date(today.getFullYear(), today.getMonth(), 1));
    const to =
      data?.to || toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

    const { data: links, error: linkError } = await supabaseAdmin
      .from("property_owners")
      .select("property_id, share_percent")
      .eq("owner_id", (owner as { id: string }).id);
    if (linkError) throw new Error(linkError.message);
    const propertyIds = (links ?? []).map((l) => l.property_id as string);
    if (propertyIds.length === 0) {
      return {
        owner: owner as OwnerCabinet["owner"],
        categories: [],
        rooms: [],
        bookings: [],
        occupancy: { rooms: 0, roomNights: 0, occupied: 0, percent: 0 },
        occupancyByCategory: [],
        from,
        to,
      };
    }

    const [{ data: rooms, error: roomError }, { data: categories, error: catError }] =
      await Promise.all([
        supabaseAdmin.from("properties").select("*").in("id", propertyIds),
        supabaseAdmin.from("hotel_room_categories").select("*").order("sort_order"),
      ]);
    if (roomError) throw new Error(roomError.message);
    if (catError) throw new Error(catError.message);

    const { data: bookingRows, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .in("property_id", propertyIds)
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date", { ascending: true });
    if (bookingError) throw new Error(bookingError.message);

    const mappedRooms = (rooms ?? []) as unknown as Property[];
    const mappedBookings = (bookingRows ?? []).map((row) => {
      const rec = row as Record<string, unknown>;
      const client = rec["clients"] as Booking["client"];
      return { ...(rec as unknown as Booking), client, periods: [] };
    });
    const cats = (categories ?? []) as HotelRoomCategory[];
    const occupancy = occupancyOf(mappedRooms, mappedBookings, from, to);
    const occupancyByCategory = cats
      .map((category) => {
        const group = mappedRooms.filter((r) => r.room_category_id === category.id);
        return { category, occupancy: occupancyOf(group, mappedBookings, from, to) };
      })
      .filter((row) => row.occupancy.rooms > 0);

    return {
      owner: owner as OwnerCabinet["owner"],
      categories: cats,
      rooms: mappedRooms,
      bookings: mappedBookings,
      occupancy,
      occupancyByCategory,
      from,
      to,
    };
  });
