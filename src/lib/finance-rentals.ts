import { supabase } from "@/integrations/supabase/client";
import type { FinancePropertyOption } from "./finance";
import type { FinanceRental } from "./finance-rental-model";
export type FinanceObjectProperty = FinancePropertyOption & {
  first_photo_path: string | null;
  management_fee_type: "percent" | "amount";
  management_fee_value: number | null;
};
export async function fetchFinanceObjectProperties(
  includeArchived = false,
): Promise<FinanceObjectProperty[]> {
  let query = supabase
    .from("properties")
    .select(
      "id,title,internal_name,ref_id,status,management_fee_type,management_fee_value,cover:photos->0",
    )
    .eq("portfolio", "rm")
    .order("id");
  if (!includeArchived) query = query.neq("status", "archived");
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((p) => {
    const cover = p.cover as { path?: unknown } | null;
    return { ...p, first_photo_path: typeof cover?.path === "string" ? cover.path : null };
  });
}
export async function fetchFinanceRentals(): Promise<FinanceRental[]> {
  const rows: FinanceRental[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id,property_id,start_date,end_date,price_type,price_month,payment_day,status,stay_kind,booking_price_periods(start_date,end_date,price_month)",
      )
      .eq("status", "active")
      .eq("stay_kind", "long_term")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return rows;
  }
}
export async function saveManagementFee(
  propertyId: string,
  value: number,
  type: "percent" | "amount" = "percent",
) {
  if (!Number.isFinite(value) || value < 0 || (type === "percent" && value > 100))
    throw new Error("Укажите корректное вознаграждение");
  const { error } = await supabase
    .from("properties")
    .update({ management_fee_type: type, management_fee_value: value })
    .eq("id", propertyId)
    .eq("portfolio", "rm")
    .select("id")
    .single();
  if (error) throw error;
}
export async function createManagementFeePayment(bookingId: string, month: string, amount: number) {
  const { data, error } = await supabase.rpc("create_management_fee_payment", {
    p_booking_id: bookingId,
    p_period: month + "-01",
    p_expected_amount: amount,
  });
  if (error) throw error;
  return data;
}
