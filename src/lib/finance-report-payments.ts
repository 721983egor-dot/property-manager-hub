import type { Payment } from "./finance.ts";
import type { FinanceCatalog } from "./finance-articles-model.ts";
import { bankPayments, companyPayments } from "./finance-company-model.ts";

/** Report allocations never create additional movements on an account. */
export function reportPayments(
  payments: Payment[],
  catalog: FinanceCatalog,
  companyOnly: boolean,
): Payment[] {
  const rows = companyOnly ? companyPayments(payments) : bankPayments(payments);
  return rows.map((payment) => {
    const commission = payment.id.startsWith("company:");
    const code = commission
      ? "company_commission"
      : payment.rental_component === "rent"
        ? "rent_in"
        : payment.rental_component === "utilities"
          ? "utilities_in"
          : ["owner_payout", "deposit_in", "deposit_out"].includes(payment.kind)
            ? payment.kind
            : null;
    if (!code) return payment;
    const article = catalog.articles.find((a) => a.code === code);
    if (article)
      return {
        ...payment,
        article_id: article.id,
        article: {
          ...article,
          category_name: catalog.categories.find((c) => c.id === article.category_id)?.name ?? null,
        },
      };
    // Keep the allocation legible even while a catalog is being loaded.
    if (commission)
      return {
        ...payment,
        article_id: null,
        article: {
          id: "company_commission",
          name: "Комиссия компании",
          code,
          category_id: null,
          category_name: null,
        },
      };
    return payment;
  });
}
