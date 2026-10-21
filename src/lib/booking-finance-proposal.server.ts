import { crmAccess } from "./crm-results.server";
import {
  bookingFinancialTermsProblem,
  previewBookingCollections,
  type BookingFinancialTerms,
} from "./booking-finance-terms";
/** Read-only draft calculation shown before the Assistant asks to save a booking. */
export async function bookingFinanceProposal(input: Record<string, unknown>) {
  const { db } = await crmAccess();
  const current = input["bookingId"]
    ? await db
        .from("bookings")
        .select("*,booking_price_periods(start_date,end_date,price_month)")
        .eq("id", input["bookingId"])
        .single()
    : { data: null, error: null };
  if (current.error) throw current.error;
  const b = current.data;
  const propertyId = input["propertyId"] ?? b?.property_id;
  const prop = await db
    .from("properties")
    .select("management_fee_type,management_fee_value")
    .eq("id", propertyId)
    .single();
  if (prop.error) throw prop.error;
  const terms = {
    start_date: String(input["startDate"] ?? b?.start_date ?? ""),
    end_date: String(input["endDate"] ?? b?.end_date ?? ""),
    payment_day: Number(input["paymentDay"] ?? b?.payment_day ?? 1),
    price_type: String(input["priceType"] ?? b?.price_type ?? "fixed"),
    price_month: (input["priceMonth"] ?? b?.price_month ?? null) as number | null,
    booking_price_periods: (input["periods"] ?? b?.booking_price_periods ?? []) as {
      start_date: string;
      end_date: string;
      price_month: number;
    }[],
  };
  const financial = input["financialTerms"] as BookingFinancialTerms;
  const problem = bookingFinancialTermsProblem(financial, terms);
  if (problem) throw new Error(problem);
  const rows = previewBookingCollections(
    terms,
    financial,
    (input["managementFeeValue"] ?? prop.data.management_fee_value) as number | null,
    (input["managementFeeType"] ?? prop.data.management_fee_type ?? "percent") as
      "percent" | "amount",
  );
  const money = (v: number) => v.toLocaleString("ru-RU") + " ₽";
  const day =
    input["ownerPayoutMode"] === "on_request"
      ? 0
      : Number(input["ownerPayoutDay"] ?? b?.owner_payout_day);
  const summary = rows
    .slice(0, 24)
    .map((p) => {
      const last = new Date(
        Date.UTC(Number(p.period.slice(0, 4)), Number(p.period.slice(5, 7)), 0),
      ).getUTCDate();
      const payout = day
        ? `${p.period.slice(0, 7)}-${String(Math.min(day, last)).padStart(2, "0")}`
        : "по запросу · деньги хранятся у нас, без срока выплаты";
      return `${p.date}: приход ${money(p.amount)}, компания ${money(p.company_fee)}, собственнику ${money(p.amount - p.company_fee)} (${payout})`;
    })
    .join("\n");
  return {
    rows,
    summary: summary + (rows.length > 24 ? `\nЕщё ${rows.length - 24} поступлений` : ""),
  };
}
