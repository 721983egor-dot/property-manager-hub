import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requestScheduleActor } from "@/lib/scheduled-actions/actor.server";
import { DEFAULT_SUPPORT_PLAYBOOK } from "./employee-tests";
import { playbookSchema } from "./model";

const db = supabaseAdmin as unknown as SupabaseClient;

export async function getSupportPlaybook() {
  await requestScheduleActor();
  const result = await db
    .from("ai_support_playbook")
    .select("value,revision")
    .eq("id", true)
    .maybeSingle();
  if (result.error) throw Error("Не удалось загрузить памятку Александра");
  return {
    value: result.data ? playbookSchema.parse(result.data.value) : DEFAULT_SUPPORT_PLAYBOOK,
    revision: (result.data?.revision as string | undefined) ?? "initial",
  };
}
