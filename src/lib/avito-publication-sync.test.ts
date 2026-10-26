import { test } from "node:test";
import assert from "node:assert/strict";

// Exercise the real sync service and Supabase request filters with isolated HTTP responses.
process.env.SUPABASE_URL = "https://db.example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
const { syncAvitoListingIds, syncAvitoPublicationStatus } = await import("./avito-chats.server.ts");
type Row = {
  id: string;
  property_id: string;
  external_id: string;
  platform: string;
  published: boolean;
  updated_at: string;
  published_at: string;
};
const row = (id: string, external_id: string): Row => ({
  id,
  property_id: id,
  external_id,
  platform: "avito",
  published: true,
  updated_at: "2026-10-20T00:00:00Z",
  published_at: "2026-10-20T00:00:00Z",
});

async function fixture(
  rows: Row[],
  options: {
    failStatus?: string;
    stale?: boolean;
    mappings?: { ad_id: string; avito_id: number }[];
  } = {},
  run: (result: { audits: unknown[]; requests: URL[] }) => Promise<void>,
) {
  const previousFetch = globalThis.fetch;
  const audits: unknown[] = [];
  const requests: URL[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.pathname === "/token") return json({ access_token: "fake-token", expires_in: 86400 });
    if (url.pathname.endsWith("/accounts/self")) return json({ id: 123 });
    if (url.pathname.endsWith("/platform_secrets"))
      return json([{ name: url.searchParams.get("name")?.slice(3), value: "fake-credential" }]);
    if (url.pathname === "/core/v1/items") {
      const status = url.searchParams.get("status");
      if (status === options.failStatus) return json({ error: "Unavailable" }, 503);
      return json({
        resources:
          status === "active"
            ? [{ id: 100, status }]
            : status === "old"
              ? [{ id: 101, status }]
              : [],
      });
    }
    if (url.pathname.endsWith("/avito_ids")) return json({ items: options.mappings ?? [] });
    if (url.pathname.endsWith("/property_listings")) {
      if (init?.method !== "PATCH") return json(structuredClone(rows.filter((r) => r.published)));
      if (options.stale) return json([]);
      const found = rows.find((r) =>
        [...url.searchParams].every(
          ([key, value]) =>
            key === "select" ||
            !value.startsWith("eq.") ||
            String(r[key as keyof Row]) === value.slice(3),
        ),
      );
      if (!found) return json([]);
      Object.assign(found, JSON.parse(String(init.body)));
      return json([found]);
    }
    if (url.pathname.endsWith("/activity_log")) {
      audits.push(JSON.parse(String(init?.body)));
      return json([]);
    }
    throw new Error("Unexpected request " + url.pathname);
  };
  try {
    await run({ audits, requests });
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test("sync removes only positively confirmed inactive ads and records the change", async () => {
  const rows = [row("active", "100"), row("expired", "101"), row("pending", "102")];
  await fixture(rows, {}, async ({ audits }) => {
    assert.deepEqual(await syncAvitoPublicationStatus(), {
      checked: 3,
      deactivated: 1,
      activeOnAvito: 1,
    });
    assert.deepEqual(
      rows.map((r) => r.published),
      [true, false, true],
    );
    assert.equal(audits.length, 1);
  });
});

test("an API failure after successful active and old responses changes no flags", async () => {
  const rows = [row("expired", "101")];
  await fixture(rows, { failStatus: "removed" }, async ({ audits }) => {
    await assert.rejects(syncAvitoPublicationStatus(), /503/);
    assert.equal(rows[0].published, true);
    assert.equal(audits.length, 0);
  });
});

test("a concurrently edited publication is not overwritten or counted as deactivated", async () => {
  const rows = [row("expired", "101")];
  await fixture(rows, { stale: true }, async ({ audits, requests }) => {
    assert.equal((await syncAvitoPublicationStatus()).deactivated, 0);
    assert.equal(rows[0].published, true);
    assert.equal(audits.length, 0);
    const patch = requests.find((u) => u.searchParams.has("updated_at"));
    assert.equal(patch?.searchParams.get("updated_at"), "eq.2026-10-20T00:00:00Z");
    assert.equal(patch?.searchParams.get("external_id"), "eq.101");
  });
});

test("missing IDs resolve by property UUID without relinking chats with an empty ID", async () => {
  const rows = [row("property-uuid", ""), row("not-uploaded-yet", "")];
  await fixture(
    rows,
    { mappings: [{ ad_id: "property-uuid", avito_id: 100 }] },
    async ({ requests }) => {
      assert.deepEqual(await syncAvitoListingIds(), { linked: 1 });
      assert.equal(rows[0].external_id, "100");
      assert.equal(rows[1].external_id, "");
      assert.deepEqual(
        rows.map((r) => r.published),
        [true, true],
      );
      assert.equal(
        requests.some((u) => u.pathname.endsWith("/chat_threads")),
        false,
      );
      assert.equal(
        requests.find((u) => u.pathname.endsWith("/avito_ids"))?.searchParams.get("query"),
        "property-uuid,not-uploaded-yet",
      );
    },
  );
});
