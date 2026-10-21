import { crmDb } from "./crm-results";
import type { PaymentRepeatOptions } from "./finance-payment-series";
function fail(error: { code?: string; message: string } | null) {
  if (error)
    throw new Error(
      error.code === "PGRST202" || error.code === "42P01"
        ? "Связанные регулярные операции ещё не обновлены на сервере. Данные не изменены"
        : error.message,
    );
}
export type RecurringSeries = {
  id: string;
  interval_kind: "month" | "week";
  payment_day: number | null;
  end_mode: "count" | "until" | "unlimited";
  operation_count: number | null;
  until_date: string | null;
  revision: number;
};
export async function fetchRecurringSeries(id: string): Promise<RecurringSeries> {
  const { data, error } = await crmDb
    .from("finance_payment_series")
    .select("id,interval_kind,payment_day,end_mode,operation_count,until_date,revision")
    .eq("id", id)
    .single();
  fail(error);
  return data as RecurringSeries;
}
export async function createPaymentSeries(
  input: unknown,
  repeat: PaymentRepeatOptions,
  requestId = crypto.randomUUID(),
): Promise<string> {
  const { data, error } = await crmDb.rpc("finance_create_payment_series", {
    p_id: requestId,
    p_input: input,
    p_repeat: repeat,
  });
  fail(error);
  return String(data);
}
export async function editPaymentSeries(
  paymentId: string,
  input: unknown,
  scope: "single" | "following",
  day: number | null,
  expected: unknown,
  revision: number,
) {
  const { data, error } = await crmDb.rpc("finance_edit_payment_series", {
    p_payment: paymentId,
    p_input: input,
    p_scope: scope,
    p_day: day,
    p_expected: expected,
    p_revision: revision,
  });
  fail(error);
  return data as { updated: number; preservedActual: number };
}
