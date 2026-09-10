import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";

async function requireStaff(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "manager"])
    .limit(1);

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("У сотрудника нет доступа к RM OS");
  return supabaseAdmin;
}

/** Объекты для вошедших сотрудников. Изменения по-прежнему контролируются RLS. */
export const listStaffProperties = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("properties")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getStaffProperty = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ context, data: input }) => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("properties")
      .select("*")
      .eq("id", input.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const CLIENT_COLUMNS = "id, full_name, phone, comment, blacklisted, blacklist_reason";

/** Клиенты для вошедших сотрудников. Менеджер получает только чтение. */
export const listStaffClients = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("clients")
      .select(CLIENT_COLUMNS)
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getStaffClient = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ context, data: input }) => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("id", input.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });