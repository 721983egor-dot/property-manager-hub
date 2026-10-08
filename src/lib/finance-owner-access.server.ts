import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
/** Owner settlement tools use the authenticated administrator, never an unchecked service-role RPC. */
export async function ownerFinanceAdminClient() {
  const auth = getRequest()?.headers.get("authorization");
  if (!auth?.startsWith("Bearer "))
    throw new Error("Войдите в РМ ОС как администратор для расчётов с собственниками");
  const client = createClient<Database>(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await client.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new Error("Требуется вход");
  const role = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (role.error || !role.data) throw new Error("Только администратор");
  return client;
}
