import { supabase } from "@/integrations/supabase/client";
import type {
  BookingFinancialTerms,
  BookingCollection,
  OwnerMonthlyRate,
} from "./booking-finance-terms";
export async function fetchBookingFinancialTerms(
  bookingId: string,
): Promise<BookingFinancialTerms | null> {
  const [terms, settlements] = await Promise.all([
    supabase
      .from("finance_booking_cash_terms")
      .select("receipts_from,owner_rates,collection_plan,collection_interval")
      .eq("id", bookingId)
      .maybeSingle(),
    supabase
      .from("finance_owner_settlements")
      .select("period,obligation_id,gross_amount")
      .eq("booking_id", bookingId)
      .eq("automatic", false),
  ]);
  if (terms.error) throw terms.error;
  if (settlements.error) throw settlements.error;
  if (!terms.data) return null;
  const ids = (settlements.data ?? []).map((s) => s.obligation_id);
  const obligations = ids.length
    ? await supabase.from("finance_obligations").select("id,planned_date,amount").in("id", ids)
    : { data: [], error: null };
  if (obligations.error) throw obligations.error;
  return {
    ...terms.data,
    owner_rates: terms.data.owner_rates as unknown as OwnerMonthlyRate[],
    collection_plan: terms.data.collection_plan as unknown as BookingCollection[] | null,
    prepaid_owner_payouts: (settlements.data ?? []).map((s) => {
      const ob = obligations.data?.find((o) => o.id === s.obligation_id);
      if (!ob) throw new Error("Не найден расчёт собственника. Обновите бронь");
      return {
        period: s.period,
        date: ob.planned_date,
        amount: Number(s.gross_amount ?? ob.amount),
      };
    }),
  };
}
