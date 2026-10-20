import { z } from "zod";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Both create and edit proposals submit these same fields to the atomic booking writer. */
export const bookingFinancialTermsSchema = z.object({
  receipts_from: date,
  collection_interval: z.number().int().min(0).max(12),
  owner_rates: z
    .array(z.object({ from: date, to: date, owner_monthly: z.number().nonnegative() }))
    .max(100),
  collection_plan: z
    .array(
      z.object({
        period: date,
        through: date,
        date,
        amount: z.number().positive(),
        company_fee: z.number().nonnegative(),
      }),
    )
    .min(1)
    .max(100)
    .nullable(),
  prepaid_owner_payouts: z
    .array(z.object({ period: date, date, amount: z.number().positive() }))
    .max(100),
});
