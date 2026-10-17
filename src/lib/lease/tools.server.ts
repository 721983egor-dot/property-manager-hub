import { tool } from "ai";
import { z } from "zod";
import type { AssistantToolContext } from "@/lib/ai/context.server";
export function leaseReadTools(ctx: AssistantToolContext) {
  return {
    getLeaseContext: tool({
      description:
        "Подготовка договора аренды: доступные брони объекта, шаблоны, стороны и недостающие паспортные поля. Паспортные номера и сканы модели не передаются. Сначала выбери правильную бронь. Управление: ИП или доверенность, только комиссия: собственник или представитель. Только администратор.",
      inputSchema: z.object({
        propertyRef: z.string().optional(),
        bookingId: z.string().uuid().optional(),
        dealId: z.string().uuid().optional(),
      }),
      execute: async ({ propertyRef, ...input }) => {
        const s = await import("./service.server");
        const actor = await s.leaseActor();
        const property = propertyRef ? await ctx.findProperty(propertyRef) : null;
        if (propertyRef && !property) throw new Error("Объект не найден");
        return s.leaseAssistantContext(
          { ...input, ...(property ? { propertyId: String(property["id"]) } : {}) },
          actor,
        );
      },
    }),
  };
}
export function leaseMutateTools(ctx: AssistantToolContext) {
  return {
    proposePrepareLease: tool({
      description:
        "Предложить подготовить договор, акт и опись из существующей брони. Сначала getLeaseContext. passportDraftId из сообщения с фото; не проси и не передавай паспортные номера в инструменты. Уточни все недостающие данные одним сообщением. Только после подтверждения сохраняет паспорта в клиентах и PDF/Word в брони; Telegram отправляет файлы в личный чат автора. Стоимость и сроки меняются в брони отдельным подтверждением. ИП берётся из сохранённых реквизитов; если их нет, попроси заполнить форму в РМ ОС.",
      inputSchema: z.object({
        bookingId: z.string().uuid(),
        dealId: z.string().uuid().nullable().optional(),
        templateId: z.string().uuid(),
        passportDraftId: z.string().uuid().nullable(),
        ownerClientId: z.string().uuid().nullable(),
        signerMode: z.enum(["owner", "representative", "company"]),
        representative: z.string().max(1000),
        authority: z.string().max(1500),
        pets: z.boolean(),
        petKind: z.string().max(100),
        petCount: z.number().int().min(0).max(20),
        residents: z.string().max(2000),
        extra: z.string().max(6000),
        inventory: z.string().max(10000),
        includeAct: z.boolean(),
        includeInventory: z.boolean(),
      }),
      execute: async (input) => {
        const s = await import("./service.server");
        try {
          const p = await s.proposeLeasePreparation(input, await s.leaseActor());
          ctx.propose({
            tool: "prepareLease",
            summary: p.summary,
            input: { requestRef: p.requestRef },
          });
          return { proposed: true, summary: p.summary };
        } catch (e) {
          return {
            missing: (e as Error).message,
            instruction:
              "Уточни недостающее одним сообщением. Если паспорт распознан не полностью — попроси более чёткое фото или заполнение защищённой формы РМ ОС.",
          };
        }
      },
    }),
    proposeSaveClientPassport: tool({
      description:
        "Предложить сохранить распознанный паспорт в выбранном клиенте. Только администратор, подтверждение. Используй passportDraftId, не паспортные поля.",
      inputSchema: z.object({ clientId: z.string().uuid(), passportDraftId: z.string().uuid() }),
      execute: async (input) => {
        const s = await import("./service.server");
        const actor = await s.leaseActor();
        await s.passportDraft(actor, input.passportDraftId);
        const summary =
          "Сохранить распознанные паспортные данные в выбранном клиенте. Данные будут доступны только администратору.";
        ctx.propose({ tool: "saveClientPassport", summary, input });
        return { proposed: true, summary };
      },
    }),
    proposeLeaseCompany: tool({
      description:
        "Предложить сохранить реквизиты своего ИП для договоров, только после подтверждения администратора.",
      inputSchema: z.object({
        name: z.string().max(300),
        inn: z.string().regex(/^\d{12}$/),
        ogrnip: z.string().regex(/^\d{15}$/),
        address: z.string().max(1000),
        phone: z.string().max(100),
      }),
      execute: async (input) => {
        const s = await import("./service.server");
        const ref = await s.stageLeaseSetting(await s.leaseActor(), "company", input);
        const summary = "Сохранить реквизиты ИП для следующих договоров";
        ctx.propose({ tool: "saveLeaseSetting", summary, input: { requestRef: ref } });
        return { proposed: true, summary };
      },
    }),
    proposeLeaseTemplate: tool({
      description:
        "Предложить сохранить шаблон аренды. Текст предоставляет администратор; не сочиняй юридические условия. getLeaseContext возвращает id и revision. Макросы в двойных фигурных скобках; утверждать можно только явно проверенный пользователем текст.",
      inputSchema: z.object({
        id: z.string().uuid(),
        revision: z.number().int(),
        name: z.string().max(200),
        body: z.string().max(80000),
        pets_clause: z.string().max(20000),
        act_body: z.string().max(40000),
        inventory_body: z.string().max(40000),
        approved: z.boolean(),
      }),
      execute: async (input) => {
        const s = await import("./service.server");
        const ref = await s.stageLeaseSetting(await s.leaseActor(), "template", input);
        const summary =
          "Сохранить шаблон договора «" +
          input.name +
          "»" +
          (input.approved ? " как проверенный пользователем" : " как черновик");
        ctx.propose({ tool: "saveLeaseSetting", summary, input: { requestRef: ref } });
        return { proposed: true, summary };
      },
    }),
  };
}
