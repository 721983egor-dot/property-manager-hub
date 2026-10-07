import type { PaymentDirection, PaymentKind } from "./finance.ts";

export type FinanceArticleCategory = {
  id: string;
  name: string;
  direction: PaymentDirection;
  position: number;
  created_at: string;
  updated_at: string;
};

export type FinanceArticle = {
  cash_flow_type?: "operating" | "investing" | "financing";
  affects_profit?: boolean;
  id: string;
  name: string;
  direction: PaymentDirection;
  category_id: string | null;
  position: number;
  code: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceCatalog = {
  categories: FinanceArticleCategory[];
  articles: FinanceArticle[];
};

const LEGACY_KIND_CODES: PaymentKind[] = [
  "rent_in",
  "deposit_in",
  "deposit_out",
  "owner_payout",
  "contractor",
  "agency_cost",
  "other",
];

export function isLegacyPaymentKind(value: string | null | undefined): value is PaymentKind {
  return !!value && (LEGACY_KIND_CODES as string[]).includes(value);
}

export function kindFromArticle(article: FinanceArticle | null | undefined): PaymentKind {
  if (article?.code && isLegacyPaymentKind(article.code)) return article.code;
  return "other";
}

export type ArticleGroup = {
  category: FinanceArticleCategory | null;
  articles: FinanceArticle[];
};

export function groupArticlesByCategory(
  categories: FinanceArticleCategory[],
  articles: FinanceArticle[],
  direction: PaymentDirection,
): ArticleGroup[] {
  const cats = categories
    .filter((c) => c.direction === direction)
    .slice()
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "ru"));
  const ofDir = articles
    .filter((a) => a.direction === direction)
    .slice()
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "ru"));
  const groups: ArticleGroup[] = cats.map((category) => ({
    category,
    articles: ofDir.filter((a) => a.category_id === category.id),
  }));
  const uncategorized = ofDir.filter(
    (a) => !a.category_id || !cats.some((c) => c.id === a.category_id),
  );
  if (uncategorized.length) groups.push({ category: null, articles: uncategorized });
  return groups;
}

export function articlesForDirection(articles: FinanceArticle[], direction: PaymentDirection) {
  return articles
    .filter((a) => a.direction === direction)
    .slice()
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "ru"));
}

export function defaultArticleForDirection(
  articles: FinanceArticle[],
  direction: PaymentDirection,
): FinanceArticle | null {
  const list = articlesForDirection(articles, direction);
  const preferred = direction === "in" ? "rent_in" : "agency_cost";
  return list.find((a) => a.code === preferred) ?? list[0] ?? null;
}

export function findArticle(
  articles: FinanceArticle[],
  id: string | null | undefined,
): FinanceArticle | undefined {
  if (!id) return undefined;
  return articles.find((a) => a.id === id);
}

export function moveIndex<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (!item) return list;
  next.splice(to, 0, item);
  return next;
}
