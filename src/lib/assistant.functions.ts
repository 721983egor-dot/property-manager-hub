import { createServerFn } from "@tanstack/react-start";

export type AssistantChatMessage = { role: "user" | "assistant"; content: string };

export type AssistantAction = {
  id: string;
  kind: "publish" | "unpublish" | "price" | "status";
  propertyId: string;
  propertyLabel: string;
  platform?: "cian" | "yandex" | "site";
  price?: number;
  status?: "free" | "soon_free" | "rented" | "booked" | "archived";
  summary: string;
};

export type AssistantReply = {
  text: string;
  actions: AssistantAction[];
  error: string;
};

const SYSTEM_PROMPT = `Ты — ИИ-помощник менеджера агентства долгосрочной аренды недвижимости «Residence More» в системе RM OS.
Отвечай всегда по-русски, коротко и по делу, используй markdown (списки, таблицы) там, где это помогает.

Правила:
- Все цифры и факты бери только из инструментов. Никогда не выдумывай данные, объекты, цены и статистику.
- Объекты называй по номеру (ref_id) и названию, например «1041 — Квартира с террасой».
- Если данных не хватает, честно скажи об этом и предложи, что проверить.
- Ты НИКОГДА не меняешь данные сам. Любое изменение (публикация, снятие с публикации, смена цены или статуса) оформляй вызовом инструмента proposeAction — менеджер подтвердит его кнопкой.
- После proposeAction в тексте кратко объясни, что предлагаешь подтвердить.
- Площадки: site — сайт РМ, cian — ЦИАН, yandex — Яндекс Недвижимость.`;

type PropertyRow = {
  id: string;
  ref_id: number;
  title: string;
  type: string;
  status: string;
  address: string;
  complex_name: string;
  rooms: number;
  area: number | null;
  floor: number | null;
  total_floors: number | null;
  price_month: number | null;
  deposit: number | null;
  description: string;
  photos: unknown;
  published: boolean;
};

