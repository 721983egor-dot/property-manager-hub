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
  if (error) {
    if (error.code === "23505") throw new Error("Счёт с таким названием уже существует");
    throw error;
  }
  return (data ?? []) as FinanceAccount[];
}
export async function createFinanceAccount(name: string, type: FinanceAccountType) {
  if (!name.trim()) throw new Error("Укажите название счёта");
  const { error } = await supabase.from("finance_accounts").insert({ name: name.trim(), type });
  if (error) {
    if (error.code === "23505") throw new Error("Счёт с таким названием уже существует");
    throw error;
  }
}
export async function archiveFinanceAccount(id: string, archived: boolean) {
  const { error } = await supabase.from("finance_accounts").update({ archived }).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("Счёт с таким названием уже существует");
    throw error;
  }
}

export async function updateFinanceAccount(id: string, name: string, type: FinanceAccountType) {
  if (!name.trim()) throw new Error("Укажите название счёта");
  if (!(type in FINANCE_ACCOUNT_TYPES)) throw new Error("Укажите тип счёта");
  const { data, error } = await supabase
    .from("finance_accounts")
    .update({ name: name.trim(), type })
    .eq("id", id)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Счёт с таким названием уже существует");
    throw error;
  }
  if (!data) throw new Error("Счёт не найден или недоступен");
}

export async function fetchFinanceAccountUsage(
  id: string,
): Promise<{ payments: number; deals: number; schedules?: number; receipts?: number; series?: number }> {
  const { data, error } = await supabase.rpc("finance_account_usage", { p_id: id });
  if (error) throw error;
  if (!data) throw new Error("Не удалось проверить счёт");
  return data;
}
export async function deleteFinanceAccount(id: string, transferTo: string | null = null) {
  const { error } = await supabase.rpc("delete_finance_account", {
    p_id: id,
    p_transfer_to: transferTo,
  });
  if (error) throw error;
}
