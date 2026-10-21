import type { supabase } from "@/integrations/supabase/client";
import type { StaffTask } from "./tasks";
export async function rescheduleFinanceTask(
  db: typeof supabase,
  task: StaffTask,
  date: string,
  actor?: string,
) {
  if (!task.finance || task.status === "done") throw new Error("Нет открытого финансового платежа");
  const { error } = await db.rpc("finance_reschedule_task", {
    p_booking: task.finance.bookingId,
    p_payment: task.finance.paymentId,
    p_period: task.finance.period,
    p_kind: task.finance.kind,
    p_expected_date: task.due_date,
    p_date: date,
    p_actor: actor ?? null,
  });
  if (error) throw new Error(error.message);
}
