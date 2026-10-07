import { supabase } from "@/integrations/supabase/client";
export const FINANCE_ACCOUNT_TYPES = {
  bank: "Расчётный счёт",
  card: "Карта",
  cash: "Наличные",
} as const;
export type FinanceAccountType = keyof typeof FINANCE_ACCOUNT_TYPES;
export type FinanceAccount = {
  id: string;
  name: string;
  type: FinanceAccountType;
  archived: boolean;
};
export async function fetchFinanceAccounts(): Promise<FinanceAccount[]> {
  const { data, error } = await supabase
    .from("finance_accounts")
    .select("id,name,type,archived")
    .order("name");
  if (error) throw error;
  return (data ?? []) as FinanceAccount[];
}
export async function createFinanceAccount(name: string, type: FinanceAccountType) {
  if (!name.trim()) throw new Error("Укажите название счёта");
  const { error } = await supabase.from("finance_accounts").insert({ name: name.trim(), type });
  if (error) throw error;
}
export async function archiveFinanceAccount(id: string, archived: boolean) {
  const { error } = await supabase.from("finance_accounts").update({ archived }).eq("id", id);
  if (error) throw error;
}
