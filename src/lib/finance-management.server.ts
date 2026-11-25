import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import { crmAccess } from "./crm-results.server";
import { financeToday } from "./finance-payment-status";
import {
  managementReport,
  type ManagementBooking,
  type ManagementCashTerms,
  type ManagementDeal,
  type ManagementProperty,
  type ManagementSource,
} from "./finance-management-model";

async function allRows<T>(
  read: (from: number, to: number) => PromiseLike<PostgrestSingleResponse<T[]>>,
) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await read(offset, offset + 499);
    if (result.error) throw new Error(result.error.message);
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}

export async function getFinanceManagementReport(month: string) {
  const { db } = await crmAccess();
  const [properties, bookings, deals, terms, installments] = await Promise.all([
    allRows<ManagementProperty>((from, to) =>
      db
        .from("properties")
        .select(
          "id,title,internal_name,ref_id,type,status,for_rent,service_type,price_month,seasonal_pricing,summer_price_month,management_fee_type,management_fee_value,commission",
        )
        .eq("portfolio", "rm")
        .neq("status", "archived")
        .order("id")
        .range(from, to),
    ),
    allRows<ManagementBooking>((from, to) =>
      db
        .from("bookings")
        .select(
          "id,property_id,start_date,end_date,service_type,price_type,price_month,payment_day,booking_price_periods(start_date,end_date,price_month)",
        )
        .eq("status", "active")
        .eq("stay_kind", "long_term")
        .order("id")
        .range(from, to),
    ),
    allRows<ManagementDeal>((from, to) =>
      db
        .from("deals")
        .select(
          "id,booking_id,closed_property_id,start_date,end_date,price_month,payment_day,income_type,income_value,finance_terms,deal_stages!deals_stage_id_fkey!inner(kind)",
        )
        .eq("pipeline", "rental")
        .eq("deal_stages.kind", "won")
        .not("closed_property_id", "is", null)
        .order("id")
        .range(from, to),
    ),
    allRows<ManagementCashTerms>((from, to) =>
      db
        .from("finance_booking_cash_terms")
        .select("id,owner_rates,collection_plan")
        .order("id")
        .range(from, to),
    ),
    allRows<ManagementSource["installments"][number]>((from, to) =>
      db
        .from("finance_rental_installments")
        .select("booking_id,period,total_fee")
        .order("id")
        .range(from, to),
    ),
  ]);
  return managementReport(
    { properties, bookings, deals, terms, installments },
    month,
    financeToday(),
  );
}
