import { tool } from "ai";
import { z } from "zod";

import {
  PROPERTY_COLUMNS,
  postgrestValue,
  propertyLabel,
  scoreProperties,
  selectInChunks,
} from "@/lib/ai/context.server";
import { selectionUrl } from "@/lib/telegram/links.server";

import type { AssistantToolContext } from "@/lib/ai/context.server";

const daysAgoISO = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
const dateOnly = (iso: string) => iso.slice(0, 10);

export const STATUS_LABEL: Record<string, string> = {
  free: "Свободен",
  soon_free: "Скоро освободится",
  booked: "Забронирован",
  rented: "В аренде",
  archived: "Архив",
};

const BOOKING_STATUS_LABEL: Record<string, string> = {
  active: "Активно",
  completed: "Завершено",
  cancelled: "Отменено",
};

/** Тот же select, что у календаря RM OS (clients join). */
const BOOKING_COLUMNS =
  "id, property_id, client_id, start_date, end_date, price_type, price_month, payment_day, deposit, source, status, comment, clients(id, full_name, phone)";

type BookingClient = { id: string; full_name: string; phone: string } | null;
type BookingRow = {
  id: string;
  property_id: string;
  client_id: string;
  start_date: string;
  end_date: string;
  price_type?: string;
  price_month: number | null;
  payment_day: number;
  deposit: number | null;
  source: string | null;
  status: string;
  comment: string;
  clients?: BookingClient | BookingClient[] | null;
};

function bookingClient(row: BookingRow): BookingClient {
  const raw = row.clients;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

function mapBooking(row: BookingRow, propertyLabelText: string, today = dateOnly(new Date().toISOString())) {
  const client = bookingClient(row);
  const isCurrent =
    row.status !== "cancelled" && row.start_date <= today && row.end_date >= today;
  const isUpcoming =
    row.status === "active" && row.start_date > today;
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    statusLabel: BOOKING_STATUS_LABEL[row.status] ?? row.status,
    priceMonth: row.price_month,
    deposit: row.deposit,
    paymentDay: row.payment_day,
    source: row.source,
    comment: row.comment,
    property: propertyLabelText,
    client: client?.full_name ?? null,
    clientPhone: client?.phone ?? null,
    clientId: row.client_id,
    /** Сейчас проживает / объект занят этой бронью (даты включают сегодня). */
    isCurrent,
    /** Будущая бронь (ещё не заехал). */
    isUpcoming,
    occupancyLabel: isCurrent
      ? "Сейчас живёт / аренда идёт"
      : isUpcoming
        ? "Будущая бронь"
        : row.status === "completed"
          ? "Завершена"
          : row.status === "cancelled"
            ? "Отменена"
            : "В календаре",
  };
}

