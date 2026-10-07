import { summarizeByArticleCategory as summarizeCategories } from "./finance-report-model";
import { supabase } from "@/integrations/supabase/client";
import type { Payment, PaymentDirection } from "@/lib/finance";
import { kindLabel } from "@/lib/finance";
import {
  type FinanceArticle,
  type FinanceArticleCategory,
  type FinanceCatalog,
} from "@/lib/finance-articles-model";

export type {
  ArticleGroup,
  FinanceArticle,
  FinanceArticleCategory,
  FinanceCatalog,
} from "@/lib/finance-articles-model";
export {
  articlesForDirection,
  defaultArticleForDirection,
  findArticle,
  groupArticlesByCategory,
  isLegacyPaymentKind,
  kindFromArticle,
  moveIndex,
} from "@/lib/finance-articles-model";

const CATEGORY_SELECT = "id, name, direction, position, created_at, updated_at";
const ARTICLE_SELECT =
  "id, name, direction, category_id, position, code, cash_flow_type, affects_profit, created_at, updated_at";

function asDirection(value: unknown): PaymentDirection {
  return value === "out" ? "out" : "in";
}

function mapCategory(row: Record<string, unknown>): FinanceArticleCategory {
  return {
    id: String(row["id"]),
    name: String(row["name"] ?? ""),
    direction: asDirection(row["direction"]),
    position: Number(row["position"] ?? 0),
    created_at: String(row["created_at"] ?? ""),
    updated_at: String(row["updated_at"] ?? ""),
  };
}

function mapArticle(row: Record<string, unknown>): FinanceArticle {
  return {
    id: String(row["id"]),
    name: String(row["name"] ?? ""),
    direction: asDirection(row["direction"]),
    category_id: (row["category_id"] as string | null) ?? null,
    position: Number(row["position"] ?? 0),
    code: (row["code"] as string | null) ?? null,
    cash_flow_type:
      row["cash_flow_type"] === "investing" || row["cash_flow_type"] === "financing"
        ? row["cash_flow_type"]
        : "operating",
    affects_profit:
      typeof row["affects_profit"] === "boolean"
        ? row["affects_profit"]
        : !["deposit_in", "deposit_out"].includes(String(row["code"])),
    created_at: String(row["created_at"] ?? ""),
    updated_at: String(row["updated_at"] ?? ""),
  };
}

export async function fetchFinanceCatalog(): Promise<FinanceCatalog> {
  const [catRes, artRes] = await Promise.all([
    supabase
      .from("finance_article_categories")
      .select(CATEGORY_SELECT)
      .order("direction")
      .order("position")
      .order("name"),
    supabase
      .from("finance_articles")
      .select(ARTICLE_SELECT)
      .order("direction")
      .order("position")
      .order("name"),
  ]);
  if (catRes.error) throw catRes.error;
  if (artRes.error) throw artRes.error;
  return {
    categories: ((catRes.data ?? []) as Record<string, unknown>[]).map(mapCategory),
    articles: ((artRes.data ?? []) as Record<string, unknown>[]).map(mapArticle),
  };
}

export async function saveFinanceArticleCategory(
  id: string | null,
  input: { name: string; direction: PaymentDirection; position?: number },
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Укажите название категории");
  if (id) {
    const { error } = await supabase
      .from("finance_article_categories")
      .update({ name, direction: input.direction } as never)
      .eq("id", id);
    if (error) throw error;
    return id;
  }
  const position = input.position ?? 0;
  const { data, error } = await supabase
    .from("finance_article_categories")
    .insert({ name, direction: input.direction, position } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteFinanceArticleCategory(id: string): Promise<void> {
  const { error } = await supabase.from("finance_article_categories").delete().eq("id", id);
  if (error) throw error;
}

export async function saveFinanceArticle(
  id: string | null,
  input: {
    name: string;
    direction: PaymentDirection;
    category_id?: string | null;
    cash_flow_type?: FinanceArticle["cash_flow_type"];
    affects_profit?: boolean;
    position?: number;
  },
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Укажите название статьи");
  if (id) {
    const { error } = await supabase
      .from("finance_articles")
      .update({
        name,
        direction: input.direction,
        category_id: input.category_id ?? null,
        ...(input.cash_flow_type === undefined ? {} : { cash_flow_type: input.cash_flow_type }),
        ...(input.affects_profit === undefined ? {} : { affects_profit: input.affects_profit }),
      } as never)
      .eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("finance_articles")
    .insert({
      name,
      direction: input.direction,
      category_id: input.category_id ?? null,
      position: input.position ?? 0,
      ...(input.cash_flow_type === undefined ? {} : { cash_flow_type: input.cash_flow_type }),
      ...(input.affects_profit === undefined ? {} : { affects_profit: input.affects_profit }),
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteFinanceArticle(id: string): Promise<void> {
  const { error } = await supabase.from("finance_articles").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderFinanceArticleCategories(orderedIds: string[]): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, position) =>
      supabase
        .from("finance_article_categories")
        .update({ position } as never)
        .eq("id", id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

export async function reorderFinanceArticles(
  items: { id: string; position: number; category_id?: string | null }[],
): Promise<void> {
  const results = await Promise.all(
    items.map((item) => {
      const patch: Record<string, unknown> = { position: item.position };
      if (item.category_id !== undefined) patch.category_id = item.category_id;
      return supabase
        .from("finance_articles")
        .update(patch as never)
        .eq("id", item.id);
    }),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

export function paymentArticleLabel(
  payment: Pick<Payment, "kind" | "article">,
  articles: FinanceArticle[] = [],
): string {
  if (payment.article?.name) return payment.article.name;
  const byId = payment.article?.id ? articles.find((a) => a.id === payment.article?.id) : undefined;
  if (byId?.name) return byId.name;
  return kindLabel(payment.kind);
}

export { type CategoryReportRow } from "./finance-report-model";
export function summarizeByArticleCategory(
  payments: Payment[],
  catalog: FinanceCatalog,
  direction: PaymentDirection,
) {
  return summarizeCategories(payments, catalog, direction, (payment) =>
    paymentArticleLabel(payment, catalog.articles),
  );
}
