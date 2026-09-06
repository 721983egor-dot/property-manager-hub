import { supabase } from "@/integrations/supabase/client";

export type Selection = {
  id: string;
  code: string;
  client_name: string;
  comment: string;
  created_at: string;
  updated_at: string;
};

export type SelectionItem = {
  id: string;
  selection_id: string;
  property_id: string;
  position: number;
  created_at: string;
};

export type SelectionWithItems = Selection & {
  items: Pick<SelectionItem, "property_id" | "position">[];
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 7;

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return code;
}

export async function createSelection(input: {
  propertyIds: string[];
  clientName?: string;
  comment?: string;
}): Promise<SelectionWithItems> {
  const propertyIds = input.propertyIds.filter(Boolean);
  if (propertyIds.length === 0) {
    throw new Error("Выберите хотя бы один объект");
  }

  const code = generateCode();
  const { data: selection, error: selectionError } = await supabase
    .from("selections")
    .insert({
      code,
      client_name: input.clientName?.trim() ?? "",
      comment: input.comment?.trim() ?? "",
    })
    .select("*")
    .single();

  if (selectionError) throw selectionError;
  if (!selection) throw new Error("Не удалось создать подборку");

  const items = propertyIds.map((property_id, index) => ({
    selection_id: selection.id,
    property_id,
    position: index,
  }));

  const { error: itemsError } = await supabase.from("selection_items").insert(items);
  if (itemsError) throw itemsError;

  return {
    ...selection,
    items: propertyIds.map((property_id, index) => ({ property_id, position: index })),
  };
}

export async function fetchSelections(): Promise<SelectionWithItems[]> {
  const { data, error } = await supabase
    .from("selections")
    .select("*, selection_items(property_id, position)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    items: (row['selection_items'] as { property_id: string; position: number }[]).sort(
      (a, b) => a.position - b.position,
    ),
  }));
}

export async function fetchSelectionByCode(code: string): Promise<SelectionWithItems | null> {
  const { data, error } = await supabase
    .from("selections")
    .select("*, selection_items(property_id, position)")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    items: (data['selection_items'] as { property_id: string; position: number }[]).sort(
      (a, b) => a.position - b.position,
    ),
  };
}

export async function deleteSelection(id: string): Promise<void> {
  const { error } = await supabase.from("selections").delete().eq("id", id);
  if (error) throw error;
}
