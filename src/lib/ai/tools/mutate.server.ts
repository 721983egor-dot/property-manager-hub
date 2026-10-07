import { tool } from "ai";
import { z } from "zod";

import { propertyLabel } from "@/lib/ai/context.server";
import {
  PROPERTY_CLEARABLE_FIELDS,
  formatPropertyUpdateConfirmLabel,
  sanitizePropertyUpdateFields,
} from "@/lib/ai/property-update.server";

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
        "Частичное изменение объекта: передай ТОЛЬКО поля, которые менеджер явно попросил изменить (часто одно: priceMonth). Остальные ключи не указывай. Не заполняй схему пустыми строками или нулями — сервер их отбросит. Чтобы очистить поле, используй clearFields (например clearFields:[\"videoUrl\"]). Поля: title, internalName, address, complexName, type, rooms, bathrooms, area, floor, totalFloors, priceMonth, status, deposit, commission, utilitiesMonth, description, rentTerms, availabilityNote, forRent, videoUrl.",
      inputSchema: z.object({
        ref: z.string().describe("Внутреннее имя, номер ref_id или UUID объекта"),
        title: z.string().optional().describe("Только если меняем публичное название"),
        internalName: z.string().optional().describe("Только если меняем внутреннее название"),
        address: z.string().optional(),
        complexName: z.string().optional(),
        type: z.enum(["apartment", "aparts", "house", "villa", "townhouse"]).optional(),
        rooms: z.number().optional(),
        bathrooms: z.number().optional(),
        area: z.number().optional(),
        floor: z.number().optional(),
        totalFloors: z.number().optional(),
        priceMonth: z.number().optional().describe("Новая цена в месяц; другие поля не передавай"),
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
          .describe("Новая ссылка на видео; чтобы убрать — clearFields:[\"videoUrl\"] или videoUrl=\"\""),
        clearFields: z
          .array(z.enum(PROPERTY_CLEARABLE_FIELDS))
          .optional()
          .describe("Явная очистка полей (пусто/0). Без этого пустые значения не применяются."),
      }),
      execute: async ({ ref, ...rawFields }) => {
        const p = await label(ref);
        if (!p) return { error: "Объект не найден" };
        // Sanitize ДО сохранения propose и ДО текста подтверждения —
        // иначе UI показывает полный wipe с «», 0 комн., «убрать видео».
        const fields = sanitizePropertyUpdateFields(
          rawFields as Record<string, unknown>,
          p.row as Record<string, unknown>,
        );
        const summary = formatPropertyUpdateConfirmLabel(p.text, fields);
        if (!summary) {
          return {
            error:
              "Нет осмысленных изменений. Передай только поля, которые нужно изменить (без пустых строк и нулей). Для очистки — clearFields.",
          };
        }
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
        "Предложить ответ в чат RM OS (сайт РМ, сайт H11, ЦИАН или Авито) по id диалога. Требует подтверждения.",
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
          thread.source === "cian"
            ? "ЦИАН"
            : thread.source === "avito"
              ? "Авито"
              : thread.source === "n11"
                ? "H11 сайт"
                : "Сайт РМ";
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
        "Создать клиента или частично обновить данные. При изменении передавай только нужные поля (плюс fullName для поиска). Пустые строки не затирают телефон/комментарий/Telegram — для очистки укажи clearFields.",
      inputSchema: z.object({
        fullName: z.string(),
        phone: z.string().optional(),
        comment: z.string().optional(),
        blacklisted: z.boolean().optional(),
        blacklistReason: z.string().optional(),
        partyKind: z
          .enum(["rm", "owner", "n11"])
          .optional()
          .describe("Кто он: rm = РМ, owner = собственник, n11 = H11"),
        source: z
          .string()
          .optional()
          .describe("Источник: Сайт, Авито, ЦИАН, Telegram, WhatsApp, Рекомендация, Звонок и т.д."),
        telegram: z.string().optional().describe("Аккаунт Telegram (@username)"),
        propertyRef: z
          .string()
          .optional()
          .describe("По какому объекту обратился — ID или номер объекта"),
        clearFields: z
          .array(z.enum(["phone", "comment", "blacklistReason", "telegram", "source", "propertyId"]))
          .optional()
          .describe("Явная очистка полей клиента"),
      }),
      execute: async (input) => {
        const existing = await ctx.findClient(input.phone || input.fullName);
        const kindLabel =
          input.partyKind === "owner"
            ? "собственник"
            : input.partyKind === "n11"
              ? "H11"
              : input.partyKind === "rm"
                ? "РМ"
                : null;
        let propertyId: string | null | undefined = undefined;
        let propertyLabel = "";
        if (input.propertyRef) {
          const found = await label(input.propertyRef);
          if (!found) return { error: "Объект не найден", propertyRef: input.propertyRef };
          propertyId = found.id;
          propertyLabel = found.text;
        }
        const bits = [
          kindLabel,
          input.source ? `источник ${input.source}` : null,
          input.telegram ? `Telegram ${input.telegram}` : null,
          propertyLabel ? `объект ${propertyLabel}` : null,
          input.clearFields?.length ? `очистить ${input.clearFields.join(", ")}` : null,
        ].filter(Boolean);
        const summary = existing
          ? `Обновить клиента ${existing["full_name"] as string}${bits.length ? ` (${bits.join(", ")})` : ""}`
          : `Создать клиента ${input.fullName}${input.phone ? ` (${input.phone})` : ""}${bits.length ? `, ${bits.join(", ")}` : ""}`;
        const payload: Record<string, unknown> = {
          fullName: input.fullName,
          clientId: existing ? (existing["id"] as string) : null,
        };
        if (input.phone !== undefined) payload.phone = input.phone;
        if (input.comment !== undefined) payload.comment = input.comment;
        if (input.blacklisted !== undefined) payload.blacklisted = input.blacklisted;
        if (input.blacklistReason !== undefined) payload.blacklistReason = input.blacklistReason;
        if (input.partyKind !== undefined) payload.partyKind = input.partyKind;
        if (input.source !== undefined) payload.source = input.source;
        if (input.telegram !== undefined) payload.telegram = input.telegram;
        if (propertyId !== undefined) payload.propertyId = propertyId;
        if (input.clearFields?.length) payload.clearFields = input.clearFields;
        ctx.propose({
          tool: "upsertClient",
          summary,
          input: payload,
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
        "Создать или частично изменить сделку CRM / карточку «Новый объект». При изменении передавай dealId и ТОЛЬКО меняемые поля — остальные не указывай (пустые/null не затирают карточку). pipeline=rental по умолчанию при создании, intake — новые объекты.",
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
        const isCreate = !input.dealId;
        const pipeline =
          input.pipeline === "intake" ? "intake" : input.pipeline === "rental" ? "rental" : isCreate ? "rental" : null;
        let stages: { id: string; name: string; pipeline?: string }[] | null = null;
        if (input.stage || isCreate) {
          const pipeFilter = pipeline ?? "rental";
          const stagesQuery = ctx.admin.from("deal_stages").select("id, name, pipeline").order("position");
          const stageResult = await stagesQuery.eq("pipeline", pipeFilter);
          let data = stageResult.data;
          const stagesError = stageResult.error;
          if (stagesError && /pipeline|schema cache|could not find/i.test(stagesError.message)) {
            ({ data } = await ctx.admin.from("deal_stages").select("id, name").order("position"));
          }
          stages = data;
        }
        const stageRow = input.stage
          ? (stages ?? []).find((s) => s.name.toLowerCase() === input.stage!.toLowerCase())
          : null;
        if (input.stage && !stageRow) return { error: "Стадия не найдена в этой воронке" };
        const client = input.clientRef ? await ctx.findClient(input.clientRef) : null;
        if (input.clientRef && !client) return { error: "Клиент не найден" };
        const property = input.propertyRef ? await label(input.propertyRef) : null;
        if (input.propertyRef && !property) return { error: "Объект не найден" };
        const parts: string[] = [];
        if (pipeline) parts.push(pipeline === "intake" ? "новый объект" : "сделка");
        else parts.push("сделка");
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
        const payload: Record<string, unknown> = {
          dealId: input.dealId ?? null,
        };
        if (pipeline) payload.pipeline = pipeline;
        if (stageRow) payload.stageId = stageRow.id;
        else if (isCreate) payload.stageId = (stages ?? [])[0]?.id ?? null;
        if (input.clientRef) payload.clientId = client ? (client["id"] as string) : null;
        if (input.propertyRef) payload.propertyId = property?.id ?? null;
        if (input.title !== undefined) payload.title = input.title;
        if (input.source !== undefined) payload.source = input.source;
        if (input.budget !== undefined) payload.budget = input.budget;
        if (input.adults !== undefined) payload.adults = input.adults;
        if (input.children !== undefined) payload.children = input.children;
        if (input.comment !== undefined) payload.comment = input.comment;
        if (input.telegram !== undefined) payload.telegram = input.telegram;
        if (input.preferredMessenger !== undefined) payload.preferredMessenger = input.preferredMessenger;
        if (Object.keys(custom).length) payload.custom = custom;
        ctx.propose({
          tool: "upsertDeal",
          summary,
          input: payload,
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
        "Добавить или частично изменить номер H11. При изменении передавай roomId и только нужные поля — пустые/отсутствующие не затирают цену, этаж и т.д. ID комнаты Bnovo необязателен.",
      inputSchema: z.object({
        roomId: z.string().optional(),
        name: z.string().optional().describe("Название/номер; обязательно при создании"),
        category: z.string().optional(),
        bnovoRoomId: z.string().optional(),
        priceNight: z.number().optional(),
        guests: z.number().optional(),
        floor: z.number().optional(),
      }),
      execute: async (input) => {
        if (!input.roomId && !input.name?.trim()) {
          return { error: "Для нового номера укажите name" };
        }
        const summary = `${input.roomId ? "Обновить" : "Добавить"} номер H11 «${input.name?.trim() || input.roomId}»`;
        const payload: Record<string, unknown> = {};
        if (input.roomId) payload.roomId = input.roomId;
        if (input.name !== undefined) payload.name = input.name;
        if (input.category !== undefined) payload.category = input.category;
        if (input.bnovoRoomId !== undefined) payload.bnovoRoomId = input.bnovoRoomId;
        if (input.priceNight !== undefined) payload.priceNight = input.priceNight;
        if (input.guests !== undefined) payload.guests = input.guests;
        if (input.floor !== undefined) payload.floor = input.floor;
        ctx.propose({ tool: "saveHotelRoom", summary, input: payload });
        return { proposed: true, summary };
      },
    }),

    proposeHotelCategory: tool({
      description:
        "Добавить или частично изменить категорию H11 / Bnovo room_type_id. При изменении — только нужные поля.",
      inputSchema: z.object({
        categoryId: z.string().optional(),
        code: z.string().optional().describe("Обязателен при создании"),
        name: z.string().optional().describe("Обязателен при создании"),
        description: z.string().optional(),
        guests: z.number().optional(),
        bnovoRoomTypeId: z.string().optional(),
      }),
      execute: async (input) => {
        if (!input.categoryId && (!input.code?.trim() || !input.name?.trim())) {
          return { error: "Для новой категории укажите code и name" };
        }
        const summary = `${input.categoryId ? "Обновить" : "Добавить"} категорию H11 «${input.name?.trim() || input.code || input.categoryId}»`;
        const payload: Record<string, unknown> = {};
        if (input.categoryId) payload.categoryId = input.categoryId;
        if (input.code !== undefined) payload.code = input.code;
        if (input.name !== undefined) payload.name = input.name;
        if (input.description !== undefined) payload.description = input.description;
        if (input.guests !== undefined) payload.guests = input.guests;
        if (input.bnovoRoomTypeId !== undefined) payload.bnovoRoomTypeId = input.bnovoRoomTypeId;
        ctx.propose({ tool: "saveHotelCategory", summary, input: payload });
        return { proposed: true, summary };
      },
    }),

    proposeHotelOwner: tool({
      description:
        "Добавить или частично изменить собственника H11. При изменении передавай только нужные поля — пустые phone/email не затирают данные.",
      inputSchema: z.object({
        ownerId: z.string().optional(),
        fullName: z.string().optional().describe("Обязателен при создании"),
        phone: z.string().optional(),
        email: z.string().optional(),
        rooms: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        if (!input.ownerId && !input.fullName?.trim()) {
          return { error: "Для нового собственника укажите fullName" };
        }
        const summary = `${input.ownerId ? "Обновить" : "Добавить"} собственника ${input.fullName?.trim() || input.ownerId}`;
        const payload: Record<string, unknown> = {};
        if (input.ownerId) payload.ownerId = input.ownerId;
        if (input.fullName !== undefined) payload.fullName = input.fullName;
        if (input.phone !== undefined) payload.phone = input.phone;
        if (input.email !== undefined) payload.email = input.email;
        if (input.rooms !== undefined) payload.rooms = input.rooms;
        ctx.propose({ tool: "saveHotelOwner", summary, input: payload });
        return { proposed: true, summary };
      },
    }),

    proposeBnovoSync: tool({
      description:
        "Предложить внеочередную выгрузку броней апарт-отеля из Bnovo API v1 в календарь RM OS (обычный cron уже обновляет каждые ~10 минут). Новые и изменённые брони подтягиваются, удалённые или отменённые в Bnovo снимаются в календаре.",
      inputSchema: z.object({
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      }),
      execute: async (input) => {
        const summary = `Выгрузить брони H11 из Bnovo${input.fromDate ? ` с ${input.fromDate}` : ""}`;
        ctx.propose({ tool: "runBnovoSync", summary, input });
        return { proposed: true, summary };
      },
    }),

    proposeAssignHotelBookingRoom: tool({
      description:
        "Предложить назначить конкретный номер H11 брони из полосы «новая бронь» (OTA без юнита в Bnovo). Требует подтверждения менеджера.",
      inputSchema: z.object({
        bookingId: z.string().uuid().describe("ID брони в RM OS"),
        roomQuery: z.string().describe("Номер апартамента: 526, 530, 546, 567 или название"),
      }),
      execute: async (input) => {
        const { data: booking } = await ctx.admin
          .from("bookings")
          .select("id, property_id, start_date, end_date, bnovo_id, clients(full_name)")
          .eq("id", input.bookingId)
          .maybeSingle();
        if (!booking) return { error: "Бронь не найдена" };
        const term = input.roomQuery.trim().toLowerCase();
        const { data: rooms } = await ctx.admin
          .from("properties")
          .select("id, internal_name, title, is_unassigned_lane, portfolio")
          .eq("portfolio", "n11" as never);
        const room = (rooms ?? []).find((r) => {
          if ((r as { is_unassigned_lane?: boolean }).is_unassigned_lane) return false;
          const name = `${r.internal_name} ${r.title}`.toLowerCase();
          return name.includes(term) || r.internal_name === input.roomQuery.trim();
        });
        if (!room) return { error: "Номер H11 не найден" };
        const guest =
          (booking as { clients?: { full_name?: string } | null }).clients?.full_name || "гость";
        const summary = `Назначить номер ${room.internal_name || room.title} брони ${guest} (${booking.start_date} — ${booking.end_date})`;
        ctx.propose({
          tool: "assignHotelBookingRoom",
          summary,
          input: { bookingId: input.bookingId, propertyId: room.id },
        });
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
        "Создать или частично изменить тип задачи (название, цвет HEX, порядок position). При изменении не передавай color/position, если их не просили менять.",
      inputSchema: z.object({
        typeId: z.string().optional(),
        name: z.string().optional().describe("Обязателен при создании"),
        color: z.string().optional().describe("HEX цвет, например #3b82f6"),
        position: z.number().optional().describe("Позиция в списке типов, начиная с 0"),
      }),
      execute: async ({ typeId, name, color, position }) => {
        if (!typeId && !name?.trim()) return { error: "Укажите название типа" };
        const summary = `${typeId ? "Изменить" : "Создать"} тип задачи «${name?.trim() || typeId}»${color ? ` (${color})` : ""}${position != null ? `, позиция ${position}` : ""}`;
        const payload: Record<string, unknown> = { typeId: typeId ?? null };
        if (name !== undefined) payload.name = name;
        if (color !== undefined) payload.color = color;
        else if (!typeId) payload.color = "#3b82f6";
        if (position !== undefined) payload.position = position;
        ctx.propose({
          tool: "upsertTaskType",
          summary,
          input: payload,
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

    proposeCreatePayment: tool({
      description:
        "Предложить создание платежа в календаре Финансов: дата, сумма, приход/расход, статья, объект, контрагент, статус. Требует подтверждения менеджера.",
      inputSchema: z.object({
        plannedDate: z.string().describe("ГГГГ-ММ-ДД"),
        amount: z.number(),
        direction: z.enum(["in", "out"]).optional(),
        kind: z
          .enum([
            "rent_in",
            "deposit_in",
            "deposit_out",
            "owner_payout",
            "contractor",
            "agency_cost",
            "other",
          ])
          .optional(),
        status: z.enum(["expected", "partial", "paid"]).optional(),
        propertyRef: z.string().optional(),
        clientQuery: z.string().optional().describe("ФИО или телефон клиента CRM"),
        counterpartyName: z.string().optional(),
        comment: z.string().optional(),
        paidAt: z.string().optional(),
        paidAmount: z.number().optional(),
        articleId: z.string().optional().describe("id статьи из listFinanceCatalog"),
        articleName: z.string().optional().describe("Название статьи прихода/расхода"),
      }),
      execute: async (input) => {
        if (!input.plannedDate) return { error: "Укажите дату" };
        if (!Number.isFinite(input.amount) || input.amount < 0) return { error: "Укажите сумму" };
        let articleId = input.articleId ?? null;
        let articleName = "";
        let articleCode: string | null = null;
        if (articleId) {
          const { data } = await ctx.admin
            .from("finance_articles")
            .select("id, name, direction, code")
            .eq("id", articleId)
            .maybeSingle();
          if (!data) return { error: "Статья не найдена" };
          articleName = data.name;
          articleCode = data.code;
        } else if (input.articleName?.trim()) {
          const { data } = await ctx.admin
            .from("finance_articles")
            .select("id, name, direction, code")
            .ilike("name", `%${input.articleName.trim()}%`)
            .limit(5);
          if (!data?.length) return { error: "Статья не найдена. Смотри listFinanceCatalog." };
          if (data.length > 1) return { matches: data, hint: "Уточните имя или передайте articleId" };
          articleId = data[0]!.id;
          articleName = data[0]!.name;
          articleCode = data[0]!.code;
        }
        const kind = input.kind ?? (articleCode && ["rent_in","deposit_in","deposit_out","owner_payout","contractor","agency_cost","other"].includes(articleCode) ? articleCode : "other");
        const direction =
          input.direction ??
          (kind === "deposit_out" ||
          kind === "owner_payout" ||
          kind === "contractor" ||
          kind === "agency_cost"
            ? "out"
            : "in");
        const property = input.propertyRef ? await label(input.propertyRef) : null;
        if (input.propertyRef && !property) return { error: "Объект не найден" };
        let clientId: string | null = null;
        let clientName = "";
        if (input.clientQuery) {
          const term = input.clientQuery.toLowerCase();
          const { data: clients } = await ctx.admin
            .from("clients")
            .select("id, full_name, phone")
            .limit(300);
          const found = (clients ?? []).find((c) =>
            `${c.full_name} ${c.phone}`.toLowerCase().includes(term),
          );
          if (!found) return { error: "Клиент не найден" };
          clientId = found.id;
          clientName = found.full_name;
        }
        const parts = [
          `${direction === "in" ? "приход" : "расход"} ${money(input.amount)}`,
          input.plannedDate,
          articleName || kind,
        ];
        if (property) parts.push(`объект ${property.text}`);
        if (clientName) parts.push(clientName);
        else if (input.counterpartyName) parts.push(input.counterpartyName);
        const summary = `Создать платёж: ${parts.join(", ")}`;
        ctx.propose({
          tool: "createPayment",
          summary,
          input: {
            plannedDate: input.plannedDate,
            amount: input.amount,
            direction,
            kind,
            articleId,
            status: input.status ?? "expected",
            propertyId: property?.id ?? null,
            clientId,
            counterpartyName: input.counterpartyName ?? clientName ?? "",
            comment: input.comment ?? "",
            paidAt: input.paidAt ?? null,
            paidAmount: input.paidAmount ?? null,
          },
        });
        return { proposed: true, summary };
      },
    }),

    proposeUpdatePayment: tool({
      description:
        "Предложить изменение платежа Финансов (частичный патч: дата, сумма, статус, объект, комментарий…). Требует подтверждения.",
      inputSchema: z.object({
        paymentId: z.string(),
        plannedDate: z.string().optional(),
        amount: z.number().optional(),
        direction: z.enum(["in", "out"]).optional(),
        kind: z
          .enum([
            "rent_in",
            "deposit_in",
            "deposit_out",
            "owner_payout",
            "contractor",
            "agency_cost",
            "other",
          ])
          .optional(),
        status: z.enum(["expected", "partial", "paid", "overdue"]).optional(),
        propertyRef: z.string().optional(),
        clearProperty: z.boolean().optional(),
        clientQuery: z.string().optional(),
        clearClient: z.boolean().optional(),
        counterpartyName: z.string().optional(),
        comment: z.string().optional(),
        paidAt: z.string().optional(),
        paidAmount: z.number().optional(),
      }),
      execute: async (input) => {
        const { data: payment } = await ctx.admin
          .from("payments")
          .select("id, planned_date, amount, kind, status")
          .eq("id", input.paymentId)
          .maybeSingle();
        if (!payment) return { error: "Платёж не найден" };
        let propertyId: string | null | undefined;
        let propertyText = "";
        if (input.clearProperty) propertyId = null;
        else if (input.propertyRef) {
          const property = await label(input.propertyRef);
          if (!property) return { error: "Объект не найден" };
          propertyId = property.id;
          propertyText = property.text;
        }
        let clientId: string | null | undefined;
        let clientName = "";
        if (input.clearClient) clientId = null;
        else if (input.clientQuery) {
          const term = input.clientQuery.toLowerCase();
          const { data: clients } = await ctx.admin
            .from("clients")
            .select("id, full_name, phone")
            .limit(300);
          const found = (clients ?? []).find((c) =>
            `${c.full_name} ${c.phone}`.toLowerCase().includes(term),
          );
          if (!found) return { error: "Клиент не найден" };
          clientId = found.id;
          clientName = found.full_name;
        }
        const parts: string[] = [`${payment.planned_date}, ${money(Number(payment.amount))}`];
        if (input.plannedDate) parts.push(`дата → ${input.plannedDate}`);
        if (input.amount != null) parts.push(`сумма → ${money(input.amount)}`);
        if (input.status) parts.push(`статус → ${input.status}`);
        if (propertyText) parts.push(`объект → ${propertyText}`);
        if (clientName) parts.push(`клиент → ${clientName}`);
        const summary = `Изменить платёж: ${parts.join(", ")}`;
        ctx.propose({
          tool: "updatePayment",
          summary,
          input: {
            paymentId: input.paymentId,
            plannedDate: input.plannedDate ?? null,
            amount: input.amount ?? null,
            direction: input.direction ?? null,
            kind: input.kind ?? null,
            status: input.status ?? null,
            propertyId: propertyId === undefined ? undefined : propertyId,
            setProperty: propertyId !== undefined,
            clientId: clientId === undefined ? undefined : clientId,
            setClient: clientId !== undefined,
            counterpartyName: input.counterpartyName ?? null,
            comment: input.comment ?? null,
            paidAt: input.paidAt ?? null,
            paidAmount: input.paidAmount ?? null,
          },
        });
        return { proposed: true, summary };
      },
    }),

    proposeMarkPaymentPaid: tool({
      description: "Предложить отметить платёж оплаченным (вручную, без банка). Требует подтверждения.",
      inputSchema: z.object({
        paymentId: z.string(),
        paidAt: z.string().optional().describe("ГГГГ-ММ-ДД"),
        paidAmount: z.number().optional(),
      }),
      execute: async ({ paymentId, paidAt, paidAmount }) => {
        const { data: payment } = await ctx.admin
          .from("payments")
          .select("id, planned_date, amount, kind, status")
          .eq("id", paymentId)
          .maybeSingle();
        if (!payment) return { error: "Платёж не найден" };
        const summary = `Отметить оплаченным платёж ${payment.planned_date}, ${money(Number(payment.amount))} (${payment.kind})`;
        ctx.propose({
          tool: "markPaymentPaid",
          summary,
          input: {
            paymentId,
            paidAt: paidAt ?? null,
            paidAmount: paidAmount ?? null,
          },
        });
        return { proposed: true, summary };
      },
    }),

    proposeCreateCounterparty: tool({
      description:
        "Предложить создание контрагента Финансов (арендатор, собственник, подрядчик, сотрудник, депозит, прочее). Требует подтверждения.",
      inputSchema: z.object({
        name: z.string(),
        kind: z
          .enum(["tenant", "owner", "contractor", "employee", "deposit", "other"])
          .optional(),
        comment: z.string().optional(),
      }),
      execute: async ({ name, kind, comment }) => {
        const trimmed = name.trim();
        if (!trimmed) return { error: "Укажите имя контрагента" };
        const type = kind ?? "other";
        const summary = `Создать контрагента «${trimmed}» (${type})`;
        ctx.propose({
          tool: "createCounterparty",
          summary,
          input: { name: trimmed, kind: type, comment: comment ?? "" },
        });
        return { proposed: true, summary };
      },
    }),

    proposeObligationPayment: tool({
      description:
        "Предложить оплату существующего обязательства контрагента. Связывает операцию с обязательством; оплаченная сумма уменьшит долг. Требует подтверждения.",
      inputSchema: z.object({
        obligationId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amount: z.number().positive(),
        status: z.enum(["expected", "paid"]).default("expected"),
      }),
      execute: async (input) => {
        const { data: obligation, error } = await ctx.admin
          .from("finance_obligations")
          .select("id, counterparty_id, direction, description, property_id, status")
          .eq("id", input.obligationId)
          .single();
        if (error) return { error: error.message };
        if (obligation.status !== "open") return { error: "Обязательство закрыто" };
        const { data: party, error: partyError } = await ctx.admin
          .from("finance_counterparties")
          .select("name")
          .eq("id", obligation.counterparty_id)
          .single();
        if (partyError) return { error: partyError.message };
        const direction = obligation.direction === "payable" ? "out" : "in";
        const summary = `${direction === "out" ? "Расход" : "Приход"} ${money(input.amount)} · ${party.name} · ${input.date} · ${input.status === "paid" ? "оплачено" : "ожидается"} · обязательство «${obligation.description}»`;
        ctx.propose({
          tool: "createPayment",
          summary,
          input: {
            plannedDate: input.date,
            amount: input.amount,
            direction,
            status: input.status,
            counterpartyId: obligation.counterparty_id,
            counterpartyName: party.name,
            obligationId: obligation.id,
            propertyId: obligation.property_id,
            comment: obligation.description,
          },
        });
        return { proposed: true, summary };
      },
    }),

    proposeSaveFinanceObjectClassification: tool({
      description:"Предложить создать или переименовать финансовую классификацию объектов РМ ОС. Требует подтверждения.",
      inputSchema:z.object({id:z.string().uuid().optional(),name:z.string().trim().min(1)}),
      execute:async input=>{const summary=`${input.id?"Переименовать":"Создать"} классификацию объектов «${input.name}»`;ctx.propose({tool:"saveFinanceObjectClassification",summary,input});return {proposed:true,summary};},
    }),
    proposeDeleteFinanceObjectClassification: tool({
      description:"Предложить удалить финансовую классификацию объектов. Объекты, операции и обязательства сохраняются. Требует подтверждения.",
      inputSchema:z.object({id:z.string().uuid()}),
      execute:async input=>{const {data,error}=await ctx.admin.from("finance_object_classes").select("name").eq("id",input.id).maybeSingle();if(error||!data)return {error:error?.message??"Классификация не найдена"};const summary=`Удалить классификацию объектов «${data.name}», сохранив объекты и финансовую историю`;ctx.propose({tool:"deleteFinanceObjectClassification",summary,input});return {proposed:true,summary};},
    }),
    proposeAssignFinanceObjectClassification: tool({
      description:"Предложить назначить или снять финансовую классификацию существующего объекта РМ ОС. Не меняет параметры недвижимости. Требует подтверждения.",
      inputSchema:z.object({propertyId:z.string().uuid(),classificationId:z.string().uuid().nullable()}),
      execute:async input=>{
        const property=await ctx.admin.from("properties").select("title,internal_name").eq("id",input.propertyId).maybeSingle();if(property.error||!property.data)return {error:property.error?.message??"Объект не найден"};
        const group=input.classificationId?await ctx.admin.from("finance_object_classes").select("name").eq("id",input.classificationId).maybeSingle():null;if(group?.error||(input.classificationId&&!group?.data))return {error:group?.error?.message??"Классификация не найдена"};
        const summary=`Классификация объекта «${property.data.internal_name||property.data.title}»: ${group?.data?.name??"без классификации"}`;ctx.propose({tool:"assignFinanceObjectClassification",summary,input});return {proposed:true,summary};
      },
    }),
    proposeUpdateFinanceObligation: tool({
      description:"Предложить скорректировать финансовое обязательство: сумму, дату, описание, юридическое лицо, направление, контрагента, состояние. Требует подтверждения.",
      inputSchema:z.object({id:z.string().uuid(),amount:z.number().positive().optional(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),description:z.string().optional(),legalEntity:z.string().trim().min(1).optional(),direction:z.enum(["receivable","payable"]).optional(),counterpartyId:z.string().uuid().optional(),status:z.enum(["open","closed"]).optional()}),
      execute:async input=>{const {data,error}=await ctx.admin.from("finance_obligations").select("id,description,amount").eq("id",input.id).maybeSingle();if(error||!data)return {error:error?.message??"Обязательство не найдено"};const summary=`Изменить обязательство «${data.description||data.id}»: ${JSON.stringify(input)}`;ctx.propose({tool:"updateFinanceObligation",summary,input});return {proposed:true,summary};},
    }),

    proposeSaveCounterpartyClassification: tool({
      description:
        "Предложить создать или переименовать пользовательскую классификацию контрагентов. Требует подтверждения.",
      inputSchema: z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1) }),
      execute: async (input) => {
        const summary = `${input.id ? "Переименовать" : "Создать"} классификацию «${input.name}»`;
        ctx.propose({ tool: "saveCounterpartyClassification", summary, input });
        return { proposed: true, summary };
      },
    }),
    proposeDeleteCounterpartyClassification: tool({
      description:
        "Предложить удалить классификацию. Контрагенты и их операции сохраняются, классификация снимается. Требует подтверждения.",
      inputSchema: z.object({ id: z.string().uuid() }),
      execute: async (input) => {
        const { data, error } = await ctx.admin
          .from("finance_counterparty_classes")
          .select("id, name")
          .eq("id", input.id)
          .single();
        if (error) return { error: error.message };
        const summary = `Удалить классификацию «${(data as { name: string }).name}»; контрагенты останутся без классификации`;
        ctx.propose({ tool: "deleteCounterpartyClassification", summary, input });
        return { proposed: true, summary };
      },
    }),
    proposeUpdateCounterpartyCard: tool({
      description:
        "Предложить изменить имя, классификацию или реквизиты контрагента. Требует подтверждения.",
      inputSchema: z.object({
        counterpartyId: z.string().uuid(),
        name: z.string().trim().min(1).optional(),
        classificationId: z.string().uuid().nullable().optional(),
        requisites: z.string().optional(),
      }),
      execute: async (input) => {
        const { data, error } = await ctx.admin
          .from("finance_counterparties")
          .select("name")
          .eq("id", input.counterpartyId)
          .single();
        if (error) return { error: error.message };
        const summary = `Изменить карточку «${data.name}»: ${input.name !== undefined ? `имя «${input.name}»; ` : ""}${input.classificationId !== undefined ? `классификация ${input.classificationId ?? "снята"}; ` : ""}${input.requisites !== undefined ? `реквизиты «${input.requisites}»` : ""}`;
        ctx.propose({ tool: "updateCounterpartyCard", summary, input });
        return { proposed: true, summary };
      },
    }),

    proposeUpdateCounterpartyKind: tool({
      description:
        "Предложить сменить тип контрагента Финансов: tenant/owner/contractor/employee/deposit/other. Требует подтверждения.",
      inputSchema: z.object({
        counterpartyId: z.string().optional(),
        name: z.string().optional(),
        kind: z.enum(["tenant", "owner", "contractor", "employee", "deposit", "other"]),
      }),
      execute: async ({ counterpartyId, name, kind }) => {
        let party: { id: string; name: string; kind: string } | null = null;
        if (counterpartyId) {
          const { data } = await ctx.admin
            .from("finance_counterparties")
            .select("id, name, kind")
            .eq("id", counterpartyId)
            .maybeSingle();
          party = data;
        } else if (name?.trim()) {
          const { data } = await ctx.admin
            .from("finance_counterparties")
            .select("id, name, kind")
            .ilike("name", `%${name.trim()}%`)
            .limit(5);
          if (!data?.length) return { error: "Контрагент не найден" };
          if (data.length > 1) return { matches: data, hint: "Уточните имя или передайте counterpartyId" };
          party = data[0]!;
        } else {
          return { error: "Укажите counterpartyId или имя" };
        }
        if (!party) return { error: "Контрагент не найден" };
        const summary = `Сменить тип «${party.name}»: ${party.kind} → ${kind}`;
        ctx.propose({
          tool: "updateCounterpartyKind",
          summary,
          input: { counterpartyId: party.id, kind },
        });
        return { proposed: true, summary };
      },
    }),

    proposeCreateObligation: tool({
      description:
        "Предложить обязательство контрагента: receivable = должен нам (мы передали), payable = мы должны. Требует подтверждения.",
      inputSchema: z.object({
        counterpartyId: z.string().optional(),
        counterpartyName: z.string().optional(),
        plannedDate: z.string().describe("ГГГГ-ММ-ДД"),
        amount: z.number(),
        direction: z.enum(["receivable", "payable"]).optional(),
        description: z.string().optional(),
        legalEntity: z.string().optional().describe("Юридическое лицо, от имени которого передали"),
        propertyRef: z.string().optional(),
      }),
      execute: async (input) => {
        if (!input.plannedDate) return { error: "Укажите дату" };
        if (!Number.isFinite(input.amount) || input.amount < 0) return { error: "Укажите сумму" };
        let party: { id: string; name: string } | null = null;
        if (input.counterpartyId) {
          const { data } = await ctx.admin
            .from("finance_counterparties")
            .select("id, name")
            .eq("id", input.counterpartyId)
            .maybeSingle();
          party = data;
        } else if (input.counterpartyName?.trim()) {
          const { data: found } = await ctx.admin
            .from("finance_counterparties")
            .select("id, name")
            .ilike("name", `%${input.counterpartyName.trim()}%`)
            .limit(5);
          if (!found?.length) return { error: "Контрагент не найден. Сначала proposeCreateCounterparty." };
          if (found.length > 1) return { matches: found, hint: "Уточните имя или передайте counterpartyId" };
          party = found[0]!;
        } else {
          return { error: "Укажите контрагента" };
        }
        if (!party) return { error: "Контрагент не найден" };
        const property = input.propertyRef ? await label(input.propertyRef) : null;
        if (input.propertyRef && !property) return { error: "Объект не найден" };
        const direction = input.direction ?? "receivable";
        const dirLabel = direction === "receivable" ? "должен нам" : "мы должны";
        const parts = [`«${party.name}»`, dirLabel, money(input.amount), input.plannedDate];
        if (property) parts.push(`проект ${property.text}`);
        const summary = `Добавить обязательство: ${parts.join(", ")}`;
        const detailedSummary = input.legalEntity?.trim() ? `${summary} · юр. лицо ${input.legalEntity.trim()}` : summary;
        ctx.propose({
          tool: "createObligation",
          summary: detailedSummary,
          input: {
            counterpartyId: party.id,
            plannedDate: input.plannedDate,
            amount: input.amount,
            direction,
            description: input.description ?? "",
            legalEntity: input.legalEntity ?? "",
            propertyId: property?.id ?? null,
          },
        });
        return { proposed: true, summary: detailedSummary };
      },
    }),

    proposeSaveFinanceArticleCategory: tool({
      description:
        "Предложить создать или переименовать категорию статей Финансов (группа для отчётов). Требует подтверждения.",
      inputSchema: z.object({
        categoryId: z.string().optional(),
        name: z.string(),
        direction: z.enum(["in", "out"]).optional(),
      }),
      execute: async ({ categoryId, name, direction }) => {
        const trimmed = name.trim();
        if (!trimmed) return { error: "Укажите название категории" };
        const dir = direction ?? "out";
        const summary = categoryId
          ? `Переименовать категорию статей в «${trimmed}»`
          : `Создать категорию статей «${trimmed}» (${dir === "in" ? "приход" : "расход"})`;
        ctx.propose({
          tool: "saveFinanceArticleCategory",
          summary,
          input: { categoryId: categoryId ?? null, name: trimmed, direction: dir },
        });
        return { proposed: true, summary };
      },
    }),

    proposeDeleteFinanceArticleCategory: tool({
      description: "Предложить удалить категорию статей Финансов. Статьи останутся без группы. Требует подтверждения.",
      inputSchema: z.object({ categoryId: z.string() }),
      execute: async ({ categoryId }) => {
        const { data } = await ctx.admin
          .from("finance_article_categories")
          .select("id, name")
          .eq("id", categoryId)
          .maybeSingle();
        if (!data) return { error: "Категория не найдена" };
        const summary = `Удалить категорию статей «${data.name}»`;
        ctx.propose({ tool: "deleteFinanceArticleCategory", summary, input: { categoryId } });
        return { proposed: true, summary };
      },
    }),

    proposeReorderFinanceArticleCategories: tool({
      description: "Предложить порядок категорий статей Финансов (список id сверху вниз). Требует подтверждения.",
      inputSchema: z.object({
        categoryIds: z.array(z.string()).min(1),
      }),
      execute: async ({ categoryIds }) => {
        const summary = `Поменять порядок категорий статей (${categoryIds.length})`;
        ctx.propose({
          tool: "reorderFinanceArticleCategories",
          summary,
          input: { categoryIds },
        });
        return { proposed: true, summary };
      },
    }),

    proposeSaveFinanceArticle: tool({
      description:
        "Предложить создать или переименовать статью прихода/расхода Финансов. Требует подтверждения.",
      inputSchema: z.object({
        articleId: z.string().optional(),
        name: z.string(),
        direction: z.enum(["in", "out"]).optional(),
        categoryId: z.string().optional(),
        categoryName: z.string().optional(),
        cashFlowType: z.enum(["operating", "investing", "financing"]).optional(),
        affectsProfit: z.boolean().optional(),
      }),
      execute: async ({ articleId, name, direction, categoryId, categoryName, cashFlowType, affectsProfit }) => {
        const trimmed = name.trim();
        if (!trimmed) return { error: "Укажите название статьи" };
        const existing = articleId ? await ctx.admin.from("finance_articles").select("direction, category_id").eq("id",articleId).maybeSingle() : null;
        if (existing?.error) return {error:existing.error.message};
        if (articleId && !existing?.data) return {error:"Статья не найдена"};
        let resolvedCategory = categoryId ?? existing?.data?.category_id ?? null;
        if (!resolvedCategory && categoryName?.trim()) {
          const { data } = await ctx.admin
            .from("finance_article_categories")
            .select("id, name, direction")
            .ilike("name", `%${categoryName.trim()}%`)
            .limit(5);
          if (!data?.length) return { error: "Категория не найдена" };
          if (data.length > 1) return { matches: data, hint: "Уточните категорию или передайте categoryId" };
          resolvedCategory = data[0]!.id;
        }
        const dir = direction ?? existing?.data?.direction ?? "out";
        const baseSummary = articleId
          ? `Обновить статью «${trimmed}»`
          : `Создать статью «${trimmed}» (${dir === "in" ? "приход" : "расход"})`;
        const summary = baseSummary + (cashFlowType ? `; деятельность: ${cashFlowType}` : "") + (affectsProfit === undefined ? "" : `; в прибыли: ${affectsProfit ? "да" : "нет"}`);
        ctx.propose({
          tool: "saveFinanceArticle",
          summary,
          input: {
            articleId: articleId ?? null,
            name: trimmed,
            direction: dir,
            categoryId: resolvedCategory,
            ...(cashFlowType === undefined ? {} : {cashFlowType}),
            ...(affectsProfit === undefined ? {} : {affectsProfit}),
          },
        });
        return { proposed: true, summary };
      },
    }),

    proposeDeleteFinanceArticle: tool({
      description: "Предложить удалить статью Финансов. В операциях поле статьи станет пустым. Требует подтверждения.",
      inputSchema: z.object({ articleId: z.string() }),
      execute: async ({ articleId }) => {
        const { data } = await ctx.admin
          .from("finance_articles")
          .select("id, name")
          .eq("id", articleId)
          .maybeSingle();
        if (!data) return { error: "Статья не найдена" };
        const summary = `Удалить статью «${data.name}»`;
        ctx.propose({ tool: "deleteFinanceArticle", summary, input: { articleId } });
        return { proposed: true, summary };
      },
    }),

    proposeReorderFinanceArticles: tool({
      description: "Предложить порядок статей Финансов (список id сверху вниз). Требует подтверждения.",
      inputSchema: z.object({
        items: z.array(
          z.object({
            articleId: z.string(),
            categoryId: z.string().nullable().optional(),
          }),
        ),
      }),
      execute: async ({ items }) => {
        if (!items.length) return { error: "Пустой список" };
        const summary = `Поменять порядок статей (${items.length})`;
        ctx.propose({
          tool: "reorderFinanceArticles",
          summary,
          input: { items },
        });
        return { proposed: true, summary };
      },
    }),
  };
}
