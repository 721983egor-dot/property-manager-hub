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

function findRoom(rooms: RoomRow[], booking: BnovoBooking) {
  if (booking.roomId) {
    const byId = rooms.find((r) => r.bnovo_room_id && r.bnovo_room_id === booking.roomId);
    if (byId) return byId;
  }
  const name = booking.roomName.trim().toLowerCase();
  if (!name) return null;
  return (
    rooms.find((r) => r.internal_name.trim().toLowerCase() === name) ||
    rooms.find((r) => r.title.trim().toLowerCase() === name) ||
    null
  );
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
      .select("id, bnovo_room_id, internal_name, title")
      .eq("portfolio", "n11" as never);
    if (roomError) throw new Error(roomError.message);
    const rooms = (roomRows ?? []) as RoomRow[];

    clearBnovoToken();
    const remote = await listBnovoBookings(creds, from, to);

    for (const booking of remote) {
      const room = findRoom(rooms, booking);
      if (!room) {
        skipped += 1;
        warnings.push(
          `Бронь ${booking.id}: номер не сопоставлен (${booking.roomName || booking.roomId || "без номера"})`,
        );
        continue;
      }
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
      const { data: existing } = await supabaseAdmin
        .from("bookings")
        .select("id")
        .eq("bnovo_id", booking.id)
        .maybeSingle();
      if (existing) {
        const { error } = await supabaseAdmin
          .from("bookings")
          .update(payload as never)
          .eq("id", (existing as { id: string }).id);
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
      }
    }

    const summary = `Bnovo: новых ${created}, обновлено ${updated}, пропущено ${skipped}`;
    await supabaseAdmin
      .from("bnovo_sync_runs")
      .update({
        status: "ok",
        finished_at: new Date().toISOString(),
        summary,
        details: { from, to, created, updated, skipped, warnings: warnings.slice(0, 40) },
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
