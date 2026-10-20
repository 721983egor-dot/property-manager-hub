import type { QueryClient } from "@tanstack/react-query";
export async function invalidateRentalFinance(qc: QueryClient) {
  await Promise.all(
    [
      "properties",
      "property",
      "bookings",
      "current-booking",
      "client-bookings",
      "crm-bookings",
      "finance-counterparties",
      "finance-object-properties",
      "finance-object-settings",
      "finance-rentals",
      "finance-client-rentals",
      "finance-owner-settlements",
      "finance-obligations",
      "payments",
      "deals",
      "crm-commission-payments",
      "rental-booking-editor",
      "booking-finance-account",
      "booking-financial-terms",
      "finance-booking-cash-terms",
    ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
  );
}
