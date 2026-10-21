import { crmAccess } from "./crm-results.server";
import { loadFinanceTasks } from "./finance-tasks-data";
import type { supabase } from "@/integrations/supabase/client";
import { financeToday } from "./finance-payment-status";
import { confirmTaskReceipt } from "./finance-task-receipt";
export async function financeTasksForAssistant(input?: Record<string, unknown>) {
  const { db } = await crmAccess(input);
  return (await loadFinanceTasks(db as typeof supabase)).tasks;
}
export async function financeTaskProposal(input: {
  taskId: string;
  amount: number;
  date: string;
  account?: string;
}) {
  const task = (await financeTasksForAssistant()).find((t) => t.id === input.taskId);
  if (!task || task.status === "done")
    throw new Error("Финансовая задача не найдена или уже выполнена");
  const f = task.finance;
  if (
    !Number.isFinite(input.amount) ||
    input.amount <= 0 ||
    input.amount > f.remaining ||
    input.date > financeToday()
  )
    throw new Error("Укажите фактическую сумму в пределах остатка и дату не позже сегодня");
  if (
    f.kind === "owner_payout" &&
    (!f.obligationId || input.amount > f.payableNow || !input.account)
  )
    throw new Error(
      "Сначала подтвердите поступление от арендатора, затем выберите счёт и сумму в пределах подтверждённого долга",
    );
  return {
    task,
    expected: {
      bookingId: f.bookingId,
      paymentId: f.paymentId,
      obligationId: f.obligationId,
      kind: f.kind,
      expectedAmount: f.amount,
      expectedRemaining: f.remaining,
      expectedDate: task.due_date,
      expectedAccount: f.account,
      requestId: crypto.randomUUID(),
    },
  };
}
export async function confirmFinanceTask(input: Record<string, unknown>) {
  const { db, actor } = await crmAccess(input);
  const task = (await loadFinanceTasks(db as typeof supabase)).tasks.find(
    (t) => t.id === input["taskId"],
  );
  if (!task || task.status === "done")
    throw new Error("Задача исчезла или оплата уже учтена. Обновите список");
  const f = task.finance;
  if (
    f.bookingId !== input["bookingId"] ||
    f.amount !== input["expectedAmount"] ||
    f.remaining !== input["expectedRemaining"] ||
    task.due_date !== input["expectedDate"] ||
    f.account !== input["expectedAccount"]
  )
    throw new Error("Условия изменились. Проверьте задачу и подтвердите актуальную сумму");
  if (f.kind === "receipt") {
    await confirmTaskReceipt(db as typeof supabase, {
      p_payment: f.paymentId!,
      p_booking: f.bookingId,
      p_expected_amount: f.amount,
      p_expected_paid: Math.round((f.amount - f.remaining) * 100) / 100,
      p_expected_date: task.due_date!,
      p_expected_account: f.account,
      p_paid_total: Math.round((f.amount - f.remaining + Number(input["amount"])) * 100) / 100,
      p_paid_date: String(input["date"]),
      p_received_account: String(input["account"] || f.account),
      p_request_id: String(input["requestId"]),
      p_actor: actor,
    });
  } else {
    if (
      !f.obligationId ||
      f.obligationId !== input["obligationId"] ||
      Number(input["amount"]) > f.payableNow
    )
      throw new Error("Подтверждённая сумма выплаты изменилась");
    const client = await (await import("./finance-owner-access.server")).ownerFinanceAdminClient();
    const { error } = await client.rpc("pay_owner_settlement", {
      p_obligation_id: f.obligationId,
      p_amount: Number(input["amount"]),
      p_account: String(input["account"] ?? ""),
      p_paid_date: String(input["date"]),
      p_request_id: String(input["requestId"]),
    });
    if (error) throw new Error(error.message);
  }
  return "Оплата записана в связанном платеже. Задача обновлена без создания второй операции";
}

export async function rescheduleFinanceTaskForAssistant(input: Record<string, unknown>) {
  const { db, actor } = await crmAccess(input);
  const task = (await loadFinanceTasks(db as typeof supabase)).tasks.find(
    (t) => t.id === input["taskId"],
  );
  if (!task || task.due_date !== input["expectedDate"])
    throw new Error("Задача изменилась. Обновите предложение");
  await (
    await import("./finance-task-schedule")
  ).rescheduleFinanceTask(db as typeof supabase, task, String(input["date"]), actor ?? undefined);
  return "Перенесена ожидаемая дата остатка. Срок по договору и последующие месяцы не изменены";
}
