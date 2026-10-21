import { supabase } from "@/integrations/supabase/client";
import { crmDb } from "@/lib/crm-results";
export async function loadConfirmation(paymentId: string) {
  const { data, error } = await supabase.from("payments").select("*").eq("id", paymentId).single();
  if (error) throw error;
  return data;
}
export async function reverseConfirmation(
  paymentId: string,
  receiptId: string | null,
  expected: unknown,
  requestId: string,
) {
  const { error } = await crmDb.rpc("finance_reverse_confirmation", {
    p_payment: paymentId,
    p_receipt: receiptId,
    p_expected: expected,
    p_request_id: requestId,
  });
  if (error)
    throw new Error(
      error.code === "PGRST202"
        ? "Отмена подтверждения ещё не обновлена на сервере. Данные не изменены"
        : error.message,
    );
}
