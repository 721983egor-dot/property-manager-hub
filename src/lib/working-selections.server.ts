import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { keyActor, keyRequestActor } from "./property-keys.server";
import { MANAGER_PROPERTY_COLUMNS, type ManagerProperty } from "./manager-property-view";
import {
  workingSelectionSchema,
  managerNoteSchema,
  type WorkingSelection,
} from "./working-selections-model";
const db = supabaseAdmin as unknown as SupabaseClient;
async function pages<T>(table: string, columns: string, equals?: [string, string | boolean]) {
  const out: T[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db
      .from(table)
      .select(columns)
      .order("id")
      .range(offset, offset + 499);
    if (equals) query = query.eq(equals[0], equals[1]);
    const r = await query;
    if (r.error) throw Error(r.error.message);
    out.push(...(r.data as unknown as T[]));
    if (r.data.length < 500) return out;
  }
}
export async function loadManagerCatalog(userId: string) {
  const actor = await keyActor(userId);
  const properties = await pages<ManagerProperty>("properties", MANAGER_PROPERTY_COLUMNS, [
    "portfolio",
    "rm",
  ]);
  const notes = await db
    .from("property_manager_notes")
    .select("property_id,note,version")
    .limit(10000);
  if (notes.error) throw Error(notes.error.message);
  return {
    actor,
    properties: properties as ManagerProperty[],
    notes: notes.data as { property_id: string; note: string; version: number }[],
  };
}
export async function loadWorkingSelections(userId: string) {
  await keyActor(userId);
  const selections = await pages<{
    id: string;
    code: string;
    name: string;
    comment: string;
    updated_at: string;
    selection_items: { property_id: string; position: number }[];
  }>("selections", "id,code,name,comment,updated_at,selection_items(property_id,position)", [
    "saved",
    true,
  ]);
  const details = await db.from("working_selections").select("*").limit(10000);
  if (details.error) throw Error(details.error.message);
  const result: WorkingSelection[] = selections.map((s) => {
    const w = details.data.find((d) => d.selection_id === s.id);
    return {
      id: s.id,
      code: s.code,
      name: s.name || "Подборка объектов",
      publicComment: s.comment || "",
      version: w?.version ?? 0,
      dealId: w?.deal_id ?? null,
      showingDate: w?.showing_date ?? "",
      items:
        w?.items ??
        s.selection_items
          .sort((a, b) => a.position - b.position)
          .map((i) => ({
            propertyId: i.property_id,
            outcome: "pending",
            note: "",
            feedback: "",
          })),
      updatedAt: s.updated_at,
    };
  });
  const deals = await pages<{ id: string; title: string; stage_id: string }>(
    "deals",
    "id,title,stage_id",
    ["pipeline", "rental"],
  );
  const stages = await db.from("deal_stages").select("id,name");
  if (stages.error) throw Error(stages.error.message);
  return {
    selections: result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    deals: deals.map((d) => ({
      id: d.id as string,
      title: d.title as string,
      stage: stages.data.find((s) => s.id === d.stage_id)?.name ?? "",
    })),
  };
}
export async function saveWorkingSelection(userId: string, raw: unknown) {
  const actor = await keyActor(userId);
  const input = workingSelectionSchema.parse(raw);
  const r = await db.rpc("save_working_selection", {
    p_id: input.id,
    p_expected: input.expected,
    p_data: input,
    p_actor: actor.id,
  });
  if (r.error) throw Error(r.error.message);
  const code = await db.from("selections").select("code").eq("id", input.id).single();
  if (code.error) throw Error(code.error.message);
  return { version: Number(r.data), code: code.data.code as string };
}
export async function saveManagerNote(userId: string, raw: unknown) {
  const actor = await keyActor(userId);
  const input = managerNoteSchema.parse(raw);
  const r = await db.rpc("save_property_manager_note", {
    p_property: input.propertyId,
    p_expected: input.expected,
    p_note: input.note,
    p_actor: actor.id,
  });
  if (r.error) throw Error(r.error.message);
  return { version: Number(r.data) };
}
export async function workingAssistantRead() {
  const actor = await keyRequestActor();
  return { ...(await loadWorkingSelections(actor.id)), ...(await loadManagerCatalog(actor.id)) };
}
export async function workingAssistantSave(raw: Record<string, unknown>) {
  const actor = await keyRequestActor();
  const r = await saveWorkingSelection(actor.id, raw);
  return `Рабочая подборка сохранена, версия ${r.version}. /selections/${raw["id"]}; клиентская ссылка /p/${r.code}`;
}
export async function managerAssistantNote(raw: Record<string, unknown>) {
  const actor = await keyRequestActor();
  await saveManagerNote(actor.id, raw);
  return "Информация для менеджеров сохранена";
}
