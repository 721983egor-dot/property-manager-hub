import { crmAccess } from "./crm-results.server";

/** Confirmed Assistant actions use the same atomic writer as the booking editor. */
export async function updateRentalContract(input: Record<string, unknown>) {
  const { db, actor } = await crmAccess(input);
  const current = await db
    .from("bookings")
    .select("*,booking_price_periods(start_date,end_date,price_month)")
    .eq("id", input["bookingId"])
    .single();
  if (current.error) throw current.error;
  const row = current.data;
  const patch: Record<string, unknown> = {};
  for (const [key, column] of Object.entries({
    startDate: "start_date",
    endDate: "end_date",
    priceType: "price_type",
    priceMonth: "price_month",
    paymentDay: "payment_day",
    ownerPayoutDay: "owner_payout_day",
    deposit: "deposit",
    status: "status",
    comment: "comment",
    periods: "periods",
    managementFeeType: "management_fee_type",
    managementFeeValue: "management_fee_value",
  })) {
    if (input[key] !== undefined) patch[column] = input[key];
  }
  const { booking_price_periods, ...booking } = row;
  const result = await db.rpc("finance_save_booking", {
    p_booking: row.id,
    p_input: { ...booking, periods: booking_price_periods ?? [], ...patch },
    p_account: input["accountId"] ?? null,
    p_actor: actor,
  });
  if (result.error) throw result.error;
  return "Условия аренды сохранены. Будущие платежи и прогноз выплат обновлены; полученные деньги и предоплаты сохранены.";
}

export async function cancelRentalContract(input: Record<string, unknown>) {
  const { db, actor } = await crmAccess(input);
  const result = await db.rpc("finance_cancel_booking", {
    p_booking: input["bookingId"],
    p_actor: actor,
  });
  if (result.error) throw result.error;
  return "Бронь отменена; будущие неоплаченные платежи графика сняты, финансовая история сохранена.";
}
