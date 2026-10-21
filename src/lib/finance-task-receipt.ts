import type { supabase } from "../integrations/supabase/client";
import { financeToday } from "./finance-payment-status.ts";

type ReceiptInput = {
  p_payment: string;
  p_booking: string;
  p_expected_amount: number;
  p_expected_paid: number;
  p_expected_date: string;
  p_expected_account: string;
  p_paid_total: number;
  p_paid_date: string;
  p_actor?: string | null;
};
const money = (n: number) => Math.round(n * 100) / 100;
const stale = () => new Error("Платёж изменился. Обновите задачу и проверьте дату и сумму");

/** Uses the atomic RPC, or the existing administrator payment RLS on older installations.
 * The fallback is a compare-and-set UPDATE of one existing row, never an INSERT.
 */
export async function confirmTaskReceipt(db: typeof supabase, input: ReceiptInput) {
  const rpc = await db.rpc("finance_confirm_task_receipt", input);
  if (!rpc.error) return;
  if (rpc.error.code !== "PGRST202") throw new Error(rpc.error.message);

  const total = money(input.p_paid_total);
  const date = input.p_paid_date;
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    date > financeToday()
  )
    throw new Error("Укажите полученную сумму и фактическую дату не позже сегодня");

  const [payment, booking] = await Promise.all([
    db.from("payments").select("*").eq("id", input.p_payment).maybeSingle(),
    db
      .from("bookings")
      .select("id,status,properties(portfolio)")
      .eq("id", input.p_booking)
      .maybeSingle(),
  ]);
  if (payment.error) throw new Error(payment.error.message);
  if (booking.error) throw new Error(booking.error.message);
  const p = payment.data;
  const property = booking.data?.properties;
  if (
    !p ||
    p.booking_id !== input.p_booking ||
    p.direction !== "in" ||
    (!["rent", "utilities", "deposit"].includes(p.rental_component ?? "") &&
      p.kind !== "deposit_in") ||
    !booking.data ||
    booking.data.status === "cancelled" ||
    (Array.isArray(property) ? property[0]?.portfolio : property?.portfolio) !== "rm"
  )
    throw new Error("Поступление по действующей брони не найдено");
  const actual = money(p.status === "paid" ? (p.paid_amount ?? p.amount) : (p.paid_amount ?? 0));
  if (total > p.amount) throw new Error("Сумма превышает остаток платежа");
  if (actual === total && p.paid_at === date) return;
  if (
    p.amount !== input.p_expected_amount ||
    actual !== input.p_expected_paid ||
    p.planned_date !== input.p_expected_date ||
    p.account !== input.p_expected_account ||
    total <= actual
  )
    throw stale();
  let update = db
    .from("payments")
    .update({
      status: total === p.amount ? "paid" : "partial",
      paid_amount: total,
      paid_at: date,
    })
    .eq("id", p.id)
    .eq("booking_id", input.p_booking)
    .eq("direction", "in")
    .eq("amount", p.amount)
    .eq("status", p.status)
    .eq("planned_date", p.planned_date)
    .eq("account", p.account)
    .eq("updated_at", p.updated_at);
  update =
    p.paid_amount === null
      ? update.is("paid_amount", null)
      : update.eq("paid_amount", p.paid_amount);
  update = p.paid_at === null ? update.is("paid_at", null) : update.eq("paid_at", p.paid_at);
  const saved = await update.select("id");
  if (saved.error) throw new Error(saved.error.message);
  if (saved.data?.length !== 1) throw stale();
}
