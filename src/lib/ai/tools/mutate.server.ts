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
        "Предложить изменение полей объекта: цена, статус, депозит, комиссия (в %), коммунальные, описание, условия аренды, заметка о доступности.",
      inputSchema: z.object({
        ref: z.string(),
        priceMonth: z.number().optional(),
        status: z.enum(["free", "soon_free", "rented", "booked", "archived"]).optional(),
        deposit: z.number().optional(),
        commission: z.number().optional(),
        utilitiesMonth: z.number().optional(),
        description: z.string().optional(),
        rentTerms: z.string().optional(),
        availabilityNote: z.string().optional(),
      }),
      execute: async ({ ref, ...fields }) => {
        const p = await label(ref);
        if (!p) return { error: "Объект не найден" };
        const parts: string[] = [];
        if (fields.priceMonth != null) parts.push(`цена ${money(fields.priceMonth)}/мес`);
        if (fields.status) parts.push(`статус «${fields.status}»`);
        if (fields.deposit != null) parts.push(`депозит ${money(fields.deposit)}`);
        if (fields.commission != null) parts.push(`комиссия ${fields.commission}%`);
        if (fields.utilitiesMonth != null)
          parts.push(`коммунальные ${money(fields.utilitiesMonth)}`);
        if (fields.description) parts.push("новое описание");
        if (fields.rentTerms) parts.push("новые условия аренды");
        if (fields.availabilityNote) parts.push("заметка о доступности");
        if (!parts.length) return { error: "Не указано ни одного изменения" };
        const summary = `Изменить «${p.text}»: ${parts.join(", ")}`;
        ctx.propose({ tool: "updateProperty", summary, input: { propertyId: p.id, fields } });
        return { proposed: true, summary };
      },
    }),

    proposeCreateProperty: tool({
      description:
        "Предложить создание нового объекта с заполненной карточкой. Объект создаётся неопубликованным.",
      inputSchema: z.object({
        title: z.string(),
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
        const summary = `Создать объект «${input.title}» (${input.rooms} комн.${input.priceMonth ? `, ${money(input.priceMonth)}/мес` : ""})`;
        ctx.propose({ tool: "createProperty", summary, input });
        return { proposed: true, summary };
      },
    }),

    proposeSelection: tool({
      description:
        "Предложить создание подборки объектов для клиента. Указывать номера объектов (ref_id) списком.",
      inputSchema: z.object({
        refs: z.array(z.string()),
        name: z.string().optional(),
        clientName: z.string().optional(),
        comment: z.string().optional(),
      }),
      execute: async ({ refs, name, clientName, comment }) => {
        const found: { id: string; text: string }[] = [];
        for (const r of refs) {
          const p = await label(r);
          if (p) found.push({ id: p.id, text: p.text });
        }
        if (!found.length) return { error: "Объекты не найдены" };
        const summary = `Создать подборку${name ? ` «${name}»` : ""}${clientName ? ` для ${clientName}` : ""}: ${found.map((f) => f.text).join("; ")}`;
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
        return { proposed: true, summary };
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
        "Предложить создание клиента или изменение его данных (комментарий, чёрный список).",
      inputSchema: z.object({
        fullName: z.string(),
        phone: z.string().optional(),
        comment: z.string().optional(),
        blacklisted: z.boolean().optional(),
        blacklistReason: z.string().optional(),
      }),
      execute: async (input) => {
        const existing = await ctx.findClient(input.phone || input.fullName);
        const summary = existing
          ? `Обновить клиента ${existing["full_name"] as string}`
          : `Создать клиента ${input.fullName}${input.phone ? ` (${input.phone})` : ""}`;
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
        "Предложить создание или изменение сделки CRM: название, стадия, клиент, объект, источник, бюджет, взрослые, дети, комментарий, дополнительные поля. Требует подтверждения менеджера.",
      inputSchema: z.object({
        dealId: z.string().optional(),
        title: z.string().optional(),
        stage: z.string().optional(),
        clientRef: z.string().optional(),
        propertyRef: z.string().optional(),
        source: z.string().optional(),
        budget: z.number().optional(),
        adults: z.number().optional(),
        children: z.number().optional(),
        comment: z.string().optional(),
        custom: z.record(z.string(), z.string()).optional(),
      }),
      execute: async (input) => {
        const { data: stages } = await ctx.admin
          .from("deal_stages")
          .select("id, name")
          .order("position");
        const stageRow = input.stage
          ? (stages ?? []).find((s) => s.name.toLowerCase() === input.stage!.toLowerCase())
          : null;
        if (input.stage && !stageRow) return { error: "Стадия не найдена" };
        const client = input.clientRef ? await ctx.findClient(input.clientRef) : null;
        const property = input.propertyRef ? await label(input.propertyRef) : null;
        const parts: string[] = [];
        if (input.title) parts.push(`«${input.title}»`);
        if (stageRow) parts.push(`стадия «${stageRow.name}»`);
        if (client) parts.push(`клиент ${client["full_name"] as string}`);
        if (property) parts.push(`объект ${property.text}`);
        if (input.budget != null) parts.push(`бюджет ${money(input.budget)}`);
        if (input.adults != null || input.children != null)
          parts.push(`гости ${input.adults ?? 0} взр. / ${input.children ?? 0} дет.`);
        if (input.source) parts.push(`источник ${input.source}`);
        const summary = `${input.dealId ? "Изменить" : "Создать"} сделку: ${parts.join(", ") || "без изменений"}`;
        ctx.propose({
          tool: "upsertDeal",
          summary,
          input: {
            dealId: input.dealId ?? null,
            stageId: stageRow?.id ?? (stages ?? [])[0]?.id ?? null,
            clientId: client ? (client["id"] as string) : null,
            propertyId: property?.id ?? null,
            title: input.title ?? null,
            source: input.source ?? null,
            budget: input.budget ?? null,
            adults: input.adults ?? null,
            children: input.children ?? null,
            comment: input.comment ?? null,
            custom: input.custom ?? null,
          },
        });
        return { proposed: true, summary };
      },
    }),
  };
}
