import { supabase } from "@/integrations/supabase/client";
import type { FinanceRental } from "./finance-rental-model";
export type FinanceClientRental = FinanceRental & {
  client_id: string;
  deposit: number;
  clients: { id: string; full_name: string; phone: string } | null;
};
export async function fetchFinanceClientRentals(): Promise<FinanceClientRental[]> {
  const rows: FinanceClientRental[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id,client_id,property_id,start_date,end_date,price_type,price_month,payment_day,status,stay_kind,deposit,clients(id,full_name,phone),booking_price_periods(start_date,end_date,price_month)",
      )
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as FinanceClientRental[]));
    if ((data?.length ?? 0) < 500) return rows;
  }
}
export async function refreshRentalSettlements() {
  const { error } = await supabase.rpc("finance_refresh_rental_settlements");
  if (error) throw error;
}
export async function createRentalSchedule(bookingId: string, account: string) {
  const { data, error } = await supabase.rpc("finance_create_rental_schedule", {
    p_booking: bookingId,
    p_account: account,
  });
  if (error) throw error;
  return Number(data);
}

export async function saveRentalOwnerSettings(input: {
  propertyId: string;
  ownerId: string;
  day: number;
  fee: number;
  feeType: "percent" | "amount";
  ownerName?: string;
}) {
  const { error } = await supabase.rpc("finance_save_rental_settings", {
    p_property: input.propertyId,
    p_owner: input.ownerId,
    p_day: input.day,
    p_fee: input.fee,
    p_fee_type: input.feeType,
    p_owner_name: input.ownerName ?? null,
  });
  if (error) throw error;
}
