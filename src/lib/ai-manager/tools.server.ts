import { tool } from "ai";
import { z } from "zod";
import type { AssistantToolContext } from "@/lib/ai/context.server";
import { playbookSchema } from "./model";
import {
  employeeScenarioApproval,
  employeeScenarioInput,
  employeeScenarios,
  supportPlaybookInput,
} from "./employee-tests";

export function managerReadTools() {
  return {
    getAiEmployeeHandbooks: tool({
      description:
        "Показать действующие памятки, подтверждённые правила и время проверки навыков Марины и Александра. Только администратор.",
      inputSchema: z.object({}),
      execute: async () => (await import("./employee-tests.server")).getEmployeeHandbooks(),
    }),
    checkEmployeeConnection: tool({
      description:
        "Проверить модель ИИ-сотрудников из серверного процесса РМ ОС коротким запросом без клиентских данных. Только администратор.",
      inputSchema: z.object({}),
      execute: async () => (await import("./employee-tests.server")).checkEmployeeConnection(),
    }),
    getAlexanderPlaybook: tool({
      description: "Памятка Александра по сопровождению аренды и её версия. Только администратор.",
      inputSchema: z.object({}),
      execute: async () => (await import("./employee-tests.server")).getSupportPlaybook(),
    }),
    runAiEmployeeScenario: tool({
      description:
        "Выполнить один учебный сценарий Марины или Александра. Использует сохранённую памятку и вымышленные данные, только показывает черновик.",
      inputSchema: employeeScenarioInput,
      execute: async (input) =>
        (await import("./employee-tests.server")).runEmployeeScenario(input),
    }),
    listAiEmployeeProfiles: tool({
      description:
        "Показать администратору профили Марины и Александра в РМ ОС: должности, обязанности, доступ и действия, требующие подтверждения. Статус показывает, подключены ли функции сотрудника.",
      inputSchema: z.object({}),
      execute: async () => (await import("./service.server")).listAiEmployeeProfiles(),
    }),
    getRentalManagerPlaybook: tool({
      description:
        "Памятка ИИ-менеджера аренды и её версия. Только администратор. Внешняя отправка не подключена; правила переходов Авито/Циан ещё не подтверждены.",
      inputSchema: z.object({}),
      execute: async () => (await import("./service.server")).getPlaybook(),
    }),
    reviewRentalChat: tool({
      description:
        "Подготовить разбор существующего чата: черновик, пожелания с цитатами, выбор/отказ мессенджера, открытые этапы. Не отправляет сообщений и не меняет сделку. Не обещай просмотр без проверки календаря/ключей. Результат действует 15 минут.",
      inputSchema: z.object({ threadId: z.string().uuid() }),
      execute: async ({ threadId }) =>
        (await import("./service.server")).prepareChatReview(threadId),
    }),
  };
}
export function managerMutateTools(ctx: AssistantToolContext) {
  return {
    proposeApproveAiEmployeeSkill: tool({
      description:
        "После проверки результата учебного сценария предложить включить правило в действующие инструкции. Используй scenario и runId из runAiEmployeeScenario. Требуется подтверждение администратора.",
      inputSchema: employeeScenarioApproval,
      execute: async (input) => {
        await (await import("./employee-tests.server")).getEmployeeHandbooks();
        const sample = employeeScenarios[input.scenario];
        const summary = `Подтвердить правило сотрудника ${sample.employee}\n${sample.rule}`;
        ctx.propose({ tool: "approveAiEmployeeSkill", summary, input });
        return { proposed: summary };
      },
    }),
    proposeAlexanderPlaybook: tool({
      description:
        "Предложить изменить памятку Александра. Сначала получить текущую версию через getAlexanderPlaybook. Не включать личные данные и секреты.",
      inputSchema: supportPlaybookInput,
      execute: async (input) => {
        await (await import("./employee-tests.server")).getSupportPlaybook();
        const summary = `Сохранить памятку Александра\n${input.value.instructions}\n\n${input.value.answers}`;
        ctx.propose({ tool: "saveAlexanderPlaybook", summary, input });
        return { proposed: summary };
      },
    }),
    proposeRentalManagerPlaybook: tool({
      description:
        "Предложить сохранить памятку ИИ-менеджера. Сначала getRentalManagerPlaybook, revision из результата. Не включает автоматическую отправку или обход правил площадок.",
      inputSchema: z.object({ revision: z.string().max(100), value: playbookSchema }),
      execute: async (input) => {
        await (await import("./service.server")).getPlaybook();
        const summary = `Сохранить памятку ИИ-менеджера:\n${input.value.instructions}\n\nОтветы:\n${input.value.answers}`;
        ctx.propose({ tool: "saveRentalManagerPlaybook", summary, input });
        return { proposed: summary };
      },
    }),
    proposeApplyRentalChatReview: tool({
      description:
        "Предложить добавить разбор в связанную сделку и (необязательно) изменить открытый этап. Сначала reviewRentalChat; reviewId и stageId только из его результата. Не закрывает сделки, не создаёт бронь, не отправляет сообщения. Требуется подтверждение.",
      inputSchema: z.object({ reviewId: z.string().uuid(), stageId: z.string().uuid().nullable() }),
      execute: async (input) => {
        const { getReviewForConfirmation } = await import("./service.server");
        const summary = await getReviewForConfirmation(input);
        ctx.propose({ tool: "applyRentalChatReview", summary, input });
        return { proposed: summary };
      },
    }),
  };
}
