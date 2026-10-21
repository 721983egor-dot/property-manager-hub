import test from "node:test";
import assert from "node:assert/strict";
import { confirmTaskReceipt } from "./finance-task-receipt.ts";
import type { supabase } from "../integrations/supabase/client";
const input = {
  p_payment: "p",
  p_booking: "b",
  p_expected_amount: 1000,
  p_expected_paid: 0,
  p_expected_date: "2026-11-01",
  p_expected_account: "Наличные",
  p_paid_total: 400,
  p_paid_date: "2026-10-21",
};
function fixture(
  options: { rpcCode?: string; race?: boolean; denied?: boolean; cancelled?: boolean } = {},
) {
  const row: Record<string, unknown> = {
    id: "p",
    booking_id: "b",
    direction: "in",
    kind: "rent_in",
    rental_component: "rent",
    amount: 1000,
    status: "expected",
    planned_date: "2026-11-01",
    account: "Наличные",
    paid_amount: null,
    paid_at: null,
    updated_at: "2026-10-20T00:00:00Z",
  };
  let writes = 0;
  const db = {
    rpc: async () => ({ error: { code: options.rpcCode ?? "PGRST202", message: "RPC error" } }),
    from: (table: string) => {
      let patch: Record<string, unknown> | undefined;
      const filters: [string, unknown][] = [];
      const chain = {
        update: (value: Record<string, unknown>) => {
          patch = value;
          return chain;
        },
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return chain;
        },
        is: (key: string, value: unknown) => {
          filters.push([key, value]);
          return chain;
        },
        select: () => {
          if (!patch) return chain;
          if (options.denied)
            return Promise.resolve({ error: { message: "permission denied" }, data: null });
          if (options.race) row["paid_amount"] = 300;
          if (!filters.every(([k, v]) => row[k] === v))
            return Promise.resolve({ error: null, data: [] });
          Object.assign(row, patch);
          writes++;
          return Promise.resolve({ error: null, data: [{ id: "p" }] });
        },
        maybeSingle: async () => ({
          error: null,
          data:
            table === "payments"
              ? { ...row }
              : {
                  id: "b",
                  status: options.cancelled ? "cancelled" : "active",
                  properties: { portfolio: "rm" },
                },
        }),
      };
      return chain;
    },
  } as unknown as typeof supabase;
  return { db, row, writes: () => writes };
}
test("fallback records partial and full receipt on the existing row; retries do not duplicate money", async () => {
  const f = fixture();
  await confirmTaskReceipt(f.db, input);
  assert.equal(f.row["paid_amount"], 400);
  assert.equal(f.row["status"], "partial");
  assert.equal(f.writes(), 1);
  await confirmTaskReceipt(f.db, input);
  assert.equal(f.writes(), 1);
  await confirmTaskReceipt(f.db, { ...input, p_expected_paid: 400, p_paid_total: 1000 });
  assert.equal(f.row["paid_amount"], 1000);
  assert.equal(f.row["status"], "paid");
  assert.equal(f.writes(), 2);
});
test("compare-and-set rejects a concurrent payment change", async () => {
  const f = fixture({ race: true });
  await assert.rejects(confirmTaskReceipt(f.db, input), /Платёж изменился/);
  assert.equal(f.writes(), 0);
  assert.equal(f.row["paid_amount"], 300);
});
test("fallback preserves RLS errors and rejects cancelled bookings", async () => {
  const denied = fixture({ denied: true });
  await assert.rejects(confirmTaskReceipt(denied.db, input), /permission denied/);
  assert.equal(denied.writes(), 0);
  const cancelled = fixture({ cancelled: true });
  await assert.rejects(confirmTaskReceipt(cancelled.db, input), /действующей брони/);
  assert.equal(cancelled.writes(), 0);
});
test("validation rejects stale conditions, overpayment and invalid dates", async () => {
  for (const patch of [
    { p_expected_amount: 999 },
    { p_paid_total: 1001 },
    { p_paid_date: "2026-02-30" },
    { p_paid_date: "2999-01-01" },
    { p_paid_total: 0 },
  ]) {
    const f = fixture();
    await assert.rejects(confirmTaskReceipt(f.db, { ...input, ...patch }));
    assert.equal(f.writes(), 0);
  }
});
test("does not bypass a rejection from an installed RPC", async () => {
  const f = fixture({ rpcCode: "42501" });
  await assert.rejects(confirmTaskReceipt(f.db, input), /RPC error/);
  assert.equal(f.writes(), 0);
});
