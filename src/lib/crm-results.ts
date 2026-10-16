import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DealPipeline } from "./deals";
export type LossReason = {
  id: string;
  pipeline: DealPipeline;
  name: string;
  position: number;
  archived: boolean;
};
export const crmDb = supabase as unknown as SupabaseClient;
export async function fetchLossReasons(pipeline: DealPipeline) {
  const { data, error } = await crmDb
    .from("deal_loss_reasons")
    .select("*")
    .eq("pipeline", pipeline)
    .order("position");
  if (error) throw error;
  return (data ?? []) as LossReason[];
}
export async function saveLossReason(input: {
  id?: string;
  pipeline: DealPipeline;
  name: string;
  position: number;
  archived?: boolean;
}) {
  const { id, ...patch } = input;
  if (!patch.name.trim()) throw new Error("Укажите причину");
  patch.name = patch.name.trim();
  const result = id
    ? await crmDb
        .from("deal_loss_reasons")
        .update(patch)
        .eq("id", id)
        .eq("pipeline", input.pipeline)
    : await crmDb.from("deal_loss_reasons").insert(patch);
  if (result.error) throw result.error;
}
export async function closeDealLost(
  dealId: string,
  reasonId: string,
  comment: string,
  closedOn: string,
) {
  const { error } = await crmDb.rpc("crm_close_lost", {
    p_deal: dealId,
    p_reason: reasonId,
    p_comment: comment,
    p_closed_on: closedOn,
  });
  if (error) throw error;
}
