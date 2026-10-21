import test from "node:test";
import assert from "node:assert/strict";
import { confirmTaskReceipt } from "./finance-task-receipt.ts";
import type { supabase } from "../integrations/supabase/client";
const input = {
  p_payment: "p",
  p_booking: "b",
  p_expected_amount: 150000,
  p_expected_paid: 90000,
  p_expected_date: "2026-11-01",
  p_expected_account: "Карта",
  p_paid_total: 150000,
  p_paid_date: "2026-10-21",
  p_received_account: "Наличные",
  p_request_id: "stable-request",
};
test("passes actual cash account and stable retry identity to atomic receipt RPC", async () => {
  const calls: unknown[] = [];
  const db = {
    rpc: async (name: string, value: unknown) => {
      calls.push({ name, value });
      return { error: null };
    },
  } as unknown as typeof supabase;
  await confirmTaskReceipt(db, input);
  await confirmTaskReceipt(db, input);
  assert.deepEqual(calls, [
    { name: "finance_record_task_receipt", value: input },
    { name: "finance_record_task_receipt", value: input },
  ]);
});
test("missing migration fails closed, never overwrites old cumulative history", async () => {
  const db = {
    rpc: async () => ({ error: { code: "PGRST202", message: "missing function" } }),
  } as unknown as typeof supabase;
  await assert.rejects(confirmTaskReceipt(db, input), /не обновлён/);
});
test("RPC stale snapshot and permission errors are not retried via a weaker writer", async () => {
  const db = {
    rpc: async () => ({ error: { code: "42501", message: "permission denied" } }),
  } as unknown as typeof supabase;
  await assert.rejects(confirmTaskReceipt(db, input), /permission denied/);
});
