import {
  managerCatalogFilterSchema,
  filterManagerCatalog,
  catalogComplexOptions,
  catalogFilterError,
  catalogFilterPrice,
} from "./manager-catalog-filters";
import { loadManagerCatalog } from "./working-selections.server";
import { tool } from "ai";
import { z } from "zod";
import type { AssistantToolContext } from "./ai/context.server";
import { workingSelectionSchema, managerNoteSchema } from "./working-selections-model";
import { keyRequestActor } from "./property-keys.server";
import { workingAssistantRead } from "./working-selections.server";
export function workingSelectionReadTools() {
  return {
    getManagerCatalog: tool({
      description:
        "Каталог объектов для менеджера с теми же фильтрами, что в интерфейсе: комплекс, диапазон цены (включительно), обычная/летняя цена, тип, комнаты (0 = студия, 4+), площадь, статус, публикация и сортировка. complex = ключ из complexes (id:UUID / name:название / none); all = все. Без финансов собственника и ключей. Только чтение, настройку сохранённых объектов не меняет.",
      inputSchema: managerCatalogFilterSchema,
      execute: async (filters) => {
        const actor = await keyRequestActor();
        const w = await loadManagerCatalog(actor.id);
        const error = catalogFilterError(filters);
        if (error) return { error };
        const rows = filterManagerCatalog(w.properties, filters);
        return {
          filters,
          total: rows.length,
          complexes: catalogComplexOptions(w.properties),
          properties: rows.map((p) => ({
            id: p.id,
            ref: p.ref_id,
            name: p.internal_name || p.title,
            complex: p.complex_name,
            status: p.status,
            address: p.address,
            rooms: p.rooms,
            area: p.area,
            price: catalogFilterPrice(p, filters),
            regularPrice: p.price_month,
            summerPrice: p.seasonal_pricing ? p.summer_price_month : null,
            published: p.published,
          })),
        };
      },
    }),
    getWorkingSelections: tool({
      description:
        "Рабочие подборки менеджеров: сохранённые объекты в порядке показа, версии для изменений, связь со сделкой CRM, дата, внутренние заметки и результаты; также каталог и отдельная информация для менеджеров. Ключи не включены. Публичная ссылка /p/code, рабочая /selections/id. Сначала прочитай перед изменением.",
      inputSchema: z.object({}),
      execute: async () => workingAssistantRead(),
    }),
  };
}
export function workingSelectionMutateTools(ctx: AssistantToolContext) {
  return {
    proposeWorkingSelection: tool({
      description:
        "Создать/изменить рабочую подборку после getWorkingSelections. Полный снимок, items в нужном порядке, expected = прочитанная версия. Новая подборка: новый UUID и expected=0. Сохраняй существующие заметки и результаты, если пользователь не просил менять. Без ключей и без отправки сообщений. name и publicComment видны клиенту; note и feedback только сотрудникам. dealId связывает со сделкой, её стадия не меняется. Только после подтверждения.",
      inputSchema: workingSelectionSchema,
      execute: async (input) => {
        await keyRequestActor();
        const summary = `Сохранить подборку «${input.name}»: ${input.items.length} объектов, сделка ${input.dealId ?? "не выбрана"}, дата ${input.showingDate || "не назначена"}; результаты и порядок из предложения. Клиентский комментарий: ${input.publicComment || "нет"}`;
        ctx.propose({ tool: "saveWorkingSelection", summary, input });
        return { proposed: true, summary };
      },
    }),
    proposeManagerPropertyNote: tool({
      description:
        "Изменить внутреннюю информацию для менеджеров: показ, доступ и рабочие вопросы. expected взять из getWorkingSelections.notes. На сайт и в клиентскую подборку не попадает. После подтверждения.",
      inputSchema: managerNoteSchema,
      execute: async (input) => {
        await keyRequestActor();
        const summary = `Сохранить информацию для менеджеров объекта ${input.propertyId}: ${input.note || "очистить"}`;
        ctx.propose({ tool: "saveManagerPropertyNote", summary, input });
        return { proposed: true, summary };
      },
    }),
  };
}
