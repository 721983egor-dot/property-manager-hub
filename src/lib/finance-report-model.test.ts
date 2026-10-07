import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeByArticleCategory } from "./finance-report-model.ts";
import type { Payment } from "./finance.ts";
import type { FinanceCatalog } from "./finance-articles-model.ts";
const catalog: FinanceCatalog = {
  categories: [
    { id: "rent", name: "Аренда", direction: "in", position: 0, created_at: "", updated_at: "" },
  ],
  articles: [
    {
      id: "month",
      name: "Помесячная",
      direction: "in",
      category_id: "rent",
      code: null,
      position: 0,
      created_at: "",
      updated_at: "",
    },
  ],
};
const payment = (overrides: Partial<Payment> = {}): Payment =>
  ({
    amount: 100,
    status: "paid",
    paid_amount: null,
    direction: "in",
    article_id: "month",
    article: null,
    kind: "rent_in",
    ...overrides,
  }) as Payment;
test("categories aggregate plan and actual, including partial payments", () => {
  const rows = summarizeByArticleCategory(
    [
      payment(),
      payment({ status: "partial", paid_amount: 25 }),
      payment({ status: "expected" }),
      payment({ direction: "out" }),
    ],
    catalog,
    "in",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.categoryName, "Аренда");
  assert.equal(rows[0]?.plan, 300);
  assert.equal(rows[0]?.fact, 125);
});
test("moving an article changes its report category without losing sums", () => {
  const moved: FinanceCatalog = {
    ...catalog,
    articles: catalog.articles.map((a) => ({ ...a, category_id: null })),
  };
  const rows = summarizeByArticleCategory([payment()], moved, "in");
  assert.equal(rows[0]?.categoryName, "Без категории");
  assert.equal(rows[0]?.fact, 100);
});
test("deleted and unassigned articles remain in totals", () => {
  const rows = summarizeByArticleCategory(
    [
      payment({ article_id: null }),
      payment({ article_id: "deleted", status: "partial", paid_amount: null }),
    ],
    catalog,
    "in",
  );
  assert.equal(
    rows.reduce((s, r) => s + r.plan, 0),
    200,
  );
  assert.equal(
    rows.reduce((s, r) => s + r.fact, 0),
    100,
  );
});
