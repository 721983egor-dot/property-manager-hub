import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";
import type { HotelRoomCategory, Owner, PropertyOwnerLink } from "@/lib/hotel";
import { N11_ADDRESS, asPortfolios, type Portfolio } from "@/lib/portfolios";

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function roleOf(userId: string) {
  const admin = await adminClient();
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as string);
  if (roles.includes("admin")) return "admin" as const;
  if (roles.includes("manager")) return "manager" as const;
  if (roles.includes("owner")) return "owner" as const;
  return null;
}

async function requireStaff(userId: string) {
  const role = await roleOf(userId);
  if (role !== "admin" && role !== "manager") {
    throw new Error("Нет доступа к управлению апарт-отелем");
  }
  return adminClient();
}

async function requireAdmin(userId: string) {
  if ((await roleOf(userId)) !== "admin") {
    throw new Error("Действие доступно только администратору");
  }
  return adminClient();
}

export const listHotelCategories = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }): Promise<HotelRoomCategory[]> => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("hotel_room_categories")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as HotelRoomCategory[];
  });

export const saveHotelCategory = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    (input: unknown) =>
      input as {
        id?: string | null;
        code: string;
        name: string;
        description: string;
        guests: number;
        area: number | null;
        price_night: number | null;
        sort_order: number;
        bnovo_room_type_id?: string | null;
      },
  )
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const admin = await requireAdmin(context.userId);
    const row = {
      code: data.code.trim().toLowerCase(),
      name: data.name.trim(),
      description: data.description.trim(),
      guests: data.guests || 2,
      area: data.area,
      price_night: data.price_night,
      sort_order: data.sort_order,
      bnovo_room_type_id: data.bnovo_room_type_id?.trim() || null,
    };
    if (!row.code || !row.name) throw new Error("Укажите код и название категории");
    if (data.id) {
      const { error } = await admin.from("hotel_room_categories").update(row as never).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await admin
      .from("hotel_room_categories")
      .insert(row as never)
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Не удалось сохранить категорию");
    return { id: (created as { id: string }).id };
  });

export const deleteHotelCategory = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const admin = await requireAdmin(context.userId);
    const { error } = await admin.from("hotel_room_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type HotelRoomInput = {
  id?: string | null;
  title: string;
  internal_name: string;
  room_category_id: string | null;
  bnovo_room_id: string;
  price_night: number | null;
  guests_max: number | null;
  floor: number | null;
  area: number | null;
  status: string;
  comment: string;
};

export const saveHotelRoom = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as HotelRoomInput)
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const admin = await requireAdmin(context.userId);
    const name = data.internal_name.trim() || data.title.trim();
    if (!name) throw new Error("Укажите номер комнаты");
    const row = {
      title: data.title.trim() || `N-11 ${name}`,
      internal_name: name,
      type: "aparts" as const,
      portfolio: "n11" as const,
      published: false,
      service_type: "management" as const,
      address: N11_ADDRESS,
      complex_name: "N-11 Residence",
      room_category_id: data.room_category_id,
      bnovo_room_id: data.bnovo_room_id.trim() || null,
      price_night: data.price_night,
      guests_max: data.guests_max,
      floor: data.floor,
      area: data.area,
      status: data.status || "free",
      availability_note: data.comment.trim(),
      rooms: 1,
      bathrooms: 1,
    };
    if (data.id) {
      const { error } = await admin.from("properties").update(row as never).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await admin
      .from("properties")
      .insert(row as never)
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Не удалось сохранить номер");
    return { id: (created as { id: string }).id };
  });

export const deleteHotelRoom = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const admin = await requireAdmin(context.userId);
    const { count, error: countError } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("property_id", data.id);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) {
      throw new Error("У номера есть бронирования — сначала разберите их в календаре");
    }
    await admin.from("property_owners").delete().eq("property_id", data.id);
    const { error } = await admin.from("properties").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOwners = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }): Promise<(Owner & { rooms: PropertyOwnerLink[] })[]> => {
    const admin = await requireStaff(context.userId);
    const [{ data: owners, error }, { data: links, error: linkError }] = await Promise.all([
      admin.from("owners").select("*").order("full_name", { ascending: true }),
      admin.from("property_owners").select("*"),
    ]);
    if (error) throw new Error(error.message);
    if (linkError) throw new Error(linkError.message);
    const byOwner = new Map<string, PropertyOwnerLink[]>();
    for (const link of (links ?? []) as PropertyOwnerLink[]) {
      const list = byOwner.get(link.owner_id) ?? [];
      list.push(link);
      byOwner.set(link.owner_id, list);
    }
    return ((owners ?? []) as Owner[]).map((owner) => ({
      ...owner,
      rooms: byOwner.get(owner.id) ?? [],
    }));
  });

