import { assertScheduledOperation } from "./model";
export type RunnableAction = {
  actor_id: string;
  tool_name: string;
  summary: string;
  input: Record<string, unknown>;
};
/** No automatic retry: a timeout can occur after the underlying business action committed. */
export async function performScheduledAction(
  row: RunnableAction,
  deps: {
    assertActor: (id: string) => Promise<unknown>;
    execute: (tool: string, summary: string, input: Record<string, unknown>) => Promise<string>;
    finish: (state: "done" | "failed" | "needs_review", result: string) => Promise<void>;
  },
) {
  let state: "done" | "failed" | "needs_review" = "failed",
    result = "";
  try {
    await deps.assertActor(row.actor_id);
    assertScheduledOperation(row.tool_name, row.input);
    state = "needs_review";
    result = await deps.execute(row.tool_name, row.summary, row.input);
    state = "done";
  } catch (e) {
    result =
      state === "failed"
        ? e instanceof Error
          ? e.message
          : "Доступ к поручению закрыт"
        : `Не удалось подтвердить завершение. Проверьте результат перед повтором. ${e instanceof Error ? e.message : "Ошибка выполнения"}`;
  }
  await deps.finish(state, result);
}
