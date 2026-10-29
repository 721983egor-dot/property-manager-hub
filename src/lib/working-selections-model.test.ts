import test from "node:test";
import assert from "node:assert/strict";
import { workingSelectionSchema, reorderSelection } from "./working-selections-model";
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  c = "00000000-0000-4000-8000-000000000003";
const items = [
  { propertyId: a, outcome: "liked" as const, note: "Private note", feedback: "Client feedback" },
  { propertyId: b, outcome: "pending" as const, note: "", feedback: "" },
  { propertyId: c, outcome: "pending" as const, note: "", feedback: "" },
];
const draft = {
  id: c,
  expected: 1,
  name: "Показ",
  publicComment: "Для клиента",
  dealId: null,
  showingDate: "2026-11-01",
  items,
};
test("moving in both directions keeps the outcome/notes attached to the object and leaves source unchanged", () => {
  const next = reorderSelection(items, a, c, true);
  assert.deepEqual(
    next.map((i) => i.propertyId),
    [b, c, a],
  );
  assert.equal(next[2], items[0]);
  assert.equal(next[2]?.feedback, "Client feedback");
  assert.deepEqual(
    items.map((i) => i.propertyId),
    [a, b, c],
  );
  assert.deepEqual(
    reorderSelection(next, a, b, false).map((i) => i.propertyId),
    [a, b, c],
  );
});
test("invalid drag and dropping on itself do not remove objects", () => {
  assert.equal(reorderSelection(items, a, a, true), items);
  assert.equal(reorderSelection(items, "missing", b, true), items);
  assert.equal(reorderSelection(items, a, "missing", false), items);
});
test("schema rejects duplicate objects, impossible dates, missing outcomes and negative versions", () => {
  assert.equal(workingSelectionSchema.safeParse(draft).success, true);
  for (const invalid of [
    { ...draft, items: [items[0], items[0]] },
    { ...draft, showingDate: "2026-02-30" },
    { ...draft, expected: -1 },
    { ...draft, items: [{ propertyId: a }] },
    { ...draft, items: [] },
  ])
    assert.equal(workingSelectionSchema.safeParse(invalid).success, false);
});
test("no date or CRM link is required, public state has no internal fields", () => {
  const input = workingSelectionSchema.parse({ ...draft, showingDate: "", unexpectedSecret: "x" });
  assert.equal(input.showingDate, "");
  assert.equal("unexpectedSecret" in input, false);
  assert.equal(input.publicComment, "Для клиента");
});
