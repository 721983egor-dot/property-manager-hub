import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";

export type Selection = {
  id: string;
  code: string;
  name: string;
  client_name: string;
  comment: string;
  saved: boolean;
  created_at: string;
  updated_at: string;
};

export type SelectionItemRef = { property_id: string; position: number };

export type SelectionWithItems = Selection & { items: SelectionItemRef[] };

export type CreateSelectionInput = {
  propertyIds: string[];
  name?: string;
  clientName?: string;
  comment?: string;
  saved?: boolean;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateCode() {
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < bytes.length; i++) code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return code;
}

function asMessage(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message?.trim();
  return message || fallback;
}

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

/** Создаёт подборку в базе RM OS, минуя клиентский RLS. */
export async function insertSelection(input: CreateSelectionInput): Promise<SelectionWithItems> {
  const propertyIds = [...new Set((input.propertyIds ?? []).filter(Boolean))];
  if (!propertyIds.length) throw new Error("Выберите хотя бы один объект");
  if (propertyIds.some((id) => !UUID_RE.test(id))) throw new Error("Некорректный объект в подборке");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existingProperties, error: propertiesError } = await supabaseAdmin
    .from("properties")
    .select("id")
    .in("id", propertyIds);
  if (propertiesError) throw new Error(propertiesError.message);
  const existingIds = new Set((existingProperties ?? []).map((property) => property.id));
  const missingIds = propertyIds.filter((id) => !existingIds.has(id));
  if (missingIds.length) {
    throw new Error(
      `Не удалось создать подборку: ${missingIds.length} объект(а) отсутствуют в текущей базе RM OS`,
    );
  }

  let selection: Selection | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("selections")
      .insert({
        code: generateCode(),
        name: input.name?.trim() ?? "",
        client_name: input.clientName?.trim() ?? "",
        comment: input.comment?.trim() ?? "",
        saved: input.saved ?? false,
      })
      .select("*")
      .single();
    if (error?.code === "23505") continue;
    if (error || !data) {
      throw new Error(asMessage(error, "Не удалось создать подборку"));
    }
    selection = data as Selection;
    break;
  }
  if (!selection) throw new Error("Не удалось создать подборку");

  const items = propertyIds.map((property_id, index) => ({
    selection_id: selection.id,
    property_id,
    position: index,
  }));
  const { error: itemsError } = await supabaseAdmin.from("selection_items").insert(items);
  if (itemsError) {
    await supabaseAdmin.from("selections").delete().eq("id", selection.id);
    throw new Error(asMessage(itemsError, "Не удалось сохранить объекты подборки"));
  }

  return {
    ...selection,
    items: propertyIds.map((property_id, index) => ({ property_id, position: index })),
  };
}

/** Публичное и для сотрудников: создать подборку объектов. */
export const createSelectionRecord = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as CreateSelectionInput)
  .handler(async ({ data }): Promise<SelectionWithItems> => insertSelection(data));

/** Сохранённые подборки для раздела RM OS. */
export const listSavedSelections = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }): Promise<SelectionWithItems[]> => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("selections")
      .select("*, selection_items(property_id, position)")
      .eq("saved", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      ...(row as Selection),
      items: (
        (row["selection_items"] as { property_id: string; position: number }[] | null) ?? []
      ).sort((a, b) => a.position - b.position),
    }));
  });

/** Удаление сохранённой подборки — только администратор. */
export const deleteSavedSelection = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const admin = await requireStaff(context.userId);
    const { data: roles, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(roleError.message);
    if (!(roles ?? []).some((entry) => entry.role === "admin")) {
      throw new Error("Удалять подборки может только администратор");
    }
    if (!UUID_RE.test(data.id)) throw new Error("Некорректная подборка");
    const { error } = await admin.from("selections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
