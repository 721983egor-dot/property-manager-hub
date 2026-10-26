import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avitoConfirmedInactiveStatus,
  avitoLinkKeys,
  loadAvitoStatusItems,
} from "./avito-publication.ts";

test("an ad absent from active results is not enough to turn publication off", () => {
  const states = new Map([["100", new Set<"active" | "old">(["active"])]]);
  assert.equal(avitoConfirmedInactiveStatus("100", states), null);
  assert.equal(avitoConfirmedInactiveStatus("101", states), null);
});

test("only a confirmed inactive status removes the flag; changing snapshots remain untouched", () => {
  for (const status of ["old", "removed", "blocked", "rejected"] as const) {
    assert.equal(
      avitoConfirmedInactiveStatus("100", new Map([["100", new Set([status])]])),
      status,
    );
  }
  assert.equal(
    avitoConfirmedInactiveStatus("100", new Map([["100", new Set(["active", "old"])]])),
    null,
  );
  assert.equal(
    avitoConfirmedInactiveStatus("100", new Map([["100", new Set(["old", "removed"])]])),
    null,
  );
});

test("empty external ID resolves using the property ID from our feed", () => {
  assert.deepEqual(avitoLinkKeys({ property_id: "property-uuid", external_id: "" }), [
    "property-uuid",
  ]);
  assert.deepEqual(avitoLinkKeys({ property_id: "property-uuid", external_id: "legacy-key" }), [
    "property-uuid",
    "legacy-key",
  ]);
  assert.deepEqual(avitoLinkKeys({ property_id: "property-uuid", external_id: "property-uuid" }), [
    "property-uuid",
  ]);
});

test("a deliberate republication has time to be processed by Avito", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const states = new Map([["100", new Set<"old">(["old"])]]);
  assert.equal(avitoConfirmedInactiveStatus("100", states, "2026-10-26T11:50:00Z", now), null);
  assert.equal(avitoConfirmedInactiveStatus("100", states, "2026-10-26T11:20:00Z", now), "old");
});

test("reads beyond the first 100 ads, including the final page", async () => {
  const pages: number[] = [];
  const result = await loadAvitoStatusItems("old", async (page) => {
    pages.push(page);
    return {
      resources: Array.from({ length: page === 1 ? 100 : 1 }, (_, i) => ({
        id: page * 100 + i,
        status: "old",
      })),
    };
  });
  assert.equal(result.length, 101);
  assert.deepEqual(pages, [1, 2]);
});

test("empty but valid results are accepted; malformed successful responses fail closed", async () => {
  assert.deepEqual(await loadAvitoStatusItems("active", async () => ({ resources: [] })), []);
  for (const payload of [
    {},
    null,
    { resources: null },
    { resources: [{}] },
    { resources: [{ id: 100, status: "old" }] },
    {
      resources: [
        { id: 100, status: "active" },
        { id: 100, status: "active" },
      ],
    },
  ]) {
    await assert.rejects(loadAvitoStatusItems("active", async () => payload));
  }
});

test("failure on a later API page rejects the complete snapshot", async () => {
  await assert.rejects(
    loadAvitoStatusItems("old", async (page) => {
      if (page === 2) throw new Error("Avito 503");
      return { resources: Array.from({ length: 100 }, (_, id) => ({ id, status: "old" })) };
    }),
    /503/,
  );
});

test("a repeated API page cannot masquerade as a complete result", async () => {
  await assert.rejects(
    loadAvitoStatusItems("old", async () => ({
      resources: Array.from({ length: 100 }, (_, id) => ({ id, status: "old" })),
    })),
    /неоднозначные/,
  );
});
