import type { supabase } from "../integrations/supabase/client";

type ReceiptInput = {
  p_payment: string;
  p_booking: string;
  p_expected_amount: number;
  p_expected_paid: number;
  p_expected_date: string;
  p_expected_account: string;
  p_paid_total: number;
  p_paid_date: string;
  p_received_account?: string;
  p_request_id?: string;
  p_actor?: string | null;
};
/** Atomic append: a retry reuses the same request ID and cannot duplicate cash. */
export async function confirmTaskReceipt(db: typeof supabase, input: ReceiptInput) {
  const { error } = await db.rpc("finance_record_task_receipt", {
    ...input,
    p_received_account: input.p_received_account || input.p_expected_account,
    p_request_id: input.p_request_id || crypto.randomUUID(),
  });
  if (error)
    throw new Error(
      error.code === "PGRST202"
        ? "Учёт частей оплаты ещё не обновлён на сервере. Поступление не записано"
        : error.message,
    );
}
