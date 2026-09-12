import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import {
  createSelectionRecord,
  deleteSavedSelection,
  listSavedSelections,
  type Selection,
  type SelectionItemRef,
  type SelectionWithItems,
} from "@/lib/selections.functions";

export type { Selection, SelectionWithItems };
export type SelectionItem = {
  id: string;
  selection_id: string;
  property_id: string;
  position: number;
  created_at: string;
};

export async function createSelection(input: {
  propertyIds: string[];
  name?: string;
  clientName?: string;
  comment?: string;
  saved?: boolean;
  /** Писать событие selection_add по каждому объекту (по умолчанию true). */
  trackEvents?: boolean;
}): Promise<SelectionWithItems> {
  const propertyIds = input.propertyIds.filter(Boolean);
  if (propertyIds.length === 0) {
    throw new Error("Выберите хотя бы один объект");
  }

  const selection = await createSelectionRecord({
    data: {
      propertyIds,
      name: input.name,
      clientName: input.clientName,
      comment: input.comment,
      saved: input.saved,
    },
  });

  if (input.trackEvents ?? true) {
    for (const propertyId of propertyIds) trackEvent(propertyId, "selection_add");
  }

  return selection;
}

export async function fetchSelections(): Promise<SelectionWithItems[]> {
  return listSavedSelections();
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
    ...(data as Selection),
    items: ((data["selection_items"] as SelectionItemRef[] | null) ?? []).sort(
      (a, b) => a.position - b.position,
    ),
  };
}

export async function deleteSelection(id: string): Promise<void> {
  await deleteSavedSelection({ data: { id } });
}
