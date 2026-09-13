import { phoneDigits } from "@/lib/clients";
import { lastOccupiedNight } from "@/lib/hotel";
import { asPortfolios } from "@/lib/portfolios";
import {
  clearBnovoToken,
  listBnovoBookings,
  type BnovoBooking,
  type BnovoCredentials,
} from "@/lib/bnovo.server";

type RoomRow = {
  id: string;
  bnovo_room_id: string | null;
  internal_name: string;
  title: string;
  room_category_id: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
  code: string;
  bnovo_room_type_id: string | null;
};

type Occupied = {
  property_id: string;
  start_date: string;
  end_date: string;
  status: string;
  bnovo_id: string | null;
};

function cancelledStatus(status: string) {
  return /cancel|void|no.?show|отмен/i.test(status);
}

function completedStatus(status: string) {
  return /check.?out|depart|left|completed|выеха/i.test(status);
}

function mapSource(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("booking")) return "booking_com";
  if (s.includes("ostrov") || s.includes("остров")) return "ostrovok";
  if (s.includes("walk") || s.includes("стойк") || s.includes("прямая")) return "walkin";
  if (s.includes("site") || s.includes("сайт") || s.includes("n11")) return "website";
  if (s.includes("avito") || s.includes("авито")) return "avito";
  return "bnovo";
}

function nightsAmount(booking: BnovoBooking) {
  if (booking.amount == null) return null;
  const start = booking.arrival;
  const end = lastOccupiedNight(booking.arrival, booking.departure);
  const days =
    Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1);
  return Math.round((booking.amount / days) * 100) / 100;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

function n11Needle(value: string) {
  return /n[-\s]?11|н[-\s]?11/.test(value.toLowerCase());
}

function roomNumberFrom(booking: BnovoBooking) {
  const blob = `${booking.roomName} ${booking.categoryName}`;
  const numbered = blob.match(/(?:n[-\s]?11|н[-\s]?11)[^\d]{0,8}(\d{3,4})/i);
  if (numbered) return numbered[1];
  const known = blob.match(/\b(526|530|546|567)\b/);
  return known?.[1] ?? "";
}

function isN11Booking(booking: BnovoBooking, categories: CategoryRow[]) {
  const blob = `${booking.roomName} ${booking.categoryName}`.toLowerCase();
  if (n11Needle(blob)) return true;
  if (roomNumberFrom(booking)) return true;
  if (/стандарт\s*плюс|делюкс|deluxe|деклюкс/.test(blob)) return true;
  if (booking.roomTypeId && categories.some((c) => c.bnovo_room_type_id === booking.roomTypeId)) {
    return true;
  }
  return false;
}

function categoryOf(booking: BnovoBooking, categories: CategoryRow[]) {
  if (booking.roomTypeId) {
    const byType = categories.find((c) => c.bnovo_room_type_id === booking.roomTypeId);
    if (byType) return byType;
  }
  const blob = `${booking.roomName} ${booking.categoryName} ${roomNumberFrom(booking)}`.toLowerCase();
  if (/\b(546|567)\b/.test(blob) || /стандарт/.test(blob)) {
    return categories.find((c) => c.code === "standard_plus" || /стандарт/.test(c.name.toLowerCase())) ?? null;
  }
  if (/\b(526|530)\b/.test(blob) || /делюкс|deluxe|деклюкс/.test(blob)) {
    return categories.find((c) => c.code === "deluxe" || /делюкс|deluxe/.test(c.name.toLowerCase())) ?? null;
  }
  return null;
}

function isFree(
  roomId: string,
  start: string,
  end: string,
  occupied: Occupied[],
  exceptBnovoId: string,
) {
  return !occupied.some(
    (row) =>
      row.property_id === roomId &&
      row.status !== "cancelled" &&
      row.bnovo_id !== exceptBnovoId &&
      overlaps(row.start_date, row.end_date, start, end),
  );
}

function findRoom(
  rooms: RoomRow[],
  categories: CategoryRow[],
  booking: BnovoBooking,
  occupied: Occupied[],
  preferredRoomId?: string | null,
): { room: RoomRow; category: CategoryRow | null; note: string } | null {
  const stayEnd = lastOccupiedNight(booking.arrival, booking.departure);
  if (booking.roomId) {
    const byId = rooms.find((r) => r.bnovo_room_id && r.bnovo_room_id === booking.roomId);
    if (byId) return { room: byId, category: categories.find((c) => c.id === byId.room_category_id) ?? null, note: "" };
  }
  const number = roomNumberFrom(booking);
  if (number) {
    const byNumber = rooms.find(
      (r) =>
        r.internal_name.trim() === number ||
        r.title.replace(/\s/g, "").includes(number) ||
        r.internal_name.replace(/\s/g, "").endsWith(number),
    );
    if (byNumber) {
      return {
        room: byNumber,
        category: categories.find((c) => c.id === byNumber.room_category_id) ?? null,
        note: "",
      };
    }
  }
  const category = categoryOf(booking, categories);
  if (preferredRoomId) {
    const preferred = rooms.find((r) => r.id === preferredRoomId);
    if (
      preferred &&
      isFree(preferred.id, booking.arrival, stayEnd, occupied, booking.id) &&
      (!category || preferred.room_category_id === category.id)
    ) {
      return {
        room: preferred,
        category: category ?? categories.find((c) => c.id === preferred.room_category_id) ?? null,
        note: "",
      };
    }
  }
  if (!category) return null;
  const inCategory = rooms
    .filter((r) => r.room_category_id === category.id)
    .sort((a, b) => a.internal_name.localeCompare(b.internal_name, "ru"));
  const free = inCategory.find((r) => isFree(r.id, booking.arrival, stayEnd, occupied, booking.id));
  const room = free ?? inCategory[0];
  if (!room) return null;
  return {
    room,
    category,
    note: free
      ? ""
      : `Категория «${category.name}» на эти даты уже занята, бронь ${booking.id} поставили на ${room.internal_name}`,
  };
}

