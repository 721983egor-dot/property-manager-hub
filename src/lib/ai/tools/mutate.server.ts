import { tool } from "ai";
import { z } from "zod";

import { propertyLabel } from "@/lib/ai/context.server";

import type { AssistantToolContext } from "@/lib/ai/context.server";

const PLATFORM_NAME: Record<string, string> = {
  site: "Сайт РМ",
  cian: "ЦИАН",
  yandex: "Яндекс Недвижимость",
  avito: "Авито",
};

const money = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

/**
 * Инструменты изменения. Ничего не меняют сразу — только формируют
 * предложение, которое менеджер подтверждает кнопкой.
 */
export function createMutateTools(ctx: AssistantToolContext) {
  const label = async (ref: string) => {
    const p = await ctx.findProperty(ref);
    if (!p) return null;
    return { id: p["id"] as string, text: propertyLabel(p as never), row: p };
  };

  return {
    proposePublish: tool({
      description:
        "Предложить публикацию или снятие объекта с площадки (site, cian, yandex, avito). Требует подтверждения менеджера.",
      inputSchema: z.object({
        ref: z.string(),
        platform: z.enum(["site", "cian", "yandex", "avito"]),
        publish: z.boolean(),
      }),
      execute: async ({ ref, platform, publish }) => {
        const p = await label(ref);
        if (!p) return { error: "Объект не найден" };
        const summary = `${publish ? "Опубликовать" : "Снять с публикации"} «${p.text}» — ${PLATFORM_NAME[platform]}`;
        ctx.propose({
          tool: "setPublished",
          summary,
          input: { propertyId: p.id, platform, publish },
        });
        return { proposed: true, summary };
      },
    }),

    proposePropertyUpdate: tool({
      description:
        "Предложить изменение полей объекта: публичное название, ВНУТРЕННЕЕ название, адрес, тип, комнаты, площадь, этаж, цена, статус, депозит, комиссия (%), коммунальные, описание, условия аренды, заметка о доступности, комплекс, ссылка на видео (файл уходит в Авито, VK — в ЦИАН).",
      inputSchema: z.object({
        ref: z.string(),
        title: z.string().optional(),
        internalName: z.string().optional(),
        address: z.string().optional(),
        complexName: z.string().optional(),
        type: z.enum(["apartment", "aparts", "house", "villa", "townhouse"]).optional(),
        rooms: z.number().optional(),
        bathrooms: z.number().optional(),
        area: z.number().optional(),
        floor: z.number().optional(),
        totalFloors: z.number().optional(),
        priceMonth: z.number().optional(),
        status: z.enum(["free", "soon_free", "rented", "booked", "archived"]).optional(),
        deposit: z.number().optional(),
        commission: z.number().optional(),
        utilitiesMonth: z.number().optional(),
        description: z.string().optional(),
        rentTerms: z.string().optional(),
        availabilityNote: z.string().optional(),
        forRent: z
          .boolean()
          .optional()
          .describe("В аренду: показывать в календаре аренды. false = только обслуживание"),
        videoUrl: z
          .string()
          .optional()
          .describe("Ссылка YouTube / VK / Rutube или пустая строка, чтобы убрать видео"),
      }),
      execute: async ({ ref, ...fields }) => {
        const p = await label(ref);
        if (!p) return { error: "Объект не найден" };
        const parts: string[] = [];
        if (fields.title) parts.push(`название «${fields.title}»`);
        if (fields.internalName != null) parts.push(`внутреннее «${fields.internalName}»`);
        if (fields.address) parts.push("адрес");
        if (fields.complexName != null) parts.push(`комплекс «${fields.complexName}»`);
        if (fields.type) parts.push(`тип «${fields.type}»`);
        if (fields.rooms != null) parts.push(`${fields.rooms} комн.`);
        if (fields.bathrooms != null) parts.push(`${fields.bathrooms} с/у`);
        if (fields.area != null) parts.push(`площадь ${fields.area}`);
        if (fields.floor != null) parts.push(`этаж ${fields.floor}`);
        if (fields.totalFloors != null) parts.push(`этажей ${fields.totalFloors}`);
        if (fields.priceMonth != null) parts.push(`цена ${money(fields.priceMonth)}/мес`);
        if (fields.status) parts.push(`статус «${fields.status}»`);
        if (fields.deposit != null) parts.push(`депозит ${money(fields.deposit)}`);
        if (fields.commission != null) parts.push(`комиссия ${fields.commission}%`);
        if (fields.utilitiesMonth != null)
          parts.push(`коммунальные ${money(fields.utilitiesMonth)}`);
        if (fields.description) parts.push("новое описание");
        if (fields.rentTerms) parts.push("новые условия аренды");
        if (fields.availabilityNote) parts.push("заметка о доступности");
        if (fields.forRent === true) parts.push("в аренду");
        if (fields.forRent === false) parts.push("только обслуживание (не в аренду)");
        if (fields.videoUrl != null)
          parts.push(fields.videoUrl.trim() ? "ссылка на видео" : "убрать видео");
        if (!parts.length) return { error: "Не указано ни одного изменения" };
        const summary = `Изменить «${p.text}»: ${parts.join(", ")}`;
        ctx.propose({ tool: "updateProperty", summary, input: { propertyId: p.id, fields } });
        return { proposed: true, summary };
      },
    }),

    proposePublishPropertyVideo: tool({
      description:
        "Предложить выложить видео объекта на YouTube и VK Видео. Само при сохранении карточки это не делается — только после кнопки «Выложить» или подтверждения здесь.",
      inputSchema: z.object({ ref: z.string() }),
      execute: async ({ ref }) => {
        const p = await label(ref);
        if (!p) return { error: "Объект не найден" };
        const summary = `Выложить видео «${p.text}» на YouTube и VK`;
        ctx.propose({ tool: "publishPropertyVideo", summary, input: { propertyId: p.id } });
        return { proposed: true, summary };
      },
    }),

    proposeCreateProperty: tool({
      description:
        "Предложить создание нового объекта с заполненной карточкой (включая внутреннее название). Объект создаётся неопубликованным. Фото в карточку загружает менеджер — на них автоматически ставится водяной знак «Резиденция & Море».",
      inputSchema: z.object({
        title: z.string(),
        internalName: z.string().optional(),
        type: z.enum(["apartment", "aparts", "house", "villa", "townhouse"]),
        rooms: z.number(),
        bathrooms: z.number().optional(),
        address: z.string().optional(),
        complexName: z.string().optional(),
        area: z.number().optional(),
        floor: z.number().optional(),
        totalFloors: z.number().optional(),
        priceMonth: z.number().optional(),
        deposit: z.number().optional(),
        commission: z.number().optional(),
        description: z.string().optional(),
      }),
      execute: async (input) => {
        const summary = `Создать объект «${input.title}»${input.internalName ? ` / ${input.internalName}` : ""} (${input.rooms} комн.${input.priceMonth ? `, ${money(input.priceMonth)}/мес` : ""})`;
        ctx.propose({ tool: "createProperty", summary, input });
        return { proposed: true, summary };
      },
    }),

    proposeChatReply: tool({
      description:
        "Предложить ответ в чат RM OS (сайт, ЦИАН или Авито) по id диалога. Требует подтверждения.",
      inputSchema: z.object({
        threadId: z.string(),
        body: z.string().min(1).max(2000),
      }),
      execute: async ({ threadId, body }) => {
        const { data: thread } = await ctx.admin
          .from("chat_threads")
          .select("id, source, name")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread) return { error: "Диалог не найден" };
        const source =
          thread.source === "cian" ? "ЦИАН" : thread.source === "avito" ? "Авито" : "Сайт";
        const summary = `Ответить в чат ${source}${thread.name ? ` («${thread.name}»)` : ""}: «${body.slice(0, 80)}${body.length > 80 ? "…" : ""}»`;
        ctx.propose({
          tool: "sendChatMessage",
          summary,
          input: { threadId, body },
        });
        return { proposed: true, summary };
      },
    }),

    proposeSelection: tool({
      description:
        "Предложить создание подборки объектов для клиента. В refs указывай внутренние названия (Карат 1802, ЛБ2 35к16 кв 12) или номера объектов.",
      inputSchema: z.object({
        refs: z.array(z.string()),
        name: z.string().optional(),
        clientName: z.string().optional(),
        comment: z.string().optional(),
      }),
      execute: async ({ refs, name, clientName, comment }) => {
        const found: { id: string; text: string }[] = [];
        const missing: string[] = [];
        for (const r of refs) {
          const p = await label(r);
          if (p) found.push({ id: p.id, text: p.text });
          else missing.push(r);
        }
        if (!found.length) {
          return { error: `Объекты не найдены: ${missing.join(", ")}` };
        }
        const summary = `Создать подборку${name ? ` «${name}»` : ""}${clientName ? ` для ${clientName}` : ""}: ${found.map((f) => f.text).join(", ")}`;
        ctx.propose({
          tool: "createSelection",
          summary,
          input: {
            propertyIds: found.map((f) => f.id),
            name: name ?? "",
            clientName: clientName ?? "",
            comment: comment ?? "",
          },
        });
        return {
          proposed: true,
          summary,
          objectsCount: found.length,
          objects: found.map((f) => f.text),
          missing: missing.length ? missing : undefined,
        };
      },
    }),

    proposeBooking: tool({
      description:
        "Предложить бронь в календаре: объект, клиент (имя и телефон или существующий), даты, цена в месяц, день оплаты, депозит.",
      inputSchema: z.object({
        ref: z.string(),
        clientName: z.string(),
        clientPhone: z.string().optional(),
        startDate: z.string(),
        endDate: z.string(),
        priceMonth: z.number().optional(),
        paymentDay: z.number().optional(),
        deposit: z.number().optional(),
        source: z.enum(["avito", "cian", "website", "social", "referral"]).optional(),
        comment: z.string().optional(),
      }),
      execute: async ({ ref, ...rest }) => {
        const p = await label(ref);
        if (!p) return { error: "Объект не найден" };
        const summary = `Добавить бронь «${p.text}» для ${rest.clientName}: ${rest.startDate} — ${rest.endDate}${rest.priceMonth ? `, ${money(rest.priceMonth)}/мес` : ""}`;
        ctx.propose({ tool: "createBooking", summary, input: { propertyId: p.id, ...rest } });
        return { proposed: true, summary };
      },
    }),

    proposeCancelBooking: tool({
      description: "Предложить отмену брони по объекту и дате начала.",
      inputSchema: z.object({ ref: z.string(), startDate: z.string() }),
      execute: async ({ ref, startDate }) => {
        const p = await label(ref);
        if (!p) return { error: "Объект не найден" };
        const summary = `Отменить бронь «${p.text}» с ${startDate}`;
        ctx.propose({ tool: "cancelBooking", summary, input: { propertyId: p.id, startDate } });
        return { proposed: true, summary };
      },
    }),

    proposeClient: tool({
      description:
        "Предложить создание клиента или изменение его данных (комментарий, чёрный список, кто он: РМ / собственник / Н11).",
      inputSchema: z.object({
        fullName: z.string(),
        phone: z.string().optional(),
        comment: z.string().optional(),
        blacklisted: z.boolean().optional(),
        blacklistReason: z.string().optional(),
        partyKind: z
          .enum(["rm", "owner", "n11"])
          .optional()
          .describe("Кто он: rm = РМ, owner = собственник, n11 = Н11"),
      }),
      execute: async (input) => {
        const existing = await ctx.findClient(input.phone || input.fullName);
        const kindLabel =
          input.partyKind === "owner"
            ? "собственник"
            : input.partyKind === "n11"
              ? "Н11"
              : input.partyKind === "rm"
                ? "РМ"
                : null;
        const summary = existing
          ? `Обновить клиента ${existing["full_name"] as string}${kindLabel ? ` (${kindLabel})` : ""}`
          : `Создать клиента ${input.fullName}${input.phone ? ` (${input.phone})` : ""}${kindLabel ? `, ${kindLabel}` : ""}`;
        ctx.propose({
          tool: "upsertClient",
          summary,
          input: { ...input, clientId: existing ? (existing["id"] as string) : null },
        });
        return { proposed: true, summary };
      },
    }),

    proposeLeadStatus: tool({
      description: "Предложить смену статуса заявки клиента.",
      inputSchema: z.object({
        leadId: z.string(),
        status: z.enum(["new", "in_work", "done", "rejected"]),
      }),
      execute: async ({ leadId, status }) => {
        const summary = `Изменить статус заявки на «${status}»`;
        ctx.propose({ tool: "setLeadStatus", summary, input: { leadId, status } });
        return { proposed: true, summary };
      },
    }),

    proposeDealComment: tool({
      description:
        "Предложить добавление комментария в карточку сделки CRM. Требует подтверждения менеджера.",
      inputSchema: z.object({ dealId: z.string(), body: z.string() }),
      execute: async ({ dealId, body }) => {
        const { data: deal } = await ctx.admin
          .from("deals")
          .select("title")
          .eq("id", dealId)
          .maybeSingle();
        if (!deal) return { error: "Сделка не найдена" };
        const summary = `Добавить комментарий к сделке «${deal.title}»: ${body}`;
        ctx.propose({ tool: "addDealComment", summary, input: { dealId, body } });
        return { proposed: summary };
      },
    }),

    proposeDealShowing: tool({
      description:
        "Предложить добавление показа объекта в сделку CRM (объект, дата, заметка). Требует подтверждения менеджера.",
      inputSchema: z.object({
        dealId: z.string(),
        propertyRef: z.string().describe("ID объекта или его номер ref_id"),
        shownAt: z.string().describe("Дата показа в формате ГГГГ-ММ-ДД"),
        note: z.string().optional(),
      }),
      execute: async ({ dealId, propertyRef, shownAt, note }) => {
        const { data: deal } = await ctx.admin
          .from("deals")
          .select("title")
          .eq("id", dealId)
          .maybeSingle();
        if (!deal) return { error: "Сделка не найдена" };
        const numeric = Number(propertyRef);
        const { data: property } = await ctx.admin
          .from("properties")
          .select("id, ref_id, internal_name, title")
          .or(
            Number.isFinite(numeric) && propertyRef.trim() !== ""
              ? `id.eq.${propertyRef},ref_id.eq.${numeric}`
              : `id.eq.${propertyRef}`,
          )
          .maybeSingle();
        if (!property) return { error: "Объект не найден" };
        const summary = `Добавить показ объекта №${property.ref_id} (${property.internal_name || property.title}) в сделку «${deal.title}» на ${shownAt}`;
        ctx.propose({
          tool: "addDealShowing",
          summary,
          input: { dealId, propertyId: property.id, shownAt, note: note ?? "" },
        });
        return { proposed: summary };
      },
    }),

    proposeDealWon: tool({
      description:
        "Предложить успешное закрытие сделки: объект, даты заезда и выезда, цена в месяц, депозит, комиссия, день ежемесячной оплаты. Требует подтверждения менеджера.",
      inputSchema: z.object({
        dealId: z.string(),
        propertyRef: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        priceMonth: z.number(),
        deposit: z.number(),
        commission: z.number().optional(),
        paymentDay: z.number(),
      }),
      execute: async ({
        dealId,
        propertyRef,
        startDate,
        endDate,
        priceMonth,
        deposit,
        commission,
        paymentDay,
      }) => {
        const { data: deal } = await ctx.admin
          .from("deals")
          .select("title, client_id")
          .eq("id", dealId)
          .maybeSingle();
        if (!deal) return { error: "Сделка не найдена" };
        const numeric = Number(propertyRef);
        const { data: property } = await ctx.admin
          .from("properties")
          .select("id, ref_id, internal_name, title, service_type")
          .or(
            Number.isFinite(numeric) && propertyRef.trim() !== ""
              ? `id.eq.${propertyRef},ref_id.eq.${numeric}`
              : `id.eq.${propertyRef}`,
          )
          .maybeSingle();
        if (!property) return { error: "Объект не найден" };
        const summary = `Закрыть сделку «${deal.title}» успешно: объект №${property.ref_id}, ${startDate} — ${endDate}, ${priceMonth} ₽/мес, депозит ${deposit} ₽, оплата ${paymentDay} числа`;
        ctx.propose({
          tool: "closeDealWon",
          summary,
          input: {
            dealId,
            propertyId: property.id,
            clientId: deal.client_id,
            serviceType: property.service_type,
            startDate,
            endDate,
            priceMonth,
            deposit,
            commission: commission ?? null,
            paymentDay,
          },
        });
        return { proposed: summary };
      },
    }),

    proposeDeal: tool({
      description:
        "Предложить создание или изменение сделки CRM (аренда) или карточки «Новый объект» (воронка собственников). pipeline=rental по умолчанию, intake — новые объекты. Требует подтверждения менеджера.",
      inputSchema: z.object({
        dealId: z.string().optional(),
        pipeline: z
          .enum(["rental", "intake"])
          .optional()
          .describe("rental = сделки аренды, intake = новые объекты"),
        title: z.string().optional(),
        stage: z.string().optional(),
        clientRef: z.string().optional(),
        propertyRef: z.string().optional(),
        source: z.string().optional(),
        budget: z.number().optional(),
        adults: z.number().optional(),
        children: z.number().optional(),
        comment: z.string().optional(),
        telegram: z.string().optional().describe("Аккаунт клиента в Telegram, например @ivan"),
        preferredMessenger: z
          .enum(["Telegram", "WhatsApp", "MAX", "Телефон"])
          .optional()
          .describe("Удобный мессенджер клиента"),
        custom: z.record(z.string(), z.string()).optional(),
        intakeDraft: z
          .object({
            property_type: z.string().optional(),
            complex_id: z.string().nullable().optional(),
            address: z.string().optional(),
            rooms: z.string().optional(),
            bathrooms: z.string().optional(),
            floor: z.string().optional(),
            total_floors: z.string().optional(),
            area: z.string().optional(),
            price_month: z.string().optional(),
            deposit: z.string().optional(),
            commission: z.string().optional(),
            service_type: z.string().optional(),
            description: z.string().optional(),
          })
          .optional()
          .describe("Черновик полей объекта для pipeline=intake"),
      }),
      execute: async (input) => {
        const pipeline = input.pipeline === "intake" ? "intake" : "rental";
        let stagesQuery = ctx.admin.from("deal_stages").select("id, name, pipeline").order("position");
        let { data: stages, error: stagesError } = await stagesQuery.eq("pipeline", pipeline);
        if (stagesError && /pipeline|schema cache|could not find/i.test(stagesError.message)) {
          ({ data: stages } = await ctx.admin.from("deal_stages").select("id, name").order("position"));
        }
        const stageRow = input.stage
          ? (stages ?? []).find((s) => s.name.toLowerCase() === input.stage!.toLowerCase())
          : null;
        if (input.stage && !stageRow) return { error: "Стадия не найдена в этой воронке" };
        const client = input.clientRef ? await ctx.findClient(input.clientRef) : null;
        const property = input.propertyRef ? await label(input.propertyRef) : null;
        const parts: string[] = [];
        parts.push(pipeline === "intake" ? "новый объект" : "сделка");
        if (input.title) parts.push(`«${input.title}»`);
        if (stageRow) parts.push(`стадия «${stageRow.name}»`);
        if (client) parts.push(`клиент ${client["full_name"] as string}`);
        if (property) parts.push(`объект ${property.text}`);
        if (input.budget != null) parts.push(`бюджет ${money(input.budget)}`);
        if (input.adults != null || input.children != null)
          parts.push(`гости ${input.adults ?? 0} взр. / ${input.children ?? 0} дет.`);
        if (input.source) parts.push(`источник ${input.source}`);
        if (input.telegram) parts.push(`Telegram ${input.telegram}`);
        if (input.preferredMessenger) parts.push(`мессенджер ${input.preferredMessenger}`);
        if (input.intakeDraft?.address) parts.push(`адрес ${input.intakeDraft.address}`);
        const summary = `${input.dealId ? "Изменить" : "Создать"} ${parts.join(", ") || "без изменений"}`;
        const custom = {
          ...(input.custom ?? {}),
          ...(input.intakeDraft ? { intake_draft: input.intakeDraft } : {}),
        };
        ctx.propose({
          tool: "upsertDeal",
          summary,
          input: {
            dealId: input.dealId ?? null,
            pipeline,
            stageId: stageRow?.id ?? (stages ?? [])[0]?.id ?? null,
            clientId: client ? (client["id"] as string) : null,
            propertyId: property?.id ?? null,
            title: input.title ?? null,
            source: input.source ?? null,
            budget: input.budget ?? null,
            adults: input.adults ?? null,
            children: input.children ?? null,
            comment: input.comment ?? null,
            telegram: input.telegram ?? null,
            preferredMessenger: input.preferredMessenger ?? null,
            custom: Object.keys(custom).length ? custom : null,
          },
        });
        return { proposed: true, summary };
      },
    }),

    proposeCianReply: tool({
      description: "Предложить ответ клиенту в чате ЦИАН. Сообщение отправится только после подтверждения.",
      inputSchema: z.object({ threadId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }),
      execute: async ({ threadId, body }) => {
        const { data: thread } = await ctx.admin
          .from("chat_threads")
          .select("id, source, name, external_id")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread || thread.source !== "cian" || !thread.external_id) {
          return { error: "Чат ЦИАН не найден" };
        }
        const summary = `Отправить ответ в ЦИАН${thread.name ? ` клиенту ${thread.name}` : ""}: «${body.slice(0, 120)}${body.length > 120 ? "…" : ""}»`;
        ctx.propose({ tool: "sendCianMessage", summary, input: { threadId, body } });
        return { proposed: true, summary };
      },
    }),

    proposeHotelRoom: tool({
      description:
        "Предложить добавить или изменить номер апарт-отеля Н11. ID комнаты Bnovo необязателен: бронь приходит на категорию, номер выбирают при заселении.",
      inputSchema: z.object({
        roomId: z.string().optional(),
        name: z.string(),
        category: z.string().optional(),
        bnovoRoomId: z.string().optional(),
        priceNight: z.number().optional(),
        guests: z.number().optional(),
        floor: z.number().optional(),
      }),
      execute: async (input) => {
        const summary = `${input.roomId ? "Обновить" : "Добавить"} номер Н11 «${input.name}»`;
        ctx.propose({ tool: "saveHotelRoom", summary, input });
        return { proposed: true, summary };
      },
    }),

    proposeHotelCategory: tool({
      description:
        "Предложить добавить или изменить категорию номеров Н11 и ID типа комнаты в Bnovo (room_type_id). Брони падают на категорию.",
      inputSchema: z.object({
        categoryId: z.string().optional(),
        code: z.string(),
        name: z.string(),
        description: z.string().optional(),
        guests: z.number().optional(),
        bnovoRoomTypeId: z.string().optional(),
      }),
      execute: async (input) => {
        const summary = `${input.categoryId ? "Обновить" : "Добавить"} категорию Н11 «${input.name}»`;
        ctx.propose({ tool: "saveHotelCategory", summary, input });
        return { proposed: true, summary };
      },
    }),

    proposeHotelOwner: tool({
      description: "Предложить добавить собственника Н11 и привязать к номерам (можно несколько долей).",
      inputSchema: z.object({
        ownerId: z.string().optional(),
        fullName: z.string(),
        phone: z.string().optional(),
        email: z.string().optional(),
        rooms: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        const summary = `${input.ownerId ? "Обновить" : "Добавить"} собственника ${input.fullName}`;
        ctx.propose({ tool: "saveHotelOwner", summary, input });
        return { proposed: true, summary };
      },
    }),

    proposeBnovoSync: tool({
      description: "Предложить выгрузить брони апарт-отеля из Bnovo API v1 в календарь RM OS. Новые и изменённые брони подтягиваются, удалённые или отменённые в Bnovo снимаются в календаре.",
      inputSchema: z.object({
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      }),
      execute: async (input) => {
        const summary = `Выгрузить брони Н11 из Bnovo${input.fromDate ? ` с ${input.fromDate}` : ""}`;
        ctx.propose({ tool: "runBnovoSync", summary, input });
        return { proposed: true, summary };
      },
    }),

    proposeTask: tool({
      description:
        "Предложить создание или изменение задачи RM OS: название, тип, дата, интервал времени (например 10:00–10:30), регулярность (повтор daily/weekly/monthly и срок жизни recurrenceUntil), исполнитель, объект, сделка CRM, комментарий, пункты чеклиста. С датой и временем задача видна в календаре. После выполнения регулярной задачи создаётся следующее повторение. Требует подтверждения менеджера.",
      inputSchema: z.object({
        taskId: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        typeName: z.string().optional().describe("Название типа задачи"),
        dueDate: z.string().optional().describe("Дата ГГГГ-ММ-ДД, пустая строка чтобы убрать срок"),
        dueStart: z.string().optional().describe("Начало интервала ЧЧ:ММ"),
        dueEnd: z.string().optional().describe("Конец интервала ЧЧ:ММ"),
        isRecurring: z.boolean().optional().describe("Регулярная задача"),
        recurrence: z.enum(["daily", "weekly", "monthly"]).optional().describe("Периодичность повтора"),
        recurrenceUntil: z
          .string()
          .optional()
          .describe("Срок жизни регулярности ГГГГ-ММ-ДД; пустая строка чтобы убрать ограничение"),
        assigneeQuery: z.string().optional().describe("ФИО или почта исполнителя"),
        propertyRef: z.string().optional(),
        dealQuery: z.string().optional().describe("Название сделки CRM, к которой привязать задачу"),
        status: z.enum(["open", "done"]).optional(),
        items: z.array(z.string()).optional().describe("Пункты чеклиста при создании"),
      }),
      execute: async (input) => {
        const property = input.propertyRef ? await label(input.propertyRef) : null;
        if (input.propertyRef && !property) return { error: "Объект не найден" };
        let typeId: string | null = null;
        let typeLabel = "";
        if (input.typeName) {
          const { data: types } = await ctx.admin.from("task_types").select("id, name").order("position");
          const found = (types ?? []).find((t) => t.name.toLowerCase() === input.typeName!.toLowerCase());
          if (!found) return { error: "Тип задачи не найден. Сначала создайте его через proposeTaskType." };
          typeId = found.id;
          typeLabel = found.name;
        }
        let assigneeId: string | null = null;
        let assigneeName = "";
        if (input.assigneeQuery) {
          const term = input.assigneeQuery.toLowerCase();
          const { data: profiles } = await ctx.admin
            .from("profiles")
            .select("id, full_name, email")
            .limit(200);
          const found = (profiles ?? []).find((p) =>
            `${p.full_name} ${p.email}`.toLowerCase().includes(term),
          );
          if (!found) return { error: "Сотрудник не найден" };
          assigneeId = found.id;
          assigneeName = found.full_name || found.email;
        }
        const parts: string[] = [];
        if (input.title) parts.push(`«${input.title}»`);
        if (typeLabel) parts.push(`тип ${typeLabel}`);
        if (input.dueDate === "") parts.push("без срока");
        else if (input.dueDate) {
          const range =
            input.dueStart && input.dueEnd
              ? ` ${input.dueStart}–${input.dueEnd}`
              : input.dueStart
                ? ` ${input.dueStart}`
                : "";
          parts.push(`${input.dueDate}${range}`);
        }
        if (input.isRecurring === false) parts.push("без регулярности");
        else if (input.isRecurring || input.recurrence || input.recurrenceUntil != null) {
          const freq =
            input.recurrence === "daily"
              ? "каждый день"
              : input.recurrence === "monthly"
                ? "каждый месяц"
                : "каждую неделю";
          const until =
            input.recurrenceUntil === ""
              ? ", без срока жизни"
              : input.recurrenceUntil
                ? `, до ${input.recurrenceUntil}`
                : "";
          parts.push(`регулярная (${freq}${until})`);
        }
        if (assigneeName) parts.push(`исполнитель ${assigneeName}`);
        if (property) parts.push(`объект ${property.text}`);
        let dealId: string | null = null;
        if (input.dealQuery) {
          const { data: deals } = await ctx.admin
            .from("deals")
            .select("id, title")
            .ilike("title", `%${input.dealQuery}%`)
            .limit(5);
          const found = (deals ?? [])[0];
          if (!found) return { error: "Сделка не найдена" };
          dealId = found.id;
          parts.push(`сделка «${found.title}»`);
        }
        if (input.items?.length) parts.push(`чеклист: ${input.items.join(", ")}`);
        if (input.status === "done") parts.push("выполнена");
        const summary = `${input.taskId ? "Изменить" : "Создать"} задачу: ${parts.join(", ") || "поля задачи"}`;
        ctx.propose({
          tool: "upsertTask",
          summary,
          input: {
            taskId: input.taskId ?? null,
            title: input.title ?? null,
            description: input.description ?? null,
            typeId,
            dueDate: input.dueDate ?? null,
            dueStart: input.dueStart ?? null,
            dueEnd: input.dueEnd ?? null,
            isRecurring: input.isRecurring ?? null,
            recurrence: input.recurrence ?? null,
            recurrenceUntil: input.recurrenceUntil ?? null,
            clearRecurrenceUntil: input.recurrenceUntil === "",
            assigneeId,
            propertyId: property?.id ?? null,
            dealId,
            status: input.status ?? null,
            items: input.items ?? null,
            clearDue: input.dueDate === "",
          },
        });
        return { proposed: true, summary };
      },
    }),

    proposeCompleteTask: tool({
      description: "Предложить отметить задачу выполненной. Требует подтверждения.",
      inputSchema: z.object({ taskId: z.string() }),
      execute: async ({ taskId }) => {
        const { data: task } = await ctx.admin.from("tasks").select("title").eq("id", taskId).maybeSingle();
        if (!task) return { error: "Задача не найдена" };
        const summary = `Отметить задачу «${task.title}» выполненной`;
        ctx.propose({ tool: "completeTask", summary, input: { taskId } });
        return { proposed: true, summary };
      },
    }),

    proposePostponeTask: tool({
      description: "Предложить отложить задачу на другую дату (или убрать срок). Требует подтверждения.",
      inputSchema: z.object({
        taskId: z.string(),
        dueDate: z.string().optional().describe("Новая дата ГГГГ-ММ-ДД, пусто = без срока"),
      }),
      execute: async ({ taskId, dueDate }) => {
        const { data: task } = await ctx.admin.from("tasks").select("title").eq("id", taskId).maybeSingle();
        if (!task) return { error: "Задача не найдена" };
        const summary = dueDate
          ? `Отложить задачу «${task.title}» на ${dueDate}`
          : `Убрать срок у задачи «${task.title}»`;
        ctx.propose({ tool: "postponeTask", summary, input: { taskId, dueDate: dueDate || null } });
        return { proposed: true, summary };
      },
    }),

    proposeTaskItem: tool({
      description:
        "Предложить пункт чеклиста задачи: добавить, отметить кружком выполненным/невыполненным или удалить. Пункты — отдельные сущности. Требует подтверждения.",
      inputSchema: z.object({
        taskId: z.string(),
        itemId: z.string().optional(),
        title: z.string().optional(),
        done: z.boolean().optional(),
        remove: z.boolean().optional(),
      }),
      execute: async ({ taskId, itemId, title, done, remove }) => {
        const { data: task } = await ctx.admin.from("tasks").select("title").eq("id", taskId).maybeSingle();
        if (!task) return { error: "Задача не найдена" };
        const summary = remove
          ? `Удалить пункт чеклиста задачи «${task.title}»`
          : itemId
            ? `Изменить пункт чеклиста задачи «${task.title}»${title ? `: ${title}` : ""}${done != null ? (done ? " — выполнен" : " — открыт") : ""}`
            : `Добавить пункт «${title ?? "пункт"}» в задачу «${task.title}»`;
        ctx.propose({
          tool: "upsertTaskItem",
          summary,
          input: { taskId, itemId: itemId ?? null, title: title ?? null, done, remove: Boolean(remove) },
        });
        return { proposed: true, summary };
      },
    }),

    proposeDeleteTask: tool({
      description: "Предложить удаление задачи RM OS. Требует подтверждения.",
      inputSchema: z.object({ taskId: z.string() }),
      execute: async ({ taskId }) => {
        const { data: task } = await ctx.admin.from("tasks").select("title").eq("id", taskId).maybeSingle();
        if (!task) return { error: "Задача не найдена" };
        const summary = `Удалить задачу «${task.title}»`;
        ctx.propose({ tool: "deleteTask", summary, input: { taskId } });
        return { proposed: true, summary };
      },
    }),

    proposeTaskType: tool({
      description:
        "Предложить создание или изменение типа задачи (название, цвет HEX, порядок position). Порядок в UI меняется drag-and-drop. Требует подтверждения.",
      inputSchema: z.object({
        typeId: z.string().optional(),
        name: z.string(),
        color: z.string().optional().describe("HEX цвет, например #3b82f6"),
        position: z.number().optional().describe("Позиция в списке типов, начиная с 0"),
      }),
      execute: async ({ typeId, name, color, position }) => {
        const summary = `${typeId ? "Изменить" : "Создать"} тип задачи «${name}»${color ? ` (${color})` : ""}${position != null ? `, позиция ${position}` : ""}`;
        ctx.propose({
          tool: "upsertTaskType",
          summary,
          input: { typeId: typeId ?? null, name, color: color ?? "#3b82f6", position: position ?? null },
        });
        return { proposed: true, summary };
      },
    }),

    proposeDeleteTaskType: tool({
      description: "Предложить удаление типа задачи. Требует подтверждения.",
      inputSchema: z.object({ typeId: z.string() }),
      execute: async ({ typeId }) => {
        const { data: type } = await ctx.admin.from("task_types").select("name").eq("id", typeId).maybeSingle();
        if (!type) return { error: "Тип не найден" };
        const summary = `Удалить тип задачи «${type.name}»`;
        ctx.propose({ tool: "deleteTaskType", summary, input: { typeId } });
        return { proposed: true, summary };
      },
    }),

    proposeMaintenanceServiceItem: tool({
      description:
        "Предложить создание, изменение или удаление пункта справочника услуг обслуживания (бассейн, сад, уборка…). Требует подтверждения.",
      inputSchema: z.object({
        itemId: z.string().optional(),
        name: z.string().optional(),
        remove: z.boolean().optional(),
        active: z.boolean().optional(),
      }),
      execute: async ({ itemId, name, remove, active }) => {
        if (remove) {
          if (!itemId) return { error: "Укажите itemId для удаления" };
          const { data } = await ctx.admin
            .from("maintenance_service_items")
            .select("name")
            .eq("id", itemId)
            .maybeSingle();
          if (!data) return { error: "Пункт не найден" };
          const summary = `Удалить услугу обслуживания «${data.name}»`;
          ctx.propose({ tool: "deleteMaintenanceServiceItem", summary, input: { itemId } });
          return { proposed: true, summary };
        }
        const title = (name ?? "").trim();
        if (!title) return { error: "Укажите название услуги" };
        const summary = `${itemId ? "Изменить" : "Создать"} услугу обслуживания «${title}»`;
        ctx.propose({
          tool: "upsertMaintenanceServiceItem",
          summary,
          input: { itemId: itemId ?? null, name: title, active: active ?? true },
        });
        return { proposed: true, summary };
      },
    }),

    proposePropertyMaintenanceServices: tool({
      description:
        "Предложить набор услуг обслуживания для объекта (по названиям из справочника). Требует подтверждения.",
      inputSchema: z.object({
        propertyRef: z.string(),
        serviceNames: z.array(z.string()).describe("Названия услуг из справочника"),
      }),
      execute: async ({ propertyRef, serviceNames }) => {
        const p = await label(propertyRef);
        if (!p) return { error: "Объект не найден" };
        const { data: catalog } = await ctx.admin
          .from("maintenance_service_items")
          .select("id, name")
          .eq("active", true);
        const ids: string[] = [];
        const missing: string[] = [];
        for (const raw of serviceNames) {
          const found = (catalog ?? []).find(
            (item) => item.name.toLowerCase() === raw.trim().toLowerCase(),
          );
          if (found) ids.push(found.id);
          else missing.push(raw);
        }
        if (missing.length) {
          return {
            error: `Не найдены услуги: ${missing.join(", ")}. Сначала создайте через proposeMaintenanceServiceItem.`,
          };
        }
        const summary = `Назначить услуги «${serviceNames.join(", ") || "нет"}» объекту ${p.text}`;
        ctx.propose({
          tool: "setPropertyMaintenanceServices",
          summary,
          input: { propertyId: p.id, serviceItemIds: ids },
        });
        return { proposed: true, summary };
      },
    }),

    proposeMaintenanceTask: tool({
      description:
        "Предложить задачу обслуживания (тип «Обслуживание»). Без сделки CRM. Объект — дом/вилла обслуживания; услуга — из справочника. Видна и в общем блоке задач. Требует подтверждения.",
      inputSchema: z.object({
        taskId: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        dueDate: z.string().optional(),
        dueStart: z.string().optional(),
        dueEnd: z.string().optional(),
        assigneeQuery: z.string().optional(),
        propertyRef: z.string().optional(),
        serviceName: z.string().optional().describe("Название услуги из справочника обслуживания"),
        items: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        const { data: types } = await ctx.admin.from("task_types").select("id, name").order("position");
        const maintenance = (types ?? []).find(
          (t) => String(t.name).trim().toLowerCase() === "обслуживание",
        );
        if (!maintenance) {
          return { error: "Тип «Обслуживание» не найден. Создайте через proposeTaskType или дождитесь миграции." };
        }
        const property = input.propertyRef ? await label(input.propertyRef) : null;
        if (input.propertyRef && !property) return { error: "Объект не найден" };
        let serviceItemId: string | null = null;
        let serviceLabel = "";
        if (input.serviceName) {
          const { data: catalog } = await ctx.admin
            .from("maintenance_service_items")
            .select("id, name")
            .eq("active", true);
          const found = (catalog ?? []).find(
            (item) => item.name.toLowerCase() === input.serviceName!.trim().toLowerCase(),
          );
          if (!found) {
            return {
              error: `Услуга «${input.serviceName}» не найдена. Создайте через proposeMaintenanceServiceItem.`,
            };
          }
          serviceItemId = found.id;
          serviceLabel = found.name;
        }
        let assigneeId: string | null = null;
        let assigneeName = "";
        if (input.assigneeQuery) {
          const term = input.assigneeQuery.toLowerCase();
          const { data: profiles } = await ctx.admin
            .from("profiles")
            .select("id, full_name, email")
            .limit(200);
          const found = (profiles ?? []).find((p) =>
            `${p.full_name} ${p.email}`.toLowerCase().includes(term),
          );
          if (!found) return { error: "Сотрудник не найден" };
          assigneeId = found.id;
          assigneeName = found.full_name || found.email;
        }
        const parts: string[] = ["тип Обслуживание"];
        if (input.title) parts.push(`«${input.title}»`);
        if (input.dueDate) parts.push(input.dueDate);
        if (assigneeName) parts.push(`исполнитель ${assigneeName}`);
        if (property) parts.push(`объект ${property.text}`);
        if (serviceLabel) parts.push(`услуга ${serviceLabel}`);
        const summary = `${input.taskId ? "Изменить" : "Создать"} задачу обслуживания: ${parts.join(", ")}`;
        ctx.propose({
          tool: "upsertTask",
          summary,
          input: {
            taskId: input.taskId ?? null,
            title: input.title ?? null,
            description: input.description ?? null,
            typeId: maintenance.id,
            dueDate: input.dueDate ?? null,
            dueStart: input.dueStart ?? null,
            dueEnd: input.dueEnd ?? null,
            assigneeId,
            propertyId: property?.id ?? null,
            dealId: null,
            clearDeal: true,
            maintenanceServiceItemId: serviceItemId,
            status: null,
            items: input.items ?? null,
            clearDue: input.dueDate === "",
          },
        });
        return { proposed: true, summary };
      },
    }),
  };
}
