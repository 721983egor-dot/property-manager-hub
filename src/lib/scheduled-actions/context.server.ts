import type { AssistantAction } from "@/lib/ai/types";
import { futureRunAt, isSchedulable, scheduledTime, assertScheduledOperation } from "./model";
import { sealAction } from "./seal.server";
/** A per-model-turn adapter. Every affected proposal still needs the ordinary user confirmation. */
export function actionScheduler(actions: AssistantAction[]) {
  let plan: { runAt: string; actorId: string } | null = null;
  let invalidSchedule = false;
  function wrap(action: AssistantAction) {
    if (invalidSchedule) throw Error("Сначала уточните корректное время отложенного поручения");
    if (!plan) return action;
    if (!isSchedulable(action.tool))
      throw Error(
        "Это действие требует отдельного выполнения сейчас и не поддерживает отложенный запуск",
      );
    const raw = JSON.parse(action.input) as Record<string, unknown>;
    assertScheduledOperation(action.tool, raw);
    const input = sealAction({
      id: crypto.randomUUID(),
      actorId: plan.actorId,
      runAt: plan.runAt,
      tool: action.tool as import("./model").SealedAction["tool"],
      summary: action.summary,
      input: raw,
      issuedAt: Date.now(),
    });
    return {
      ...action,
      tool: "scheduleAssistantAction",
      summary: `Запланировать: ${scheduledTime(plan.runAt)}\n${action.summary}`,
      input: JSON.stringify(input),
    };
  }
  return {
    runAt: () => (!invalidSchedule ? (plan?.runAt ?? null) : null),
    wrap,
    prepare(runAt: string, actorId: string) {
      try {
        invalidSchedule = true;
        const next = { runAt: futureRunAt(runAt), actorId };
        if (actions.some((a) => a.tool === "scheduleAssistantAction"))
          throw Error("Время уже выбрано. Для другого времени подготовьте отдельное поручение");
        for (const a of actions) assertScheduledOperation(a.tool, JSON.parse(a.input));
        plan = next;
        invalidSchedule = false;
        const wrapped = actions.map(wrap);
        actions.splice(0, actions.length, ...wrapped);
        return { runAt: plan.runAt, time: scheduledTime(plan.runAt), wrapped: wrapped.length };
      } catch (e) {
        invalidSchedule = true;
        actions.splice(0);
        throw e;
      }
    },
  };
}