async function markN11(
  admin: Awaited<ReturnType<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"]>,
  clientId: string,
  portfolios: unknown,
) {
  const current = asPortfolios(portfolios);
  if (current.includes("n11")) return;
  await admin
    .from("clients")
    .update({ portfolios: [...current, "n11"] } as never)
    .eq("id", clientId);
}

async function upsertGuest(
  admin: Awaited<ReturnType<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"]>,
  booking: BnovoBooking,
) {
  const name = booking.guestName.trim() || `Гость Bnovo ${booking.id}`;
  const phone = booking.guestPhone.trim();
  const digits = phoneDigits(phone);
  if (digits.length >= 10) {
    const { data } = await admin
      .from("clients")
      .select("id, phone, portfolios")
      .ilike("phone", `%${digits.slice(-10)}%`)
      .limit(8);
    const found = (data ?? []).find((row) => phoneDigits(String(row.phone ?? "")) === digits);
    if (found) {
      await markN11(admin, found.id, found.portfolios);
      return found.id;
    }
  }
  const { data } = await admin
    .from("clients")
    .select("id, portfolios")
    .eq("full_name", name)
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();
  if (data) {
    await markN11(admin, (data as { id: string }).id, (data as { portfolios?: unknown }).portfolios);
    return (data as { id: string }).id;
  }
  const { data: created, error } = await admin
    .from("clients")
    .insert({
      full_name: name,
      phone,
      comment: booking.guestEmail ? `Bnovo / ${booking.guestEmail}` : "Гость апарт-отеля N-11",
      portfolios: ["n11"],
    } as never)
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Не удалось создать гостя N-11");
  return (created as { id: string }).id;
}

export async function loadBnovoCredentials(): Promise<BnovoCredentials | null> {
  const { getPlatformSecret } = await import("@/lib/platform-secrets.server");
  const accountId = await getPlatformSecret("BNOVO_ACCOUNT_ID");
  const password = await getPlatformSecret("BNOVO_API_PASSWORD");
  const baseUrl = await getPlatformSecret("BNOVO_API_BASE_URL");
  if (!accountId || !password) return null;
  return { accountId, password, baseUrl: baseUrl || undefined };
}

