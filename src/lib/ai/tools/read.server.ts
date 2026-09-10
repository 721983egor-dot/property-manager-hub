import { tool } from "ai";
import { z } from "zod";

import { PROPERTY_COLUMNS, propertyLabel } from "@/lib/ai/context.server";

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

/** Экранирует спецсимволы PostgREST-фильтра и режет запрос на слова. */
function terms(query: string): string[] {
  return query
    .split(/[\s,;]+/)
    .map((t) => t.trim().replace(/[%,()*]/g, ""))
    .filter((t) => t.length >= 2)
    .slice(0, 5);
}

function propertyOr(term: string) {
  const like = `%${term}%`;
  return [
    `title.ilike.${like}`,
    `internal_name.ilike.${like}`,
    `address.ilike.${like}`,
    `complex_name.ilike.${like}`,
    `description.ilike.${like}`,
    `location_description.ilike.${like}`,
  ].join(",");
}

/** Инструменты чтения: покрывают все данные RM OS. */
export function createReadTools(ctx: AssistantToolContext) {
  const { admin } = ctx;

  const nameMap = async (ids: string[]) => {
    if (!ids.length) return new Map<string, string>();
    const { data } = await admin.from("properties").select("id, ref_id, title").in("id", ids);
    return new Map((data ?? []).map((p) => [p.id, propertyLabel(p)]));
  };

  return {
    searchProperties: tool({
      description:
        "Поиск объектов по любому тексту: номер (ref_id), название, ВНУТРЕННЕЕ НАЗВАНИЕ, адрес, комплекс, описание. Ищет по всем объектам со всеми статусами, включая архив. Если ничего не нашлось по фразе целиком — ищет по отдельным словам.",
      inputSchema: z.object({
        query: z.string().optional(),
        status: z.string().optional().describe("free | soon_free | booked | rented | archived"),
        type: z.string().optional(),
        publishedOnly: z.boolean().optional(),
        maxPrice: z.number().optional(),
        minRooms: z.number().optional(),
      }),
      execute: async (input) => {
        const base = () => {
          let q = admin.from("properties").select(PROPERTY_COLUMNS).limit(200);
          if (input.status) q = q.eq("status", input.status as never);
          if (input.type) q = q.eq("type", input.type as never);
          if (input.publishedOnly) q = q.eq("published", true);
          if (input.maxPrice) q = q.lte("price_month", input.maxPrice);
          if (input.minRooms) q = q.gte("rooms", input.minRooms);
          return q;
        };

        const rows: Record<string, unknown>[] = [];
        const seen = new Set<string>();
        const push = (list: unknown[] | null) => {
          for (const r of (list ?? []) as Record<string, unknown>[]) {
            const id = r["id"] as string;
            if (!seen.has(id)) {
              seen.add(id);
              rows.push(r);
            }
          }
        };

        if (!input.query || !input.query.trim()) {
          const { data, error } = await base();
          if (error) return { error: error.message };
          push(data);
        } else {
          const raw = input.query.trim();
          const asNumber = Number(raw);
          if (Number.isFinite(asNumber) && raw !== "") {
            const { data } = await admin
              .from("properties")
              .select(PROPERTY_COLUMNS)
              .eq("ref_id", asNumber);
            push(data);
          }
          const whole = await base().or(propertyOr(raw));
          push(whole.data);
          if (!rows.length) {
            for (const t of terms(raw)) {
              const part = await base().or(propertyOr(t));
              push(part.data);
            }
          }
        }

        return {
          count: rows.length,
          properties: rows.map((r) => ({
            id: r["id"],
            refId: r["ref_id"],
            title: r["title"],
            internalName: r["internal_name"],
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
          })),
        };
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
        const [{ data: listings }, { data: bookings }] = await Promise.all([
          admin
            .from("property_listings")
            .select("platform, published, external_id, external_url, sync_status, sync_error")
            .eq("property_id", id),
          admin
            .from("bookings")
            .select("start_date, end_date, status, price_month, client_id")
            .eq("property_id", id)
            .order("start_date", { ascending: false })
            .limit(20),
        ]);
        return {
          ...p,
          photosCount: Array.isArray(p["photos"]) ? (p["photos"] as unknown[]).length : 0,
          photos: undefined,
          listings: listings ?? [],
          bookings: bookings ?? [],
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
        "Клиенты: ФИО, телефон, комментарий, чёрный список. Поиск по имени, телефону или комментарию; ищет по всем клиентам, включая чёрный список.",
      inputSchema: z.object({
        query: z.string().optional(),
        blacklistedOnly: z.boolean().optional(),
      }),
      execute: async ({ query, blacklistedOnly }) => {
        let q = admin
          .from("clients")
          .select("*")
          .limit(300)
          .order("created_at", { ascending: false });
        if (blacklistedOnly) q = q.eq("blacklisted", true);
        if (query) {
          const clean = query.replace(/[%,()*]/g, "").trim();
          const digits = clean.replace(/\D/g, "");
          const parts = [
            `full_name.ilike.%${clean}%`,
            `phone.ilike.%${clean}%`,
            `comment.ilike.%${clean}%`,
          ];
          if (digits.length >= 4) parts.push(`phone.ilike.%${digits.slice(-10)}%`);
          q = q.or(parts.join(","));
        }
        const { data, error } = await q;

        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    getClientHistory: tool({
      description: "Все сделки (брони и аренды) конкретного клиента.",
      inputSchema: z.object({ ref: z.string() }),
      execute: async ({ ref }) => {
        const c = await ctx.findClient(ref);
        if (!c) return { error: "Клиент не найден" };
        const { data: bookings } = await admin
          .from("bookings")
          .select("*")
          .eq("client_id", c["id"] as string)
          .order("start_date", { ascending: false });
        const names = await nameMap([...new Set((bookings ?? []).map((b) => b.property_id))]);
        return {
          client: c,
          bookings: (bookings ?? []).map((b) => ({
            ...b,
            property: names.get(b.property_id) ?? b.property_id,
          })),
        };
      },
    }),

    getDeals: tool({
      description:
        "Сделки: брони и аренды за период. Периоды, цены, депозит, источник, статус, день оплаты.",
      inputSchema: z.object({
        status: z.string().optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      }),
      execute: async ({ status, fromDate, toDate }) => {
        let q = admin
          .from("bookings")
          .select("*")
          .limit(200)
          .order("start_date", { ascending: false });
        if (status) q = q.eq("status", status as never);
        if (fromDate) q = q.gte("end_date", fromDate);
        if (toDate) q = q.lte("start_date", toDate);
        const { data, error } = await q;
        if (error) return { error: error.message };
        const names = await nameMap([...new Set((data ?? []).map((b) => b.property_id))]);
        const { data: clients } = await admin.from("clients").select("id, full_name, phone");
        const clientById = new Map((clients ?? []).map((c) => [c.id, c.full_name]));
        return (data ?? []).map((b) => ({
          ...b,
          property: names.get(b.property_id) ?? b.property_id,
          client: clientById.get(b.client_id) ?? b.client_id,
        }));
      },
    }),

    getCalendar: tool({
      description: "Занятость объектов: что занято и свободно в период, ближайшие заезды и выезды.",
      inputSchema: z.object({ days: z.number().optional() }),
      execute: async ({ days }) => {
        const period = days && days > 0 ? days : 60;
        const today = dateOnly(new Date().toISOString());
        const until = dateOnly(new Date(Date.now() + period * 86400000).toISOString());
        const [{ data: bookings }, { data: rentals }] = await Promise.all([
          admin
            .from("bookings")
            .select("property_id, start_date, end_date, status")
            .lte("start_date", until)
            .gte("end_date", today),
          admin
            .from("rentals")
            .select("property_id, start_date, end_date, status, tenant_name")
            .lte("start_date", until)
            .gte("end_date", today),
        ]);
        const ids = [
          ...new Set([
            ...(bookings ?? []).map((b) => b.property_id),
            ...(rentals ?? []).map((r) => r.property_id),
          ]),
        ];
        const names = await nameMap(ids);
        return {
          periodDays: period,
          checkIns: (bookings ?? [])
            .filter((b) => b.start_date >= today)
            .map((b) => ({ property: names.get(b.property_id), date: b.start_date })),
          checkOuts: (bookings ?? [])
            .filter((b) => b.end_date >= today)
            .map((b) => ({ property: names.get(b.property_id), date: b.end_date })),
          bookings: (bookings ?? []).map((b) => ({ ...b, property: names.get(b.property_id) })),
          rentals: (rentals ?? []).map((r) => ({ ...r, property: names.get(r.property_id) })),
        };
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
      description: "Чаты с сайта: обращения и переписка с клиентами.",
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
          .select("*")
          .gte("last_message_at", daysAgoISO(period))
          .order("last_message_at", { ascending: false })
          .limit(80);
        if (error) return { error: error.message };
        return data ?? [];
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
      description: "Подборки объектов для клиентов: код, ссылка, состав.",
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
        return (data ?? []).map((s) => ({ ...s, link: `/p/${s.code}` }));
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
        "Журнал действий системы: кто, что и когда создал, изменил или удалил. Фильтры: период в днях, таблица (properties, clients, deals, bookings, selections, property_listings, leads, assistant), объект, действие (insert/update/delete).",
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
          newSelections: (selections.data ?? []).map((s) => ({ ...s, link: `/p/${s.code}` })),
          log: log.data ?? [],
        };
      },
    }),

    getStaff: tool({
      description:
        "Сотрудники RM OS: ФИО, телефон, дата рождения, почта для входа и уровень доступа (администратор или менеджер).",
      inputSchema: z.object({ query: z.string().optional() }),
      execute: async ({ query }) => {
        let q = admin
          .from("profiles")
          .select("id, email, full_name, phone, birth_date, created_at")
          .order("created_at", { ascending: true })
          .limit(100);
        if (query) {
          const term = `%${query}%`;
          q = q.or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
        }
        const [{ data, error }, { data: roles }] = await Promise.all([
          q,
          admin.from("user_roles").select("user_id, role"),
        ]);
        if (error) return { error: error.message };
        const roleMap = new Map<string, string>();
        for (const r of roles ?? []) {
          if (r.role === "admin") roleMap.set(r.user_id, "admin");
          else if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, "manager");
        }
        return (data ?? []).map((p) => ({
          ...p,
          role: roleMap.get(p.id) === "admin" ? "Администратор" : "Менеджер",
        }));
      },
    }),

    getCrmDeals: tool({
      description:
        "Сделки CRM: стадия канбана, клиент, объект, источник, бюджет клиента, число взрослых и детей, ответственный, комментарий и дополнительные поля.",
      inputSchema: z.object({ query: z.string().optional(), stage: z.string().optional() }),
      execute: async ({ query, stage }) => {
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
        if (query)
          q = q.or(`title.ilike.%${query}%,source.ilike.%${query}%,comment.ilike.%${query}%`);
        const { data, error } = await q;
        if (error) return { error: error.message };
        const clientIds = [
          ...new Set((data ?? []).map((d) => d.client_id).filter(Boolean)),
        ] as string[];
        const propertyIds = [
          ...new Set((data ?? []).map((d) => d.property_id).filter(Boolean)),
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
        return {
          stages: (stages ?? []).map((s) => ({ name: s.name, kind: s.kind })),
          fields: (fields ?? []).filter((f) => !f.archived),
          deals: (data ?? []).map((d) => ({
            id: d.id,
            title: d.title,
            stage: stageMap.get(d.stage_id) ?? "",
            client: d.client_id ? (clientMap.get(d.client_id) ?? "") : "",
            property: d.property_id ? (propNames.get(d.property_id) ?? "") : "",
            source: d.source,
            budget: d.budget,
            adults: d.adults,
            children: d.children,
            comment: d.comment,
            custom: d.custom,
            created_at: d.created_at,
          })),
        };
      },
    }),
  };
}
