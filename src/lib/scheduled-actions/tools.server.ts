import { reportSchema, validatedReport } from "./report.server";
import { tool } from "ai";
import { z } from "zod";
import type { AssistantToolContext } from "@/lib/ai/context.server";
import {
  futureRunAt,
  manageScheduleSchema,
  runAtSchema,
  scheduledTime,
  SCHEDULABLE_TOOLS,
} from "./model";
import { requestScheduleActor } from "./actor.server";
import { listScheduledActions } from "./service.server";
export function scheduledReadTools(ctx: AssistantToolContext) {
  return {
    prepareActionSchedule: tool({
      description:
        "Для запроса выполнить действие позже: СНАЧАЛА вызови этот инструмент с точной датой/временем, потом обычные propose-инструменты изменения. Они автоматически станут предложениями отложенных поручений, требующими подтверждения пользователя. Работает для разных действий, не только цен. Если дата/время или параметры не указаны — уточни, не выдумывай. Все даты по Москве, runAt ISO с +03:00. Ничего ещё не сохранено. При нескольких действиях каждое подтверждается отдельно. Не путай срок задачи сотруднику с временем автоматического выполнения действия. Нельзя автоматически подтверждать фактическую оплату, получение ключей, выполнение физической работы, менять доступ или удалять данные.",
      inputSchema: z.object({ runAt: runAtSchema }),
      execute: async ({ runAt }) => ({
        ...ctx.scheduleActions(futureRunAt(runAt), await requestScheduleActor()),
        needsConfirmation: true,
        supportedActions: SCHEDULABLE_TOOLS,
        now: new Date().toISOString(),
        timeZone: "Europe/Moscow",
      }),
    }),
    listScheduledAssistantActions: tool({
      description:
        "Мои отложенные поручения Ассистенту: дата по Москве, параметры в описании, состояние, результат и версия для переноса/отмены. Только администратор. Это автоматические действия, отдельно от задач сотрудников и Telegram-напоминаний.",
      inputSchema: z.object({}),
      execute: async () => listScheduledActions(),
    }),
  };
}
export function scheduledMutateTools(ctx: AssistantToolContext) {
  return {
    proposeScheduledReport: tool({
      description:
        "Отложить подготовку и отправку сводки/отчёта: сначала prepareActionSchedule. Данные будут прочитаны заново в назначенное время, без изменения базы. report — название обычного инструмента чтения, parameters — его параметры по соответствующей схеме (даты/фильтры). Например getTasks, getCalendar, getCrmResults, getFinanceAnalytics, getObjectProfitability. Уточни нужный период. Требуется подтверждение; результат в РМ ОС и личном Telegram.",
      inputSchema: reportSchema,
      execute: async (raw) => {
        if (!ctx.scheduledFor()) throw Error("Сначала укажите время через prepareActionSchedule");
        await requestScheduleActor();
        const { input } = await validatedReport(raw);
        const summary = `Подготовить отчёт: ${input.title}`;
        ctx.propose({ tool: "runAssistantReport", summary, input });
        return { proposed: true, summary };
      },
    }),
    proposeManageScheduledAction: tool({
      description:
        "Предложить отмену или перенос ещё не начатого отложенного поручения. Сначала listScheduledAssistantActions, возьми точные id/version. Не используй prepareActionSchedule для этой команды: отмена/перенос выполняется сразу после подтверждения. После начала выполнения остановка через этот инструмент невозможна.",
      inputSchema: manageScheduleSchema,
      execute: async (input) => {
        const list = await listScheduledActions(),
          row = list.actions.find(
            (r) => r.id === input.id && r.version === input.version && r.state === "pending",
          );
        if (!row) throw Error("Поручение уже изменилось. Обновите список");
        const time = input.action === "reschedule" ? futureRunAt(input.runAt ?? "") : null;
        const summary = `${time ? "Перенести на " + scheduledTime(time) : "Отменить отложенное поручение"}\n${row.summary}`;
        ctx.propose({ tool: "manageScheduledAction", summary, input });
        return { proposed: true, summary };
      },
    }),
  };
}