export async function syncBnovoBookings(range?: { from?: string; to?: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const creds = await loadBnovoCredentials();
  if (!creds) throw new Error("Сначала укажите ID аккаунта и ключ Bnovo");

  const from =
    range?.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = range?.to || new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);

  const { data: run, error: runError } = await supabaseAdmin
    .from("bnovo_sync_runs")
    .insert({ status: "running", summary: `Выгрузка ${from} — ${to}` } as never)
    .select("id")
    .single();
  if (runError || !run) throw new Error(runError?.message ?? "Не удалось начать синхронизацию");
  const runId = (run as { id: string }).id;

  const warnings: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    const { data: roomRows, error: roomError } = await supabaseAdmin
      .from("properties")
      .select("id, bnovo_room_id, internal_name, title, room_category_id")
      .eq("portfolio", "n11" as never);
    if (roomError) throw new Error(roomError.message);
    const rooms = (roomRows ?? []) as RoomRow[];

    const { data: categoryRows, error: catError } = await supabaseAdmin
      .from("hotel_room_categories")
      .select("id, name, code, bnovo_room_type_id");
    if (catError) throw new Error(catError.message);
    const categories = (categoryRows ?? []) as CategoryRow[];

    const roomIds = rooms.map((r) => r.id);
    const { data: occupiedRows } = roomIds.length
      ? await supabaseAdmin
          .from("bookings")
          .select("property_id, start_date, end_date, status, bnovo_id")
          .in("property_id", roomIds)
          .neq("status", "cancelled" as never)
      : { data: [] };
    const occupied = (occupiedRows ?? []) as Occupied[];

    const { data: existingRows } = await supabaseAdmin
      .from("bookings")
      .select("id, bnovo_id, property_id")
      .not("bnovo_id", "is", null);
    const existingByBnovo = new Map(
      ((existingRows ?? []) as { id: string; bnovo_id: string; property_id: string }[]).map((row) => [
        row.bnovo_id,
        row,
      ]),
    );

    clearBnovoToken();
    const remote = await listBnovoBookings(creds, from, to);

    for (const booking of remote) {
      const door = roomNumberFrom(booking);
      const room = door
        ? rooms.find((r) => r.internal_name.trim() === door)
        : undefined;
      if (booking.roomId && room && booking.roomId !== room.bnovo_room_id) {
        const { error: learnRoomError } = await supabaseAdmin
          .from("properties")
          .update({ bnovo_room_id: booking.roomId } as never)
          .eq("id", room.id);
        if (!learnRoomError) room.bnovo_room_id = booking.roomId;
      }
      if (booking.roomTypeId && room?.room_category_id) {
        const category = categories.find((c) => c.id === room.room_category_id);
        if (category && booking.roomTypeId !== category.bnovo_room_type_id) {
          const { error: learnTypeError } = await supabaseAdmin
            .from("hotel_room_categories")
            .update({ bnovo_room_type_id: booking.roomTypeId } as never)
            .eq("id", category.id);
          if (!learnTypeError) category.bnovo_room_type_id = booking.roomTypeId;
        }
      }
    }

    const n11 = remote.filter((booking) => isN11Booking(booking, categories));
    const ignoredRm = remote.length - n11.length;
    if (n11.length === 0 && remote.length > 0) {
      warnings.push(
        `Bnovo отдал ${remote.length} броней (в том числе долгосрочные объекты РМ). Среди них не нашлось N-11 — проверьте категории Стандарт Плюс и Делюкс.`,
      );
    }

    for (const booking of n11) {
      const existing = existingByBnovo.get(booking.id);
      const mapped = findRoom(rooms, categories, booking, occupied, existing?.property_id);
      if (!mapped) {
        skipped += 1;
        warnings.push(
          `Бронь ${booking.id} (${booking.guestName || "гость"}): нет номера в категории «${booking.categoryName || booking.roomTypeId || "без категории"}»`,
        );
        continue;
      }
      const { room, category, note } = mapped;
      if (note) warnings.push(note);
      const clientId = await upsertGuest(supabaseAdmin, booking);
      const status = cancelledStatus(booking.status)
        ? "cancelled"
        : completedStatus(booking.status)
          ? "completed"
          : "active";
      const payload = {
        property_id: room.id,
        client_id: clientId,
        start_date: booking.arrival,
        end_date: lastOccupiedNight(booking.arrival, booking.departure),
        price_type: "fixed",
        price_month: null,
        price_night: nightsAmount(booking),
        payment_day: 1,
        deposit: null,
        source: mapSource(booking.source),
        status,
        stay_kind: "short_stay",
        bnovo_id: booking.id,
        adults: booking.adults,
        children: booking.children,
        comment: [booking.source, booking.comment].filter(Boolean).join(". "),
      };
      if (existing) {
        const { error } = await supabaseAdmin
          .from("bookings")
          .update(payload as never)
          .eq("id", existing.id);
        if (error) {
          skipped += 1;
          warnings.push(`Бронь ${booking.id}: ${error.message}`);
          continue;
        }
        updated += 1;
      } else {
        const { error } = await supabaseAdmin.from("bookings").insert(payload as never);
        if (error) {
          skipped += 1;
          warnings.push(`Бронь ${booking.id}: ${error.message}`);
          continue;
        }
        created += 1;
        if (status !== "cancelled") {
          occupied.push({
            property_id: room.id,
            start_date: payload.start_date,
            end_date: payload.end_date,
            status,
            bnovo_id: booking.id,
          });
        }
      }

      if (category && booking.roomTypeId && booking.roomTypeId !== category.bnovo_room_type_id) {
        const { error: typeError } = await supabaseAdmin
          .from("hotel_room_categories")
          .update({ bnovo_room_type_id: booking.roomTypeId } as never)
          .eq("id", category.id);
        if (!typeError) category.bnovo_room_type_id = booking.roomTypeId;
      }
    }

    const summary = [
      `Bnovo N-11: новых ${created}, обновлено ${updated}, пропущено ${skipped}`,
      ignoredRm ? `объекты РМ не трогали (${ignoredRm})` : "",
    ]
      .filter(Boolean)
      .join(", ");
    await supabaseAdmin
      .from("bnovo_sync_runs")
      .update({
        status: "ok",
        finished_at: new Date().toISOString(),
        summary,
        details: { from, to, created, updated, skipped, ignoredRm, warnings: warnings.slice(0, 40) },
      } as never)
      .eq("id", runId);
    return { created, updated, skipped, warnings, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка синхронизации Bnovo";
    await supabaseAdmin
      .from("bnovo_sync_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        summary: message,
        details: { from, to, warnings },
      } as never)
      .eq("id", runId);
    throw error;
  }
}
