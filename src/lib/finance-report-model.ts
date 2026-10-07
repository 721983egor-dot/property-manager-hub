import type { Payment, PaymentDirection } from "./finance.ts";
import { groupArticlesByCategory, type FinanceCatalog } from "./finance-articles-model.ts";

export type CategoryReportRow = {
  key: string;
  categoryName: string;
  plan: number;
  fact: number;
  articles: { key: string; name: string; plan: number; fact: number }[];
};

function factAmount(payment: Payment) {
  if (payment.status === "paid") return payment.paid_amount ?? payment.amount;
  if (payment.status === "partial") return payment.paid_amount ?? 0;
  return 0;
}

/** План/факт по категориям статей для отчёта. */
export function summarizeByArticleCategory(
  payments: Payment[],
  catalog: FinanceCatalog,
  direction: PaymentDirection,
  label: (payment: Payment) => string = (payment) => payment.article?.name ?? payment.kind,
): CategoryReportRow[] {
  const groups = groupArticlesByCategory(catalog.categories, catalog.articles, direction);
  const byArticle = new Map<string, { plan: number; fact: number }>();
  const orphan: { plan: number; fact: number; name: string }[] = [];

  for (const payment of payments) {
    if (payment.direction !== direction) continue;
    const articleId = payment.article_id ?? payment.article?.id ?? null;
    const name = label(payment);
    if (!articleId) {
      orphan.push({ plan: payment.amount, fact: factAmount(payment), name });
      continue;
    }
    const cur = byArticle.get(articleId) ?? { plan: 0, fact: 0 };
    cur.plan += payment.amount;
    cur.fact += factAmount(payment);
    byArticle.set(articleId, cur);
  }

  const rows: CategoryReportRow[] = [];
  for (const group of groups) {
    const articleRows = group.articles
      .map((article) => {
        const sums = byArticle.get(article.id);
        if (!sums) return null;
        byArticle.delete(article.id);
        return { key: article.id, name: article.name, plan: sums.plan, fact: sums.fact };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
    if (!articleRows.length) continue;
    rows.push({
      key: group.category?.id ?? "none",
      categoryName: group.category?.name ?? "Без категории",
      plan: articleRows.reduce((s, r) => s + r.plan, 0),
      fact: articleRows.reduce((s, r) => s + r.fact, 0),
      articles: articleRows,
    });
  }

  for (const [articleId, sums] of byArticle) {
    const article = catalog.articles.find((a) => a.id === articleId);
    orphan.push({ ...sums, name: article?.name ?? "Статья" });
  }
  if (orphan.length) {
    rows.push({
      key: "orphan",
      categoryName: "Без категории",
      plan: orphan.reduce((s, r) => s + r.plan, 0),
      fact: orphan.reduce((s, r) => s + r.fact, 0),
      articles: orphan.map((item, i) => ({
        key: `orphan-${i}`,
        name: item.name,
        plan: item.plan,
        fact: item.fact,
      })),
    });
  }
  return rows;
}
