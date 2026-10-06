import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultArticleForDirection,
  groupArticlesByCategory,
  kindFromArticle,
  moveIndex,
  type FinanceArticle,
  type FinanceArticleCategory,
} from "./finance-articles-model.ts";

function cat(
  id: string,
  name: string,
  direction: "in" | "out",
  position: number,
): FinanceArticleCategory {
  return { id, name, direction, position, created_at: "", updated_at: "" };
}

function art(
  id: string,
  name: string,
  direction: "in" | "out",
  category_id: string | null,
  position: number,
  code: string | null = null,
): FinanceArticle {
  return { id, name, direction, category_id, position, code, created_at: "", updated_at: "" };
}

describe("finance article catalog", () => {
  it("groups articles under categories and keeps uncategorized last", () => {
    const categories = [
      cat("c2", "Агентство", "out", 1),
      cat("c1", "Собственники", "out", 0),
    ];
    const articles = [
      art("a1", "Выплата", "out", "c1", 0, "owner_payout"),
      art("a2", "Комиссия", "out", "c2", 1, "agency_cost"),
      art("a3", "Прочее", "out", null, 2),
      art("a4", "Аренда", "in", "c-in", 0, "rent_in"),
    ];
    const groups = groupArticlesByCategory(categories, articles, "out");
    assert.equal(groups.length, 3);
    assert.equal(groups[0]?.category?.name, "Собственники");
    assert.equal(groups[1]?.category?.name, "Агентство");
    assert.equal(groups[2]?.category, null);
    assert.deepEqual(groups[2]?.articles.map((a) => a.id), ["a3"]);
  });

  it("moves items for drag-and-drop order", () => {
    assert.deepEqual(moveIndex(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
    assert.deepEqual(moveIndex(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
    assert.deepEqual(moveIndex(["a", "b"], 0, 0), ["a", "b"]);
  });

  it("maps seeded article codes to legacy payment kinds", () => {
    assert.equal(kindFromArticle(art("1", "Аренда", "in", null, 0, "rent_in")), "rent_in");
    assert.equal(kindFromArticle(art("2", "Новая", "out", null, 0)), "other");
  });

  it("picks default article by rental calendar codes", () => {
    const articles = [
      art("x", "Прочее", "in", null, 0, "other"),
      art("r", "Аренда", "in", null, 1, "rent_in"),
      art("c", "Расход агентства", "out", null, 0, "agency_cost"),
    ];
    assert.equal(defaultArticleForDirection(articles, "in")?.id, "r");
    assert.equal(defaultArticleForDirection(articles, "out")?.id, "c");
  });
});
