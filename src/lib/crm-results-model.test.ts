import test from "node:test";
import assert from "node:assert/strict";
import { filterCrmResults, crmSources, companyIncome, moscowDay } from "./crm-results-model.ts";
import type { Deal, DealStage } from "./deals";
const stages = [
  { id: "open", kind: "open" },
  { id: "won", kind: "won" },
  { id: "lost", kind: "lost" },
] as DealStage[];
const deal = (extra: Partial<Deal>) =>
  ({
    id: "d",
    title: "Test",
    stage_id: "won",
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-12-01T10:00:00Z",
    closed_at: "2026-10-15T10:00:00Z",
    source: "Авито",
    closing_source: "ЦИАН",
    ...extra,
  }) as Deal;
test("closed period uses actual closing date; edits cannot shift result", () => {
  assert.equal(filterCrmResults([deal({})], stages, "won", "2026-10-01", "2026-10-31").length, 1);
  assert.equal(filterCrmResults([deal({})], stages, "won", "2026-12-01", "2026-12-31").length, 0);
});
test("inquiries include all statuses and filter creation, not closure", () => {
  const ds = [deal({ stage_id: "open" }), deal({ stage_id: "won" }), deal({ stage_id: "lost" })];
  assert.equal(filterCrmResults(ds, stages, "inquiries", "2026-09-01", "2026-09-30").length, 3);
  assert.equal(filterCrmResults(ds, stages, "inquiries", "2026-10-01", "2026-10-31").length, 0);
  const s = crmSources(ds, stages, "inquiries")[0]!;
  assert.deepEqual([s.total, s.open, s.won, s.lost], [3, 1, 1, 1]);
});
test("original source and closing platform are separate; unknown old closure stays unknown", () => {
  assert.equal(crmSources([deal({})], stages, "inquiries")[0]!.name, "Авито");
  assert.equal(crmSources([deal({})], stages, "won")[0]!.name, "ЦИАН");
  assert.equal(crmSources([deal({ closing_source: "" })], stages, "won")[0]!.name, "Не указан");
  assert.equal(
    filterCrmResults([deal({ closed_at: null })], stages, "won", "2026-10-01", "2026-10-31").length,
    0,
  );
  assert.equal(filterCrmResults([deal({ closed_at: null })], stages, "won", "", "").length, 1);
});
test("Moscow calendar boundaries and percent/fixed income validation", () => {
  assert.equal(moscowDay("2026-10-15T22:30:00Z"), "2026-10-16");
  assert.equal(companyIncome(150000, "percent", 10), 15000);
  assert.equal(companyIncome(150000, "amount", 2000), 2000);
  assert.equal(companyIncome(150000, "percent", 0), 0);
  assert.throws(() => companyIncome(150000, "percent", 101));
  assert.throws(() => companyIncome(150000, "amount", 150001));
});
