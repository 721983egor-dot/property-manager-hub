import { supabase } from "@/integrations/supabase/client";
import {
  isHouseType,
  type Property,
  type PropertyType,
} from "@/lib/properties";

/** Имя типа задач обслуживания — совпадает с seed в миграции. */
export const MAINTENANCE_TASK_TYPE_NAME = "Обслуживание";

export type MaintenanceServiceItem = {
  id: string;
  name: string;
  position: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type MaintenanceServiceInput = {
  name: string;
  position?: number;
  active?: boolean;
};

/** Дом/вилла на управлении — попадает в блок «Обслуживание». */
export function isMaintenanceProperty(property: Pick<Property, "type" | "service_type" | "portfolio">) {
  if (property.portfolio === "n11") return false;
  if (property.service_type !== "management") return false;
  return isHouseType(property.type as PropertyType);
}

/** Объект виден в календаре аренды только при явном for_rent. */
export function isListedForRent(property: Pick<Property, "for_rent">) {
  return property.for_rent !== false;
}

export function filterMaintenanceProperties(properties: Property[], opts?: { includeArchived?: boolean }) {
  return properties.filter((property) => {
    if (!isMaintenanceProperty(property)) return false;
    if (!opts?.includeArchived && property.status === "archived") return false;
    return true;
  });
}

export async function fetchMaintenanceServiceItems(opts?: { activeOnly?: boolean }): Promise<MaintenanceServiceItem[]> {
  let query = supabase
    .from("maintenance_service_items")
    .select("id, name, position, active, created_at, updated_at")
    .order("position", { ascending: true });
  if (opts?.activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MaintenanceServiceItem[];
}

export async function saveMaintenanceServiceItem(
  id: string | null,
  input: MaintenanceServiceInput,
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Укажите название услуги");
  if (id) {
    const patch: Record<string, unknown> = { name };
    if (input.position != null) patch.position = input.position;
    if (input.active != null) patch.active = input.active;
    const { error } = await supabase
      .from("maintenance_service_items")
      .update(patch as never)
      .eq("id", id);
    if (error) throw error;
    return id;
  }
  const { count } = await supabase
    .from("maintenance_service_items")
    .select("id", { count: "exact", head: true });
  const { data, error } = await supabase
    .from("maintenance_service_items")
    .insert({
      name,
      position: input.position ?? count ?? 0,
      active: input.active ?? true,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteMaintenanceServiceItem(id: string) {
  const { error } = await supabase.from("maintenance_service_items").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchPropertyServiceItemIds(propertyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("property_maintenance_services")
    .select("service_item_id")
    .eq("property_id", propertyId);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { service_item_id: string }).service_item_id);
}

export async function setPropertyServiceItems(propertyId: string, serviceItemIds: string[]) {
  const { error: delError } = await supabase
    .from("property_maintenance_services")
    .delete()
    .eq("property_id", propertyId);
  if (delError) throw delError;
  const unique = Array.from(new Set(serviceItemIds.filter(Boolean)));
  if (!unique.length) return;
  const { error } = await supabase.from("property_maintenance_services").insert(
    unique.map((service_item_id) => ({ property_id: propertyId, service_item_id })) as never,
  );
  if (error) throw error;
}

export async function fetchMaintenanceTaskTypeId(): Promise<string | null> {
  const { data, error } = await supabase
    .from("task_types")
    .select("id, name")
    .ilike("name", MAINTENANCE_TASK_TYPE_NAME)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export function isMaintenanceTaskType(
  type: { id: string; name: string } | null | undefined,
  maintenanceTypeId: string | null,
) {
  if (!type) return false;
  if (maintenanceTypeId && type.id === maintenanceTypeId) return true;
  return type.name.trim().toLowerCase() === MAINTENANCE_TASK_TYPE_NAME.toLowerCase();
}
