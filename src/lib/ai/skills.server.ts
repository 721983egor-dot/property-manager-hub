import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AssistantSkill = { id: string; text: string; created_at: string };

/** Правила, которым Ассистента научил менеджер. */
export async function loadAssistantSkills(): Promise<AssistantSkill[]> {
  try {
    const { data } = await supabaseAdmin
      .from("assistant_skills")
      .select("id, text, created_at")
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(100);
    return (data ?? []) as AssistantSkill[];
  } catch {
    return [];
  }
}

export async function addAssistantSkill(text: string, author = ""): Promise<void> {
  const { error } = await supabaseAdmin
    .from("assistant_skills")
    .insert({ text: text.trim(), created_by: author });
  if (error) throw new Error(error.message);
}

export async function removeAssistantSkill(query: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("assistant_skills")
    .select("id, text")
    .eq("active", true)
    .ilike("text", `%${query}%`)
    .limit(1);
  const row = (data ?? [])[0] as { id: string; text: string } | undefined;
  if (!row) return null;
  await supabaseAdmin.from("assistant_skills").update({ active: false }).eq("id", row.id);
  return row.text;
}

/** Блок правил для системного промпта. */
export function skillsPromptBlock(list: AssistantSkill[]): string {
  if (!list.length) return "";
  return `\n\nПравила, которым тебя научил менеджер (соблюдай их всегда):\n${list
    .map((s, i) => `${i + 1}. ${s.text}`)
    .join("\n")}`;
}