export const saveOwner = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    (input: unknown) =>
      input as {
        id?: string | null;
        full_name: string;
        phone: string;
        email: string;
        comment: string;
        room_ids: string[];
        shares: Record<string, number | null>;
      },
  )
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const admin = await requireAdmin(context.userId);
    if (!data.full_name.trim()) throw new Error("Укажите ФИО собственника");
    const row = {
      full_name: data.full_name.trim(),
      phone: data.phone.trim(),
      email: data.email.trim().toLowerCase(),
      comment: data.comment.trim(),
    };
    let ownerId = data.id ?? "";
    if (ownerId) {
      const { error } = await admin.from("owners").update(row as never).eq("id", ownerId);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await admin
        .from("owners")
        .insert(row as never)
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message ?? "Не удалось сохранить собственника");
      ownerId = (created as { id: string }).id;
    }
    await admin.from("property_owners").delete().eq("owner_id", ownerId);
    const roomIds = [...new Set(data.room_ids.filter(Boolean))];
    if (roomIds.length > 0) {
      const { error } = await admin.from("property_owners").insert(
        roomIds.map((propertyId) => ({
          owner_id: ownerId,
          property_id: propertyId,
          share_percent: data.shares[propertyId] ?? null,
        })) as never,
      );
      if (error) throw new Error(error.message);
    }
    return { id: ownerId };
  });

export const deleteOwner = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const admin = await requireAdmin(context.userId);
    const { data: owner } = await admin.from("owners").select("user_id").eq("id", data.id).maybeSingle();
    await admin.from("property_owners").delete().eq("owner_id", data.id);
    const { error } = await admin.from("owners").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    const userId = (owner as { user_id?: string | null } | null)?.user_id;
    if (userId) {
      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    return { ok: true };
  });

export const grantOwnerAccess = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { ownerId: string; email: string; password: string })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const admin = await requireAdmin(context.userId);
    const email = data.email.trim().toLowerCase();
    if (!email) throw new Error("Укажите почту для входа");
    if ((data.password ?? "").length < 8) throw new Error("Пароль — минимум 8 символов");
    const { data: owner, error } = await admin
      .from("owners")
      .select("id, user_id, full_name")
      .eq("id", data.ownerId)
      .maybeSingle();
    if (error || !owner) throw new Error(error?.message ?? "Собственник не найден");
    let userId = (owner as { user_id?: string | null }).user_id ?? "";
    if (userId) {
      const updated = await admin.auth.admin.updateUserById(userId, { email, password: data.password });
      if (updated.error) throw new Error(updated.error.message);
    } else {
      const created = await admin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        throw new Error(created.error?.message ?? "Не удалось создать доступ");
      }
      userId = created.data.user.id;
    }
    await admin.from("profiles").upsert({
      id: userId,
      email,
      full_name: (owner as { full_name: string }).full_name,
    } as never);
    await admin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleError } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: "owner" as never });
    if (roleError) throw new Error(roleError.message);
    const { error: ownerError } = await admin
      .from("owners")
      .update({ user_id: userId, email } as never)
      .eq("id", data.ownerId);
    if (ownerError) throw new Error(ownerError.message);
    return { ok: true };
  });

export async function addClientPortfolio(clientId: string, portfolio: Portfolio) {
  const admin = await adminClient();
  const { data } = await admin.from("clients").select("portfolios").eq("id", clientId).maybeSingle();
  const current = asPortfolios((data as { portfolios?: unknown } | null)?.portfolios);
  if (current.includes(portfolio)) return;
  const { error } = await admin
    .from("clients")
    .update({ portfolios: [...current, portfolio] } as never)
    .eq("id", clientId);
  if (error) throw new Error(error.message);
}
