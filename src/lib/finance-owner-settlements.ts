import { supabase } from "@/integrations/supabase/client";
export type OwnerSettlement = {
  id: string;
  property_id: string;
  period: string;
  obligation_id: string;
};
export async function fetchOwnerSettlements(propertyId?: string) {
  let query = supabase
    .from("finance_owner_settlements")
    .select("id,property_id,period,obligation_id")
    .order("period", { ascending: false });
  if (propertyId) query = query.eq("property_id", propertyId);
  const rows: OwnerSettlement[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 500) return rows;
  }
}
export async function saveOwnerPayoutSettings(propertyId: string, ownerId: string, day: number) {
  if (!ownerId || !Number.isInteger(day) || day < 1 || day > 31)
    throw new Error("Укажите собственника и день от 1 до 31");
  const { error } = await supabase
    .from("finance_object_settings")
    .upsert(
      { property_id: propertyId, owner_counterparty_id: ownerId, payout_day: day },
      { onConflict: "property_id" },
    );
  if (error) throw error;
}
export async function createOwnerSettlement(
  propertyId: string,
  month: string,
  amount: number,
  legalEntity: string,
) {
  const { data, error } = await supabase.rpc("create_owner_settlement", {
    p_property_id: propertyId,
    p_period: month + "-01",
    p_amount: amount,
    p_legal_entity: legalEntity,
  });
  if (error) throw error;
  return data;
}
export async function payOwnerSettlement(
  obligationId: string,
  amount: number,
  account: string,
  date: string,
  requestId: string,
) {
  const { data, error } = await supabase.rpc("pay_owner_settlement", {
    p_obligation_id: obligationId,
    p_amount: amount,
    p_account: account,
    p_paid_date: date,
    p_request_id: requestId,
  });
  if (error) throw error;
  return data;
}
