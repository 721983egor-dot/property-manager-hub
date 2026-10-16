import { crmDb } from "./crm-results";
export type SeasonalRent = { start_date: string; end_date: string; price_month: number };
export type CrmCommissionPayment = {
  id: string;
  deal_id: string;
  planned_date: string;
  amount: number;
  status: string;
  paid_at: string | null;
  paid_amount: number | null;
  rental_turnover: number | null;
  crm_charge: string;
};
export async function fetchCrmCommissionPayments() {
  const rows: CrmCommissionPayment[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await crmDb
      .from("payments")
      .select(
        "id,deal_id,planned_date,amount,status,paid_at,paid_amount,rental_turnover,crm_charge",
      )
      .not("crm_charge", "is", null)
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return rows;
  }
}
