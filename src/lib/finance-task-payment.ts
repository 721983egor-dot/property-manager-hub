import type { supabase } from "@/integrations/supabase/client";
import type { StaffTask } from "./tasks";
/** The same charge stays in the ledger; each cash part retains its actual date and account. */
export async function confirmScheduledPayment(
  db: typeof supabase,
  task: StaffTask,
  amount: number,
  date: string,
  account: string,
  requestId: string,
  actor?: string | null,
) {
  const f = task.finance;
  if (!f?.paymentId || f.kind !== "payment") throw new Error("Плановый платёж не найден");
  if (!Number.isFinite(amount) || amount <= 0 || amount > f.remaining)
    throw new Error("Укажите сумму в пределах остатка");
  if (!f.paymentUpdatedAt) throw new Error("Обновите задачу перед подтверждением");
  const { error } = await db.rpc("finance_record_scheduled_payment_checked", {
    p_expected_updated_at: f.paymentUpdatedAt,
    p_payment: f.paymentId,
    p_expected_amount: f.amount,
    p_expected_paid: Math.round((f.amount - f.remaining) * 100) / 100,
    p_expected_date: task.due_date!,
    p_expected_account: f.account,
    p_paid_total: Math.round((f.amount - f.remaining + amount) * 100) / 100,
    p_paid_date: date,
    p_received_account: account,
    p_request_id: requestId,
    p_actor: actor ?? null,
  });
  if (error) throw new Error(error.message);
}