const PROPERTY_COLUMNS =
  "id, ref_id, title, type, status, address, complex_name, rooms, area, floor, total_floors, price_month, deposit, description, photos, published";

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { messages: AssistantChatMessage[] })
  .handler(async ({ data }): Promise<AssistantReply> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { text: "", actions: [], error: "ИИ не настроен: нет ключа доступа." };

    const { streamText, tool, stepCountIs } = await import("ai");
    const { z } = await import("zod");
    const { createLovableAiGatewayProvider, ASSISTANT_MODEL } = await import(
      "@/lib/ai-gateway.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { missingCianFields } = await import("@/lib/cian");
    const { missingYandexFields } = await import("@/lib/yandex");

    const actions: AssistantAction[] = [];

    const label = (p: { ref_id: number; title: string }) => `${p.ref_id} — ${p.title}`;

    const findProperty = async (ref: string) => {
      const asNumber = Number(ref);
      const query = supabaseAdmin.from("properties").select(PROPERTY_COLUMNS);
      const { data: rows } = Number.isFinite(asNumber)
        ? await query.eq("ref_id", asNumber).limit(1)
        : await query.ilike("title", `%${ref}%`).limit(1);
      return ((rows ?? [])[0] ?? null) as PropertyRow | null;
    };

    const tools = {
      searchProperties: tool({
        description:
          "Поиск объектов в базе RM OS по тексту (название, адрес, комплекс), статусу и типу.",
        inputSchema: z.object({
          query: z.string().optional(),
          status: z.string().optional(),
          type: z.string().optional(),
          publishedOnly: z.boolean().optional(),
        }),
        execute: async (input) => {
          let q = supabaseAdmin.from("properties").select(PROPERTY_COLUMNS).limit(60);
          if (input.status) q = q.eq("status", input.status as never);
          if (input.type) q = q.eq("type", input.type as never);
          if (input.publishedOnly) q = q.eq("published", true);
          if (input.query) {
            const term = `%${input.query}%`;
            q = q.or(`title.ilike.${term},address.ilike.${term},complex_name.ilike.${term}`);
          }
          const { data: rows, error } = await q;
          if (error) return { error: error.message };
          return {
            count: (rows ?? []).length,
            properties: (rows ?? []).map((p) => {
              const r = p as PropertyRow;
              return {
                refId: r.ref_id,
                title: r.title,
                type: r.type,
                status: r.status,
                address: r.address,
                rooms: r.rooms,
                area: r.area,
                priceMonth: r.price_month,
                published: r.published,
              };
            }),
          };
        },
      }),

      getPropertyDetails: tool({
        description:
          "Карточка объекта по номеру (ref_id) или названию: все поля, публикации на площадках и незаполненные поля для ЦИАН и Яндекса.",
        inputSchema: z.object({ ref: z.string() }),
        execute: async ({ ref }) => {
          const p = await findProperty(ref);
          if (!p) return { error: "Объект не найден" };
          const { data: listings } = await supabaseAdmin
            .from("property_listings")
            .select("platform, published, external_id, external_url, sync_status, sync_error")
            .eq("property_id", p.id);
          const photos = Array.isArray(p.photos) ? p.photos.length : 0;
          return {
            refId: p.ref_id,
            title: p.title,
            type: p.type,
            status: p.status,
            address: p.address,
            complex: p.complex_name,
            rooms: p.rooms,
            area: p.area,
            floor: p.floor,
            totalFloors: p.total_floors,
            priceMonth: p.price_month,
            deposit: p.deposit,
            photos,
            descriptionLength: (p.description ?? "").length,
            publishedOnSite: p.published,
            listings: listings ?? [],
            missingForCian: missingCianFields(p as never),
            missingForYandex: missingYandexFields(p as never),
          };
        },
      }),

      getListingStats: tool({
        description:
          "Статистика площадок (просмотры, звонки, сообщения, показы) за последние N дней, по площадкам и по объектам.",
        inputSchema: z.object({ days: z.number().optional(), ref: z.string().optional() }),
        execute: async ({ days, ref }) => {
          const period = days && days > 0 ? days : 30;
          const from = new Date(Date.now() - period * 86400000).toISOString().slice(0, 10);
          let q = supabaseAdmin
            .from("listing_stats")
            .select("property_id, platform, date, views, calls, messages, impressions, favorites")
            .gte("date", from);
          if (ref) {
            const p = await findProperty(ref);
            if (!p) return { error: "Объект не найден" };
            q = q.eq("property_id", p.id);
          }
          const { data: rows, error } = await q;
          if (error) return { error: error.message };

          const byPlatform: Record<string, { views: number; calls: number; messages: number }> = {};
          const byProperty: Record<string, { views: number; calls: number; messages: number }> = {};
          for (const r of rows ?? []) {
            const s = (byPlatform[r.platform] ??= { views: 0, calls: 0, messages: 0 });
            s.views += r.views ?? 0;
            s.calls += r.calls ?? 0;
            s.messages += r.messages ?? 0;
            const p = (byProperty[r.property_id] ??= { views: 0, calls: 0, messages: 0 });
            p.views += r.views ?? 0;
            p.calls += r.calls ?? 0;
            p.messages += r.messages ?? 0;
          }

          const ids = Object.keys(byProperty);
          const { data: props } = ids.length
            ? await supabaseAdmin.from("properties").select("id, ref_id, title").in("id", ids)
            : { data: [] as { id: string; ref_id: number; title: string }[] };
          const nameById = new Map((props ?? []).map((p) => [p.id, label(p)]));

          return {
            periodDays: period,
            byPlatform,
            byProperty: Object.entries(byProperty)
              .map(([id, s]) => ({ property: nameById.get(id) ?? id, ...s }))
              .sort((a, b) => b.views - a.views)
              .slice(0, 30),
          };
        },
      }),

      getLeadsSummary: tool({
        description: "Заявки клиентов за последние N дней: количество по статусам и источникам.",
        inputSchema: z.object({ days: z.number().optional() }),
        execute: async ({ days }) => {
          const period = days && days > 0 ? days : 30;
          const from = new Date(Date.now() - period * 86400000).toISOString();
          const { data: rows, error } = await supabaseAdmin
            .from("leads")
            .select("status, source, topic, created_at, name")
            .gte("created_at", from)
            .order("created_at", { ascending: false });
          if (error) return { error: error.message };
          const byStatus: Record<string, number> = {};
          const bySource: Record<string, number> = {};
          for (const r of rows ?? []) {
            byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
            bySource[r.source || "site"] = (bySource[r.source || "site"] ?? 0) + 1;
          }
          return { periodDays: period, total: (rows ?? []).length, byStatus, bySource };
        },
      }),

      getBookingsSummary: tool({
        description: "Брони: активные, ближайшие заезды и выезды, занятость объектов.",
        inputSchema: z.object({ days: z.number().optional() }),
        execute: async ({ days }) => {
          const period = days && days > 0 ? days : 60;
          const today = new Date().toISOString().slice(0, 10);
          const until = new Date(Date.now() + period * 86400000).toISOString().slice(0, 10);
          const { data: rows, error } = await supabaseAdmin
            .from("bookings")
            .select("property_id, start_date, end_date, status, price_month")
            .lte("start_date", until)
            .gte("end_date", today);
          if (error) return { error: error.message };
          const ids = [...new Set((rows ?? []).map((r) => r.property_id))];
          const { data: props } = ids.length
            ? await supabaseAdmin.from("properties").select("id, ref_id, title").in("id", ids)
            : { data: [] as { id: string; ref_id: number; title: string }[] };
          const nameById = new Map((props ?? []).map((p) => [p.id, label(p)]));
          return {
            periodDays: period,
            total: (rows ?? []).length,
            bookings: (rows ?? []).map((r) => ({
              property: nameById.get(r.property_id) ?? r.property_id,
              from: r.start_date,
              to: r.end_date,
              status: r.status,
              priceMonth: r.price_month,
            })),
          };
        },
      }),

      proposeAction: tool({
        description:
          "Предложить изменение, которое менеджер подтвердит кнопкой. Ничего не меняет сразу. kind: publish/unpublish (нужна platform), price (нужна price), status (нужен status).",
        inputSchema: z.object({
          kind: z.enum(["publish", "unpublish", "price", "status"]),
          ref: z.string(),
          platform: z.enum(["site", "cian", "yandex"]).optional(),
          price: z.number().optional(),
          status: z.enum(["free", "rented", "booked", "archived"]).optional(),
          reason: z.string().optional(),
        }),
        execute: async (input) => {
          const p = await findProperty(input.ref);
          if (!p) return { error: "Объект не найден" };
          const platformName =
            input.platform === "cian"
              ? "ЦИАН"
              : input.platform === "yandex"
                ? "Яндекс Недвижимость"
                : "Сайт РМ";
          const summary =
            input.kind === "publish"
              ? `Опубликовать «${label(p)}» на площадке ${platformName}`
              : input.kind === "unpublish"
                ? `Снять «${label(p)}» с площадки ${platformName}`
                : input.kind === "price"
                  ? `Изменить цену «${label(p)}» на ${input.price?.toLocaleString("ru-RU")} ₽/мес`
                  : `Изменить статус «${label(p)}» на «${input.status}»`;
          const action: AssistantAction = {
            id: `${Date.now()}-${actions.length}`,
            kind: input.kind,
            propertyId: p.id,
            propertyLabel: label(p),
            ...(input.platform ? { platform: input.platform } : {}),
            ...(input.price != null ? { price: input.price } : {}),
            ...(input.status ? { status: input.status } : {}),
            summary,
          };
          actions.push(action);
          return { proposed: true, summary };
        },
      }),
    };

    try {
      const gateway = createLovableAiGatewayProvider(apiKey);
      const result = streamText({
        model: gateway(ASSISTANT_MODEL),
        system: SYSTEM_PROMPT,
        messages: data.messages.slice(-30),
        tools,
        stopWhen: stepCountIs(50),
      });
      const text = await result.text;
      return { text, actions, error: "" };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Ошибка запроса к ИИ";
      return { text: "", actions: [], error: message };
    }
  });

