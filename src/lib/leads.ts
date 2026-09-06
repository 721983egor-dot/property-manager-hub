import { supabase } from "@/integrations/supabase/client";

export type LeadStatus = "new" | "in_work" | "done" | "rejected";

export type Lead = {
  id: string;
  name: string;
  phone: string;
  topic: string;
  message: string;
  source: string;
  status: LeadStatus;
  created_at: string;
};

export const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "Новая" },
  { value: "in_work", label: "В работе" },
  { value: "done", label: "Обработана" },
  { value: "rejected", label: "Отклонена" },
];

export function leadStatusLabel(value: LeadStatus) {
  return LEAD_STATUS_OPTIONS.find((s) => s.value === value)?.label ?? value;
}

export async function fetchLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Lead[];
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  const { error } = await supabase.from("leads").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteLead(id: string) {
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw error;
}
