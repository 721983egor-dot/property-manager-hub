import { supabase } from "@/integrations/supabase/client";
export type CounterpartyClassification = { id: string; name: string };
export async function fetchCounterpartyClassifications(): Promise<CounterpartyClassification[]> {
  const { data, error } = await supabase
    .from("finance_counterparty_classes")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as CounterpartyClassification[];
}
export async function saveCounterpartyClassification(id: string | null, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Укажите название классификации");
  const table = supabase.from("finance_counterparty_classes");
  const { error } = id
    ? await table.update({ name: trimmed } as never).eq("id", id)
    : await table.insert({ name: trimmed } as never);
  if (error) throw error;
}
export async function deleteCounterpartyClassification(id: string) {
  const { error } = await supabase.from("finance_counterparty_classes").delete().eq("id", id);
  if (error) throw error;
}