/** Выполняет действие, подтверждённое менеджером. */
export const runAssistantAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { action: AssistantAction })
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const a = data.action;
    try {
      if (a.kind === "publish" || a.kind === "unpublish") {
        const published = a.kind === "publish";
        if (a.platform === "cian") {
          const { setCianPublished } = await import("@/lib/cian.functions");
          await setCianPublished({ data: { propertyId: a.propertyId, published } });
        } else if (a.platform === "yandex") {
          const { setYandexPublished } = await import("@/lib/yandex-realty.functions");
          await setYandexPublished({ data: { propertyId: a.propertyId, published } });
        } else {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const now = new Date().toISOString();
          await supabaseAdmin
            .from("properties")
            .update({ published })
            .eq("id", a.propertyId);
          await supabaseAdmin.from("property_listings").upsert(
            {
              property_id: a.propertyId,
              platform: "site" as const,
              published,
              published_at: published ? now : null,
              unpublished_at: published ? null : now,
              last_synced_at: now,
            },
            { onConflict: "property_id,platform" },
          );
        }
        return { ok: true, message: published ? "Опубликовано" : "Снято с публикации" };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (a.kind === "price") {
        if (a.price == null) throw new Error("Не указана цена");
        const { error } = await supabaseAdmin
          .from("properties")
          .update({ price_month: a.price })
          .eq("id", a.propertyId);
        if (error) throw new Error(error.message);
        return { ok: true, message: "Цена обновлена" };
      }

      if (!a.status) throw new Error("Не указан статус");
      const { error } = await supabaseAdmin
        .from("properties")
        .update({ status: a.status })
        .eq("id", a.propertyId);
      if (error) throw new Error(error.message);
      return { ok: true, message: "Статус обновлён" };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Не удалось выполнить" };
    }
  });