/** Инструменты чтения: покрывают все данные RM OS. */
export function createReadTools(ctx: AssistantToolContext) {
  const { admin, allProperties } = ctx;

  const nameMap = async (ids: string[]) => {
    if (!ids.length) return new Map<string, string>();
    const rows = await selectInChunks<{
      id: string;
      ref_id: number;
      title: string;
      internal_name: string | null;
    }>("properties", "id, ref_id, title, internal_name", "id", ids);
    return new Map(rows.map((p) => [p.id, propertyLabel(p)]));
  };

  return {
    searchProperties: tool({
      description:
        "Поиск объектов напрямую в базе RM OS: внутреннее название, номер, адрес, тип, статус. Для свободных домов/квартир вызывай с status=free (для домов type=house или villa/townhouse). Не утверждай, что свободных нет, пока не получил count из этого инструмента или getCalendar.freeProperties.",
      inputSchema: z.object({
        query: z.string().optional(),
        status: z.string().optional().describe("free | soon_free | booked | rented | archived"),
        type: z.string().optional(),
        publishedOnly: z.boolean().optional(),
        maxPrice: z.number().optional(),
        minRooms: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const applyFilters = (list: Record<string, unknown>[]) =>
            list.filter((r) => {
              if (input.status && r["status"] !== input.status) return false;
              if (input.type && r["type"] !== input.type) return false;
              if (input.publishedOnly && r["published"] !== true) return false;
              if (input.maxPrice != null && Number(r["price_month"] ?? Infinity) > input.maxPrice)
                return false;
              if (input.minRooms != null && Number(r["rooms"] ?? 0) < input.minRooms) return false;
              return true;
            });

          const mapRow = (r: Record<string, unknown>) => ({
            label: propertyLabel(
              r as { ref_id: number; title: string; internal_name?: string | null },
            ),
            internalName: r["internal_name"],
            refId: r["ref_id"],
            id: r["id"],
            title: r["title"],
            type: r["type"],
            status: r["status"],
            statusLabel: STATUS_LABEL[r["status"] as string] ?? r["status"],
            address: r["address"],
            complex: r["complex_name"],
            rooms: r["rooms"],
            area: r["area"],
            priceMonth: r["price_month"],
            commission: r["commission"],
            published: r["published"],
            createdAt: r["created_at"],
          });

          const all = await allProperties();
          const ranked = input.query?.trim()
            ? scoreProperties(all, input.query.trim())
                .filter((row) => row.score >= 2)
                .map((row) => row.property)
            : all;
          const filtered = applyFilters(ranked);
          const byStatus: Record<string, number> = {};
          const byType: Record<string, number> = {};
          for (const row of filtered) {
            const status = String(row["status"] ?? "");
            const type = String(row["type"] ?? "");
            byStatus[status] = (byStatus[status] ?? 0) + 1;
            byType[type] = (byType[type] ?? 0) + 1;
          }
          const limit =
            input.status === "free" || input.status === "soon_free" || !input.query?.trim()
              ? 500
              : 40;
          return {
            count: filtered.length,
            byStatus,
            byType,
            properties: filtered.slice(0, limit).map(mapRow),
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Ошибка поиска объектов" };
        }
      },
    }),

    getPropertyDetails: tool({
      description:
        "Полная карточка объекта по номеру (ref_id) или названию: все поля, публикации, брони и незаполненные поля площадок.",
      inputSchema: z.object({ ref: z.string() }),
      execute: async ({ ref }) => {
        const p = await ctx.findProperty(ref);
        if (!p) return { error: "Объект не найден" };
        const id = p["id"] as string;
        const { missingCianFields } = await import("@/lib/cian");
        const { missingYandexFields } = await import("@/lib/yandex");
        const [{ data: listings }, { data: bookings }, { data: rentals }] = await Promise.all([
          admin
            .from("property_listings")
            .select("platform, published, external_id, external_url, sync_status, sync_error")
            .eq("property_id", id),
          admin
            .from("bookings")
            .select("id, start_date, end_date, status, price_month, deposit, payment_day, source, comment, client_id")
            .eq("property_id", id)
            .order("start_date", { ascending: false })
            .limit(50),
          admin
            .from("rentals")
            .select("id, start_date, end_date, status, tenant_name, tenant_id, comment")
            .eq("property_id", id)
            .order("start_date", { ascending: false })
            .limit(50),
        ]);
        const clientIds = [...new Set((bookings ?? []).map((b) => b.client_id).filter(Boolean))];
        const { data: clients } = clientIds.length
          ? await admin.from("clients").select("id, full_name, phone").in("id", clientIds)
          : { data: [] as { id: string; full_name: string; phone: string }[] };
        const clientMap = new Map((clients ?? []).map((c) => [c.id, c]));
        return {
          label: propertyLabel(p as { ref_id: number; title: string; internal_name?: string | null }),
          ...p,
          photosCount: Array.isArray(p["photos"]) ? (p["photos"] as unknown[]).length : 0,
          photos: undefined,
          listings: listings ?? [],
          bookings: (bookings ?? []).map((b) => ({
            ...b,
            clientName: clientMap.get(b.client_id)?.full_name ?? null,
            clientPhone: clientMap.get(b.client_id)?.phone ?? null,
          })),
          rentals: rentals ?? [],
          missingForCian: missingCianFields(p as never),
          missingForYandex: missingYandexFields(p as never),
        };
      },
    }),

    getComplexes: tool({
      description: "Жилые комплексы: описание, инфраструктура, сколько объектов внутри.",
      inputSchema: z.object({ query: z.string().optional() }),
      execute: async ({ query }) => {
        let q = admin
          .from("complexes")
          .select(
            "id, name, description, infrastructure, location_description, show_in_site_filter",
          )
          .limit(100);
        if (query) q = q.ilike("name", `%${query}%`);
        const { data, error } = await q;
        if (error) return { error: error.message };
        const { data: props } = await admin.from("properties").select("id, complex_id");
        const counts = new Map<string, number>();
        for (const p of props ?? []) {
          if (p.complex_id) counts.set(p.complex_id, (counts.get(p.complex_id) ?? 0) + 1);
        }
        return (data ?? []).map((c) => ({ ...c, propertiesCount: counts.get(c.id) ?? 0 }));
      },
    }),

    getClients: tool({
      description:
        "Клиенты RM OS + брони из Календаря (в т.ч. кто живёт/забронировал без сделки CRM). Для человека передай query. Смотри currentRentals и calendarBookings — это не CRM.",
      inputSchema: z.object({
        query: z.string().optional(),
        blacklistedOnly: z.boolean().optional(),
      }),
      execute: async ({ query, blacklistedOnly }) => {
        try {
          let q = admin
            .from("clients")
            .select("id, full_name, phone, comment, blacklisted, blacklist_reason, created_at")
            .order("created_at", { ascending: false })
            .limit(query ? 50 : 200);
          if (blacklistedOnly) q = q.eq("blacklisted", true);
          if (query) {
            const clean = query.replace(/[%,()*]/g, "").trim();
            const digits = clean.replace(/\D/g, "");
            const words = clean.split(/\s+/).filter((w) => w.length >= 2).slice(0, 4);
            const parts = [
              `full_name.ilike.%${clean}%`,
              `phone.ilike.%${clean}%`,
              `comment.ilike.%${clean}%`,
              ...words.map((w) => `full_name.ilike.%${w}%`),
            ];
            if (digits.length >= 4) parts.push(`phone.ilike.%${digits.slice(-10)}%`);
            q = q.or(parts.join(","));
          }
          const { data, error } = await q;
          if (error) return { error: error.message };
          const clients = data ?? [];
          const ids = clients.map((c) => c.id);
          const bookingRows: BookingRow[] = [];
          for (let i = 0; i < ids.length; i += 80) {
            const chunk = ids.slice(i, i + 80);
            if (!chunk.length) continue;
            const { data: rows, error: bookingError } = await admin
              .from("bookings")
              .select(BOOKING_COLUMNS)
              .in("client_id", chunk)
              .order("start_date", { ascending: false });
            if (bookingError) return { error: bookingError.message };
            bookingRows.push(...((rows ?? []) as unknown as BookingRow[]));
          }
          const names = await nameMap([
            ...new Set(bookingRows.map((b) => b.property_id).filter(Boolean)),
          ]);
          const byClient = new Map<string, BookingRow[]>();
          for (const booking of bookingRows) {
            const list = byClient.get(booking.client_id) ?? [];
            list.push(booking);
            byClient.set(booking.client_id, list);
          }
          return {
            count: clients.length,
            hint: "Календарь (bookings) ≠ CRM (deals). У многих жильцов есть только бронь — без сделки.",
            clients: clients.map((c) => {
              const list = byClient.get(c.id) ?? [];
              const mapped = list.map((b) =>
                mapBooking(b, names.get(b.property_id) ?? b.property_id),
              );
              const calendar = mapped.filter((b) => b.status !== "cancelled");
              const current = mapped.filter((b) => b.isCurrent);
              const upcoming = mapped.filter((b) => b.isUpcoming);
              return {
                id: c.id,
                fullName: c.full_name,
                phone: c.phone,
                comment: c.comment,
                blacklisted: c.blacklisted,
                blacklistReason: c.blacklist_reason,
                currentRentalsCount: current.length,
                upcomingBookingsCount: upcoming.length,
                calendarBookingsCount: calendar.length,
                currentRentals: current,
                upcomingBookings: upcoming,
                calendarBookings: calendar.slice(0, 20),
                bookings: mapped.slice(0, 20),
              };
            }),
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Ошибка чтения клиентов" };
        }
      },
    }),

    getClientHistory: tool({
      description:
        "Карточка клиента с РАЗДЕЛЕНИЕМ: calendar = брони/текущая аренда (даже без CRM), crm = сделки. Для «есть ли бронь/аренда на клиента» вызывай всегда.",
      inputSchema: z.object({ ref: z.string() }),
      execute: async ({ ref }) => {
        try {
          const c = await ctx.findClient(ref);
          if (!c) return { error: "Клиент не найден" };
          const clientId = c["id"] as string;
          const clientName = String(c["full_name"] ?? "").trim();
          const [{ data: bookings, error: bookingsError }, { data: rentalsById }, { data: deals }] =
            await Promise.all([
              admin
                .from("bookings")
                .select(BOOKING_COLUMNS)
                .eq("client_id", clientId)
                .order("start_date", { ascending: false })
                .limit(100),
              admin
                .from("rentals")
                .select("id, property_id, start_date, end_date, status, tenant_name, comment")
                .eq("tenant_id", clientId)
                .order("start_date", { ascending: false })
                .limit(50),
              admin
                .from("deals")
                .select(
                  "id, title, stage_id, property_id, closed_property_id, start_date, end_date, price_month, deposit, commission, payment_day, budget, source, comment, created_at",
                )
                .eq("client_id", clientId)
                .order("created_at", { ascending: false })
                .limit(50),
            ]);
          if (bookingsError) return { error: bookingsError.message };
          let rentals = rentalsById ?? [];
          if (clientName) {
            const { data: byName } = await admin
              .from("rentals")
              .select("id, property_id, start_date, end_date, status, tenant_name, comment")
              .ilike("tenant_name", `%${clientName.replace(/[%,()*]/g, "")}%`)
              .order("start_date", { ascending: false })
              .limit(50);
            const seen = new Set(rentals.map((r) => r.id));
            for (const row of byName ?? []) {
              if (!seen.has(row.id)) rentals.push(row);
            }
          }
          const bookingRows = (bookings ?? []) as unknown as BookingRow[];
          const propertyIds = [
            ...new Set([
              ...bookingRows.map((b) => b.property_id),
              ...rentals.map((r) => r.property_id),
              ...(deals ?? []).map((d) => d.property_id).filter(Boolean),
              ...(deals ?? []).map((d) => d.closed_property_id).filter(Boolean),
            ]),
          ] as string[];
          const names = await nameMap(propertyIds);
          const mapped = bookingRows.map((b) =>
            mapBooking(b, names.get(b.property_id) ?? b.property_id),
          );
          const calendarBookings = mapped.filter((b) => b.status !== "cancelled");
          const currentRentals = mapped.filter((b) => b.isCurrent);
          const upcomingBookings = mapped.filter((b) => b.isUpcoming);
          const { data: stages } = await admin
            .from("deal_stages")
            .select("id, name")
            .order("position");
          const stageMap = new Map((stages ?? []).map((s) => [s.id, s.name]));
          return {
            client: {
              id: c["id"],
              fullName: c["full_name"],
              phone: c["phone"],
              comment: c["comment"],
              blacklisted: c["blacklisted"],
            },
            summary: {
              hasCalendarBookings: calendarBookings.length > 0,
              currentlyLiving: currentRentals.length > 0,
              hasCrmDeals: (deals ?? []).length > 0,
              note:
                calendarBookings.length > 0 && (deals ?? []).length === 0
                  ? "Есть бронь/аренда в Календаре, сделок CRM нет — нормально для жильцов до CRM."
                  : undefined,
            },
            calendar: {
              currentRentals,
              upcomingBookings,
              calendarBookings,
              allBookings: mapped,
            },
            crm: {
              deals: (deals ?? []).map((d) => ({
                id: d.id,
                title: d.title,
                stage: stageMap.get(d.stage_id) ?? "",
                startDate: d.start_date,
                endDate: d.end_date,
                priceMonth: d.price_month,
                deposit: d.deposit,
                commission: d.commission,
                paymentDay: d.payment_day,
                budget: d.budget,
                source: d.source,
                comment: d.comment,
                property: d.property_id ? names.get(d.property_id) ?? d.property_id : null,
                closedProperty: d.closed_property_id
                  ? names.get(d.closed_property_id) ?? d.closed_property_id
                  : null,
                createdAt: d.created_at,
              })),
            },
            legacyRentals: rentals.map((r) => ({
              ...r,
              property: names.get(r.property_id) ?? r.property_id,
            })),
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Ошибка чтения истории клиента" };
        }
      },
    }),

    getBookings: tool({
      description:
        "Брони из раздела «Календарь» RM OS (таблица bookings + клиент). НЕ CRM. Для «бронь на клиента X» передай clientQuery. По умолчанию — как в календаре: active и completed (без cancelled).",
      inputSchema: z.object({
        status: z
          .string()
          .optional()
          .describe(
            "active | completed | cancelled | calendar | all. По умолчанию calendar (= active+completed)",
          ),
        clientQuery: z.string().optional(),
        propertyRef: z.string().optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ status, clientQuery, propertyRef, fromDate, toDate, limit }) => {
        try {
          let q = admin
            .from("bookings")
            .select(BOOKING_COLUMNS)
            .order("start_date", { ascending: false })
            .limit(limit && limit > 0 ? Math.min(limit, 300) : 200);
          const mode = status || "calendar";
          if (mode === "calendar") q = q.neq("status", "cancelled" as never);
          else if (mode !== "all") q = q.eq("status", mode as never);
          if (fromDate) q = q.gte("end_date", fromDate);
          if (toDate) q = q.lte("start_date", toDate);
          if (propertyRef) {
            const p = await ctx.findProperty(propertyRef);
            if (!p) return { error: "Объект не найден" };
            q = q.eq("property_id", p["id"] as string);
          }
          if (clientQuery) {
            const client = await ctx.findClient(clientQuery);
            if (!client) return { error: "Клиент не найден", clientQuery };
            q = q.eq("client_id", client["id"] as string);
          }
          const { data, error } = await q;
          if (error) return { error: error.message };
          const rows = (data ?? []) as unknown as BookingRow[];
          const names = await nameMap([...new Set(rows.map((b) => b.property_id))]);
          const bookings = rows.map((b) => mapBooking(b, names.get(b.property_id) ?? b.property_id));
          return {
            count: bookings.length,
            source: "calendar.bookings",
            statusFilter: mode,
            hint: "Это Календарь, не CRM. currentRentals — кто сейчас живёт (даже без сделки).",
            currentRentals: bookings.filter((b) => b.isCurrent),
            upcomingBookings: bookings.filter((b) => b.isUpcoming),
            bookings,
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Ошибка чтения броней" };
        }
      },
    }),

    getCurrentRentals: tool({
      description:
        "Кто сейчас живёт / текущая аренда по Календарю (даты включают сегодня). Не CRM. Можно clientQuery или propertyRef.",
      inputSchema: z.object({
        clientQuery: z.string().optional(),
        propertyRef: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ clientQuery, propertyRef, limit }) => {
        try {
          const today = dateOnly(new Date().toISOString());
          let q = admin
            .from("bookings")
            .select(BOOKING_COLUMNS)
            .neq("status", "cancelled" as never)
            .lte("start_date", today)
            .gte("end_date", today)
            .order("start_date", { ascending: false })
            .limit(limit && limit > 0 ? Math.min(limit, 300) : 200);
          if (propertyRef) {
            const p = await ctx.findProperty(propertyRef);
            if (!p) return { error: "Объект не найден" };
            q = q.eq("property_id", p["id"] as string);
          }
          if (clientQuery) {
            const client = await ctx.findClient(clientQuery);
            if (!client) return { error: "Клиент не найден", clientQuery };
            q = q.eq("client_id", client["id"] as string);
          }
          const { data, error } = await q;
          if (error) return { error: error.message };
          const rows = (data ?? []) as unknown as BookingRow[];
          const names = await nameMap([...new Set(rows.map((b) => b.property_id))]);
          const currentRentals = rows.map((b) =>
            mapBooking(b, names.get(b.property_id) ?? b.property_id, today),
          );
          return {
            count: currentRentals.length,
            source: "calendar.bookings",
            asOf: today,
            currentRentals,
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Ошибка чтения текущих аренд" };
        }
      },
    }),

    getDeals: tool({
      description:
        "Синоним getBookings: брони КАЛЕНДАРЯ (не CRM). Для CRM — getCrmDeals. Для броней клиента передай clientQuery.",
      inputSchema: z.object({
        status: z.string().optional(),
        clientQuery: z.string().optional(),
        propertyRef: z.string().optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ status, clientQuery, propertyRef, fromDate, toDate, limit }) => {
        try {
          let q = admin
            .from("bookings")
            .select(BOOKING_COLUMNS)
            .order("start_date", { ascending: false })
            .limit(limit && limit > 0 ? Math.min(limit, 300) : 200);
          const mode = status || "calendar";
          if (mode === "calendar") q = q.neq("status", "cancelled" as never);
          else if (mode !== "all") q = q.eq("status", mode as never);
          if (fromDate) q = q.gte("end_date", fromDate);
          if (toDate) q = q.lte("start_date", toDate);
          if (propertyRef) {
            const p = await ctx.findProperty(propertyRef);
            if (!p) return { error: "Объект не найден" };
            q = q.eq("property_id", p["id"] as string);
          }
          if (clientQuery) {
            const client = await ctx.findClient(clientQuery);
            if (!client) return { error: "Клиент не найден", clientQuery };
            q = q.eq("client_id", client["id"] as string);
          }
          const { data, error } = await q;
          if (error) return { error: error.message };
          const rows = (data ?? []) as unknown as BookingRow[];
          const names = await nameMap([...new Set(rows.map((b) => b.property_id))]);
          const bookings = rows.map((b) => mapBooking(b, names.get(b.property_id) ?? b.property_id));
          return {
            count: bookings.length,
            source: "calendar.bookings",
            statusFilter: mode,
            hint: "Это Календарь, не CRM.",
            currentRentals: bookings.filter((b) => b.isCurrent),
            upcomingBookings: bookings.filter((b) => b.isUpcoming),
            bookings,
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Ошибка чтения броней" };
        }
      },
    }),

    getCalendar: tool({
      description:
        "Календарь RM OS: свободные объекты + брони/текущие аренды с клиентами. clientQuery — брони клиента (в т.ч. без сделки CRM).",
      inputSchema: z.object({
        days: z.number().optional(),
        type: z.string().optional().describe("apartment | house | villa | townhouse | aparts"),
        clientQuery: z.string().optional(),
      }),
      execute: async ({ days, type, clientQuery }) => {
        try {
          const period = days && days > 0 ? days : 120;
          const today = dateOnly(new Date().toISOString());
          const until = dateOnly(new Date(Date.now() + period * 86400000).toISOString());
          const from = dateOnly(new Date(Date.now() - 30 * 86400000).toISOString());
          const all = await allProperties();
          const properties = type ? all.filter((p) => p["type"] === type) : all;
          const mapProp = (p: Record<string, unknown>) => ({
            label: propertyLabel(
              p as { ref_id: number; title: string; internal_name?: string | null },
            ),
            type: p["type"],
            statusLabel: STATUS_LABEL[p["status"] as string] ?? p["status"],
            priceMonth: p["price_month"],
            rooms: p["rooms"],
          });
          const freeProperties = properties.filter((p) => p["status"] === "free").map(mapProp);
          const soonFree = properties.filter((p) => p["status"] === "soon_free").map(mapProp);
          const summary = {
            total: properties.length,
            free: freeProperties.length,
            soonFree: soonFree.length,
            booked: properties.filter((p) => p["status"] === "booked").length,
            rented: properties.filter((p) => p["status"] === "rented").length,
            archived: properties.filter((p) => p["status"] === "archived").length,
          };

          let q = admin
            .from("bookings")
            .select(BOOKING_COLUMNS)
            .neq("status", "cancelled" as never)
            .lte("start_date", until)
            .gte("end_date", from)
            .order("start_date", { ascending: true })
            .limit(300);
          if (clientQuery) {
            const client = await ctx.findClient(clientQuery);
            if (!client) {
              return { error: "Клиент не найден", clientQuery, summary, freeProperties };
            }
            q = q.eq("client_id", client["id"] as string);
          }
          const { data: bookings, error: bookingsError } = await q;
          if (bookingsError) return { error: bookingsError.message };

          const rows = (bookings ?? []) as unknown as BookingRow[];
          const names = await nameMap([...new Set(rows.map((b) => b.property_id))]);
          const mapped = rows.map((b) =>
            mapBooking(b, names.get(b.property_id) ?? b.property_id, today),
          );
          const currentRentals = mapped.filter((b) => b.isCurrent);
          return {
            periodDays: period,
            range: { from, to: until },
            typeFilter: type ?? null,
            clientFilter: clientQuery ?? null,
            hint: "Календарь ≠ CRM. currentRentals — кто живёт сейчас; crm смотри через getCrmDeals.",
            summary,
            freeProperties,
            soonFreeProperties: soonFree,
            currentRentals,
            upcomingBookings: mapped.filter((b) => b.isUpcoming),
            checkIns: mapped
              .filter((b) => b.startDate >= today)
              .slice(0, 50)
              .map((b) => ({ property: b.property, date: b.startDate, client: b.client })),
            checkOuts: mapped
              .filter((b) => b.endDate >= today)
              .slice(0, 50)
              .map((b) => ({ property: b.property, date: b.endDate, client: b.client })),
            calendarBookings: mapped,
            activeBookings: mapped.filter((b) => b.status === "active"),
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Ошибка чтения календаря" };
        }
      },
    }),

    getLeads: tool({
      description: "Заявки с сайта: список и сводка по статусам и источникам за N дней.",
      inputSchema: z.object({ days: z.number().optional(), status: z.string().optional() }),
      execute: async ({ days, status }) => {
        const period = days && days > 0 ? days : 30;
        let q = admin
          .from("leads")
          .select("*")
          .gte("created_at", daysAgoISO(period))
          .order("created_at", { ascending: false })
          .limit(200);
        if (status) q = q.eq("status", status as never);
        const { data, error } = await q;
        if (error) return { error: error.message };
        const byStatus: Record<string, number> = {};
        const bySource: Record<string, number> = {};
        for (const r of data ?? []) {
          byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
          bySource[r.source || "site"] = (bySource[r.source || "site"] ?? 0) + 1;
        }
        return {
          periodDays: period,
          total: (data ?? []).length,
          byStatus,
          bySource,
          leads: data ?? [],
        };
      },
    }),

    getChats: tool({
      description:
        "Все чаты RM OS: сайт, ЦИАН и Авито. Без threadId — список диалогов; с threadId — история сообщений.",
      inputSchema: z.object({ threadId: z.string().optional(), days: z.number().optional() }),
      execute: async ({ threadId, days }) => {
        if (threadId) {
          const { data } = await admin
            .from("chat_messages")
            .select("direction, body, created_at")
            .eq("thread_id", threadId)
            .order("created_at", { ascending: true });
          return { threadId, messages: data ?? [] };
        }
        const period = days && days > 0 ? days : 30;
        const { data, error } = await admin
          .from("chat_threads")
          .select(
            "id, source, name, phone, status, unread_count, last_message_at, property_id, external_offer_id, first_page",
          )
          .gte("last_message_at", daysAgoISO(period))
          .order("last_message_at", { ascending: false })
          .limit(120);
        if (error) return { error: error.message };
        const sourceLabel = (source: string) =>
          source === "cian" ? "ЦИАН" : source === "avito" ? "Авито" : "Сайт";
        return (data ?? []).map((t) => ({
          ...t,
          sourceLabel: sourceLabel(String(t.source ?? "site")),
        }));
      },
    }),

    getListings: tool({
      description:
        "Публикации объектов по площадкам (сайт, Авито, ЦИАН, Яндекс): статус, ссылки, ошибки синхронизации.",
      inputSchema: z.object({ ref: z.string().optional(), platform: z.string().optional() }),
      execute: async ({ ref, platform }) => {
        let q = admin.from("property_listings").select("*").limit(300);
        if (platform) q = q.eq("platform", platform as never);
        if (ref) {
          const p = await ctx.findProperty(ref);
          if (!p) return { error: "Объект не найден" };
          q = q.eq("property_id", p["id"] as string);
        }
        const { data, error } = await q;
        if (error) return { error: error.message };
        const names = await nameMap([...new Set((data ?? []).map((l) => l.property_id))]);
        return (data ?? []).map((l) => ({ ...l, property: names.get(l.property_id) }));
      },
    }),

    getListingStats: tool({
      description:
        "Статистика площадок: показы, просмотры, звонки, сообщения, избранное за N дней по площадкам и объектам.",
      inputSchema: z.object({ days: z.number().optional(), ref: z.string().optional() }),
      execute: async ({ days, ref }) => {
        const period = days && days > 0 ? days : 30;
        let q = admin
          .from("listing_stats")
          .select("property_id, platform, date, views, calls, messages, impressions, favorites")
          .gte("date", dateOnly(daysAgoISO(period)));
        if (ref) {
          const p = await ctx.findProperty(ref);
          if (!p) return { error: "Объект не найден" };
          q = q.eq("property_id", p["id"] as string);
        }
        const { data, error } = await q;
        if (error) return { error: error.message };
        const byPlatform: Record<string, { views: number; calls: number; messages: number }> = {};
        const byProperty: Record<string, { views: number; calls: number; messages: number }> = {};
        for (const r of data ?? []) {
          const s = (byPlatform[r.platform] ??= { views: 0, calls: 0, messages: 0 });
          s.views += r.views ?? 0;
          s.calls += r.calls ?? 0;
          s.messages += r.messages ?? 0;
          const p = (byProperty[r.property_id] ??= { views: 0, calls: 0, messages: 0 });
          p.views += r.views ?? 0;
          p.calls += r.calls ?? 0;
          p.messages += r.messages ?? 0;
        }
        const names = await nameMap(Object.keys(byProperty));
        return {
          periodDays: period,
          byPlatform,
          byProperty: Object.entries(byProperty)
            .map(([id, s]) => ({ property: names.get(id) ?? id, ...s }))
            .sort((a, b) => b.views - a.views)
            .slice(0, 40),
        };
      },
    }),

    getSelections: tool({
      description:
        "Подборки объектов RM OS (раздел «Подборки»): код, готовая ссылка для клиента, состав.",
      inputSchema: z.object({ query: z.string().optional() }),
      execute: async ({ query }) => {
        let q = admin
          .from("selections")
          .select("id, code, name, client_name, comment, saved, created_at")
          .order("created_at", { ascending: false })
          .limit(50);
        if (query) {
          const term = `%${query}%`;
          q = q.or(`name.ilike.${term},client_name.ilike.${term},code.ilike.${term}`);
        }
        const { data, error } = await q;
        if (error) return { error: error.message };
        const rows = data ?? [];
        const ids = rows.map((s) => s.id);
        const { data: items } = ids.length
          ? await admin
              .from("selection_items")
              .select("selection_id, property_id, position")
              .in("selection_id", ids)
              .order("position")
          : { data: [] as { selection_id: string; property_id: string; position: number }[] };
        const names = await nameMap([...new Set((items ?? []).map((i) => i.property_id))]);
        return rows.map((s) => ({
          ...s,
          link: selectionUrl(s.code),
          properties: (items ?? [])
            .filter((i) => i.selection_id === s.id)
            .map((i) => names.get(i.property_id) ?? i.property_id),
        }));
      },
    }),

    getDealComments: tool({
      description:
        "Комментарии сотрудников и история изменений по сделке CRM. Нужен идентификатор сделки.",
      inputSchema: z.object({ dealId: z.string() }),
      execute: async ({ dealId }) => {
        const [{ data: comments, error }, { data: history }] = await Promise.all([
          admin
            .from("deal_comments")
            .select("author_name, body, created_at")
            .eq("deal_id", dealId)
            .order("created_at", { ascending: false })
            .limit(100),
          admin
            .from("activity_log")
            .select("action, actor_email, changes, created_at")
            .eq("table_name", "deals")
            .eq("record_id", dealId)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);
        if (error) return { error: error.message };
        return { comments: comments ?? [], history: history ?? [] };
      },
    }),

    getDealShowings: tool({
      description: "Показы объектов по сделке CRM: объект, дата показа, заметка, сотрудник.",
      inputSchema: z.object({ dealId: z.string() }),
      execute: async ({ dealId }) => {
        const { data, error } = await admin
          .from("deal_showings")
          .select("id, property_id, shown_at, note, author_name, created_at")
          .eq("deal_id", dealId)
          .order("shown_at", { ascending: false });
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    getClientDeals: tool({
      description:
        "Все сделки клиента: открытые и закрытые, с условиями аренды (объект, даты, цена, депозит, комиссия, день оплаты).",
      inputSchema: z.object({ clientId: z.string() }),
      execute: async ({ clientId }) => {
        const { data, error } = await admin
          .from("deals")
          .select(
            "id, title, stage_id, property_id, closed_property_id, start_date, end_date, price_month, deposit, commission, payment_day, budget, source, created_at",
          )
          .eq("client_id", clientId)
          .order("created_at", { ascending: false });
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    getActivityLog: tool({
      description:
        "Журнал действий системы и сотрудников: кто, что и когда создал, изменил или удалил. Фильтры: период в днях, таблица (properties, clients, deals, deal_comments, deal_showings, bookings, selections, selection_items, property_listings, leads, profiles — карточки сотрудников, user_roles — доступы сотрудников, assistant, social_posts), объект, действие (insert/update/delete).",
      inputSchema: z.object({
        days: z.number().optional(),
        tableName: z.string().optional(),
        action: z.string().optional(),
        ref: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ days, tableName, action, ref, limit }) => {
        const period = days && days > 0 ? days : 30;
        let q = admin
          .from("activity_log")
          .select(
            "table_name, record_id, action, actor_email, source, summary, changes, created_at",
          )
          .gte("created_at", daysAgoISO(period))
          .order("created_at", { ascending: false })
          .limit(limit && limit > 0 ? Math.min(limit, 300) : 150);
        if (tableName) q = q.eq("table_name", tableName);
        if (action) q = q.eq("action", action);
        if (ref) {
          const p = await ctx.findProperty(ref);
          if (!p) return { error: "Объект не найден" };
          q = q.eq("record_id", p["id"] as string);
        }
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { periodDays: period, count: (data ?? []).length, entries: data ?? [] };
      },
    }),

    getRecentChanges: tool({
      description:
        "Что нового и что менялось в системе за последние N дней: созданные объекты, клиенты, брони, сделки, заявки и подборки плюс записи журнала. Используй для вопросов «что добавили сегодня/утром/за неделю».",
      inputSchema: z.object({ days: z.number().optional() }),
      execute: async ({ days }) => {
        const period = days && days > 0 ? days : 3;
        const since = daysAgoISO(period);
        const [props, clients, bookings, deals, leads, selections, log] = await Promise.all([
          admin
            .from("properties")
            .select("id, ref_id, title, internal_name, status, price_month, created_at, updated_at")
            .gte("created_at", since)
            .order("created_at", { ascending: false }),
          admin.from("clients").select("id, full_name, phone, created_at").gte("created_at", since),
          admin
            .from("bookings")
            .select("id, property_id, client_id, start_date, end_date, status, created_at")
            .gte("created_at", since),
          admin.from("deals").select("id, title, created_at").gte("created_at", since),
          admin
            .from("leads")
            .select("id, name, phone, topic, status, created_at")
            .gte("created_at", since),
          admin.from("selections").select("id, code, name, created_at").gte("created_at", since),
          admin
            .from("activity_log")
            .select("table_name, action, actor_email, summary, created_at")
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(150),
        ]);
        const bookingNames = await nameMap([
          ...new Set((bookings.data ?? []).map((b) => b.property_id)),
        ]);
        return {
          periodDays: period,
          newProperties: (props.data ?? []).map((p) => ({
            refId: p.ref_id,
            title: p.title,
            internalName: p.internal_name,
            status: p.status,
            statusLabel: STATUS_LABEL[p.status] ?? p.status,
            priceMonth: p.price_month,
            createdAt: p.created_at,
          })),
          newClients: clients.data ?? [],
          newBookings: (bookings.data ?? []).map((b) => ({
            ...b,
            property: bookingNames.get(b.property_id) ?? b.property_id,
          })),
          newDeals: deals.data ?? [],
          newLeads: leads.data ?? [],
          newSelections: (selections.data ?? []).map((s) => ({
            ...s,
            link: selectionUrl(s.code),
          })),
          log: log.data ?? [],
        };
      },
    }),

    getStaff: tool({
      description:
        "ОБЯЗАТЕЛЬНО вызывай для любых вопросов про сотрудников, менеджеров, администраторов, команду, кто работает в RM OS. Возвращает ФИО, телефон, дату рождения, почту и роль (администратор/менеджер).",
      inputSchema: z.object({ query: z.string().optional() }),
      execute: async ({ query }) => {
        const [{ data: profiles, error }, { data: roles }] = await Promise.all([
          admin
            .from("profiles")
            .select("id, email, full_name, phone, birth_date, photo_path, created_at")
            .order("created_at", { ascending: true })
            .limit(200),
          admin.from("user_roles").select("user_id, role"),
        ]);
        if (error) return { error: error.message };

        const roleMap = new Map<string, string>();
        for (const r of roles ?? []) {
          if (r.role === "admin") roleMap.set(r.user_id, "admin");
          else if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, "manager");
        }

        type Row = {
          id: string;
          email: string;
          full_name: string;
          phone: string;
          birth_date: string | null;
          photo_path?: string | null;
          created_at: string;
        };
        const byId = new Map<string, Row>();
        for (const p of profiles ?? []) byId.set(p.id, p as Row);

        // Сотрудники без заполненной карточки — из auth.
        try {
          const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
          for (const u of users?.users ?? []) {
            if (byId.has(u.id)) continue;
            byId.set(u.id, {
              id: u.id,
              email: u.email ?? "",
              full_name: "",
              phone: "",
              birth_date: null,
              photo_path: null,
              created_at: u.created_at,
            });
          }
        } catch {
          /* список пользователей недоступен — показываем только карточки */
        }

        // Роли без профиля тоже включаем.
        for (const [userId, role] of roleMap) {
          if (byId.has(userId)) continue;
          byId.set(userId, {
            id: userId,
            email: "",
            full_name: "",
            phone: "",
            birth_date: null,
            photo_path: null,
            created_at: new Date(0).toISOString(),
          });
          void role;
        }

        let rows = [...byId.values()];
        if (query) {
          const term = query.toLowerCase();
          rows = rows.filter((r) => {
            const role = roleMap.get(r.id) === "admin" ? "администратор" : "менеджер";
            return `${r.full_name} ${r.email} ${r.phone} ${role}`.toLowerCase().includes(term);
          });
        }

        return {
          count: rows.length,
          hint:
            rows.length === 0
              ? "В системе пока нет сотрудников в profiles/user_roles. Проверьте Настройки → Сотрудники."
              : undefined,
          staff: rows.map((p) => ({
            id: p.id,
            fullName: p.full_name || null,
            email: p.email || null,
            phone: p.phone || null,
            birthDate: p.birth_date,
            profileFilled: Boolean(p.full_name),
            role: roleMap.get(p.id) === "admin" ? "Администратор" : "Менеджер",
            createdAt: p.created_at,
          })),
        };
      },
    }),

    getCrmDeals: tool({
      description:
        "Только сделки CRM (канбан). НЕ календарь и НЕ текущая аренда. Для броней/кто живёт — getBookings / getCurrentRentals / getClientHistory. clientQuery — сделки клиента; без сделки у старых жильцов это нормально.",
      inputSchema: z.object({
        query: z.string().optional(),
        clientQuery: z.string().optional().describe("ФИО или телефон клиента"),
        stage: z.string().optional(),
      }),
      execute: async ({ query, clientQuery, stage }) => {
        const [{ data: stages }, { data: fields }] = await Promise.all([
          admin.from("deal_stages").select("id, name, kind, position").order("position"),
          admin.from("deal_fields").select("key, label, field_type, options, archived"),
        ]);
        const stageMap = new Map((stages ?? []).map((s) => [s.id, s.name]));
        let q = admin.from("deals").select("*").limit(200);
        if (stage) {
          const found = (stages ?? []).find((s) => s.name.toLowerCase() === stage.toLowerCase());
          if (found) q = q.eq("stage_id", found.id);
        }
        let resolvedClient: { id: string; full_name?: string; phone?: string } | null = null;
        if (clientQuery) {
          const client = await ctx.findClient(clientQuery);
          if (!client) {
            return {
              count: 0,
              source: "crm.deals",
              hint: "Клиент не найден в CRM-поиске. Проверь Календарь через getClientHistory / getBookings.",
              clientQuery,
              deals: [],
            };
          }
          resolvedClient = {
            id: client["id"] as string,
            full_name: client["full_name"] as string | undefined,
            phone: client["phone"] as string | undefined,
          };
          q = q.eq("client_id", resolvedClient.id);
        }
        if (query) {
          const like = postgrestValue(`%${query}%`);
          q = q.or(`title.ilike.${like},source.ilike.${like},comment.ilike.${like}`);
        }
        const { data, error } = await q;
        if (error) return { error: error.message };
        const clientIds = [
          ...new Set((data ?? []).map((d) => d.client_id).filter(Boolean)),
        ] as string[];
        const propertyIds = [
          ...new Set(
            (data ?? [])
              .flatMap((d) => [d.property_id, d.closed_property_id])
              .filter(Boolean),
          ),
        ] as string[];
        const [{ data: clients }, propNames] = await Promise.all([
          clientIds.length
            ? admin.from("clients").select("id, full_name, phone").in("id", clientIds)
            : Promise.resolve({ data: [] as { id: string; full_name: string; phone: string }[] }),
          nameMap(propertyIds),
        ]);
        const clientMap = new Map(
          (clients ?? []).map((c) => [c.id, `${c.full_name} ${c.phone}`.trim()]),
        );
        const deals = (data ?? []).map((d) => ({
          id: d.id,
          title: d.title,
          stage: stageMap.get(d.stage_id) ?? "",
          client: d.client_id ? (clientMap.get(d.client_id) ?? "") : "",
          property: d.property_id ? (propNames.get(d.property_id) ?? "") : "",
          closedProperty: d.closed_property_id
            ? (propNames.get(d.closed_property_id) ?? "")
            : "",
          source: d.source,
          budget: d.budget,
          adults: d.adults,
          children: d.children,
          startDate: d.start_date,
          endDate: d.end_date,
          priceMonth: d.price_month,
          comment: d.comment,
          custom: d.custom,
          created_at: d.created_at,
        }));
        return {
          count: deals.length,
          source: "crm.deals",
          hint:
            "Пустой список сделок при наличии брони в Календаре — нормально для клиентов до CRM.",
          clientFilter: resolvedClient
            ? {
                id: resolvedClient.id,
                fullName: resolvedClient.full_name ?? null,
                phone: resolvedClient.phone ?? null,
              }
            : null,
          stages: (stages ?? []).map((s) => ({ name: s.name, kind: s.kind })),
          fields: (fields ?? []).filter((f) => !f.archived),
          deals,
        };
      },
    }),
  };
}
