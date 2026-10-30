import { tool } from "ai";
import { z } from "zod";
import type { AssistantToolContext } from "@/lib/ai/context.server";
import { calendarStatus } from "./service.server";
export function calendarReadTools() {
  return {
    getTaskCalendarConnection: tool({
      description:
        "Статус двустороннего подключения задач к Apple Календарю (CalDAV), только администратор. Возвращает режим и инструкцию; секретные пароли не читает. Обычные задачи, даты, название и заметки; создание в календаре назначает задачу автору; удаление события убирает срок без удаления задачи. Повторы/выполнение/финансовые задачи в RM OS.",
      inputSchema: z.object({}),
      execute: async () => {
        const r = await calendarStatus();
        return {
          enabled: r.account?.enabled ?? false,
          scope: r.account?.scope ?? "mine",
          setupPage: "/crm/tasks/",
          instruction:
            "Задачи → Apple Календарь. Там можно создать отдельный пароль и получить параметры подключения. Пароль Apple ID не нужен.",
        };
      },
    }),
  };
}
export function calendarMutateTools(ctx: AssistantToolContext) {
  return {
    proposeDisconnectTaskCalendar: tool({
      description:
        "Предложить отключить доступ Apple Календаря к задачам на всех устройствах. Только после подтверждения администратора; уже загруженные данные на устройствах автоматически не удаляются. Для подключения/смены режима открыть Задачи → Apple Календарь, пароль выдаётся только там.",
      inputSchema: z.object({}),
      execute: async () => {
        await calendarStatus();
        const summary = "Отключить подключение Apple Календаря к задачам на всех устройствах";
        ctx.propose({ tool: "disconnectTaskCalendar", summary, input: {} });
        return { proposed: true, summary };
      },
    }),
  };
}
