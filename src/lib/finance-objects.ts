import { supabase } from "@/integrations/supabase/client";
export type FinanceObjectClass = { id: string; name: string };
export type FinanceObjectAssignment = {
  property_id: string;
  classification_id: string | null;
  owner_counterparty_id?: string | null;
  payout_day?: number | null;
};
export async function fetchFinanceObjectClasses(): Promise<FinanceObjectClass[]> {
  const { data, error } = await supabase
    .from("finance_object_classes")
    .select("id,name")
    .order("name");
  if (error) throw error;
  return data ?? [];
}
export async function fetchFinanceObjectAssignments(): Promise<FinanceObjectAssignment[]> {
  const rows: FinanceObjectAssignment[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("finance_object_settings")
      .select("property_id,classification_id,owner_counterparty_id,payout_day")
      .order("property_id")
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 500) return rows;
  }
}
export async function saveFinanceObjectClass(id: string | null, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Укажите название классификации");
  const table = supabase.from("finance_object_classes");
  const { error } = id
    ? await table.update({ name: trimmed }).eq("id", id)
    : await table.insert({ name: trimmed });
  if (error) throw error;
}
export async function deleteFinanceObjectClass(id: string) {
  const { error } = await supabase.from("finance_object_classes").delete().eq("id", id);
  if (error) throw error;
}
export async function assignFinanceObjectClass(
  propertyId: string,
  classificationId: string | null,
) {
  const { error } = await supabase
    .from("finance_object_settings")
    .upsert(
      { property_id: propertyId, classification_id: classificationId },
      { onConflict: "property_id" },
    );
  if (error) throw error;
}
