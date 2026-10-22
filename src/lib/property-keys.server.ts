import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManagerProperty } from "./manager-property-view";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  applyKeyCommand,
  emptyKeyInventory,
  type KeyActor,
  type KeyCommand,
  type KeyInventory,
  type KeyPerson,
} from "./property-keys-model";
import { MANAGER_PROPERTY_COLUMNS } from "./manager-property-view";
const db = supabaseAdmin as unknown as SupabaseClient;
export async function keyActor(userId: string): Promise<KeyActor> {
  const [roles, profile] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  if (roles.error || profile.error) throw Error("Не удалось проверить доступ");
  const values = (roles.data ?? []).map((r: { role: string }) => r.role);
  const role = values.includes("admin") ? "admin" : values.includes("manager") ? "manager" : null;
  if (!role) throw Error("Учёт ключей доступен только сотрудникам");
  return { id: userId, role, name: profile.data?.full_name || "Сотрудник" };
}
export async function keyRequestActor() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const auth = getRequest()?.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const user = await db.auth.getUser(auth.slice(7));
    if (user.error || !user.data?.user) throw Error("Требуется вход");
    return keyActor(user.data.user.id);
  }
  const { crmAccess } = await import("./crm-results.server");
  const access = await crmAccess();
  if (access.actor) return keyActor(access.actor);
  throw Error("Требуется вход сотрудника");
}
export async function keyPeople(): Promise<KeyPerson[]> {
  const roles = await db.from("user_roles").select("user_id").in("role", ["admin", "manager"]);
  if (roles.error) throw Error(roles.error.message);
  const ids = [...new Set((roles.data ?? []).map((r: { user_id: string }) => r.user_id))];
  if (!ids.length) return [];
  const profiles = await db.from("profiles").select("id,full_name,phone").in("id", ids);
  if (profiles.error) throw Error(profiles.error.message);
  return (profiles.data ?? []).map(
    (p: { id: string; full_name: string | null; phone: string | null }) => ({
      id: p.id,
      name: p.full_name || "Сотрудник",
      phone: p.phone || "",
    }),
  );
}
async function propertyPages(): Promise<ManagerProperty[]> {
  const rows: ManagerProperty[] = [];
  for (let start = 0; ; start += 500) {
    const r = await db
      .from("properties")
      .select(MANAGER_PROPERTY_COLUMNS)
      .eq("portfolio", "rm")
      .order("id")
      .range(start, start + 499);
    if (r.error) throw Error(r.error.message);
    rows.push(...(r.data as unknown as ManagerProperty[]));
    if (r.data.length < 500) return rows;
  }
}
export async function loadKeyWorkspace(actor: KeyActor) {
  const [properties, people, inventories] = await Promise.all([
    propertyPages(),
    keyPeople(),
    db
      .from("property_key_inventories")
      .select("property_id,version,inventory")
      .order("property_id")
      .limit(10000),
  ]);
  if (inventories.error) throw Error(inventories.error.message);
  return {
    actor,
    people,
    properties,
    inventories: (inventories.data ?? []) as {
      property_id: string;
      version: number;
      inventory: KeyInventory;
    }[],
  };
}
export async function mutatePropertyKeys(
  actor: KeyActor,
  propertyId: string,
  expected: number,
  command: KeyCommand,
) {
  const [r, people, property] = await Promise.all([
    db
      .from("property_key_inventories")
      .select("version,inventory")
      .eq("property_id", propertyId)
      .maybeSingle(),
    keyPeople(),
    db.from("properties").select("id").eq("id", propertyId).eq("portfolio", "rm").maybeSingle(),
  ]);
  if (r.error) throw Error(r.error.message);
  if (property.error || !property.data) throw Error("Объект не найден");
  if ((r.data?.version ?? 0) !== expected) throw Error("Данные уже изменились. Обновите список");
  const inventory = applyKeyCommand(
    (r.data?.inventory ?? emptyKeyInventory()) as KeyInventory,
    command,
    actor,
    people,
  );
  const result = await db.rpc("save_property_key_inventory", {
    p_property: propertyId,
    p_expected: expected,
    p_inventory: inventory,
    p_actor: actor.id,
  });
  if (result.error) throw Error(result.error.message);
  return { property_id: propertyId, version: Number(result.data), inventory };
}

export type KeyWorkspace = Awaited<ReturnType<typeof loadKeyWorkspace>>;
