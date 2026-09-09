import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";

export type StaffRole = "admin" | "manager";

export type StaffMember = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  birth_date: string | null;
  photo_path: string;
  role: StaffRole;
  created_at: string;
};

export type StaffProfileInput = {
  full_name: string;
  phone: string;
  birth_date: string | null;
  photo_path: string;
};

const PROFILE_COLUMNS = "id, email, full_name, phone, birth_date, photo_path, created_at";

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function roleOf(userId: string): Promise<StaffRole> {
  const admin = await adminClient();
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as StaffRole);
  return roles.includes("admin") ? "admin" : "manager";
}

async function requireAdmin(userId: string) {
  if ((await roleOf(userId)) !== "admin") {
    throw new Error("Действие доступно только администратору");
  }
  return adminClient();
}

/** Роль и карточка текущего сотрудника. */
export const getMyAccess = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }): Promise<{ role: StaffRole; profile: StaffMember | null }> => {
    const admin = await adminClient();
    const role = await roleOf(context.userId);
    const { data } = await admin
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", context.userId)
      .maybeSingle();
    if (!data) {
      const email = context.user.email ?? "";
      await admin.from("profiles").insert({ id: context.userId, email });
      return {
        role,
        profile: {
          id: context.userId,
          email,
          full_name: "",
          phone: "",
          birth_date: null,
          photo_path: "",
          role,
          created_at: new Date().toISOString(),
        },
      };
    }
    return { role, profile: { ...(data as Omit<StaffMember, "role">), role } };
  });

/** Список сотрудников — только администратору. */
export const listStaff = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }): Promise<{ staff: StaffMember[] }> => {
    const admin = await requireAdmin(context.userId);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      admin.from("profiles").select(PROFILE_COLUMNS).order("created_at", { ascending: true }),
      admin.from("user_roles").select("user_id, role"),
    ]);
    const roleMap = new Map<string, StaffRole>();
    for (const r of roles ?? []) {
      if (r.role === "admin") roleMap.set(r.user_id, "admin");
      else if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, "manager");
    }
    return {
      staff: (profiles ?? []).map((p) => ({
        ...(p as Omit<StaffMember, "role">),
        role: roleMap.get(p.id) ?? "manager",
      })),
    };
  });

/** Создание сотрудника с доступом в RM OS. */
export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    (input: unknown) =>
      input as StaffProfileInput & { email: string; password: string; role: StaffRole },
  )
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const admin = await requireAdmin(context.userId);
    const email = data.email.trim().toLowerCase();
    if (!email) throw new Error("Укажите электронную почту");
    if ((data.password ?? "").length < 8) throw new Error("Пароль — минимум 8 символов");

    const created = await admin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Не удалось создать сотрудника");
    }
    const id = created.data.user.id;

    const { error: profileError } = await admin.from("profiles").upsert({
      id,
      email,
      full_name: data.full_name.trim(),
      phone: data.phone.trim(),
      birth_date: data.birth_date || null,
      photo_path: data.photo_path ?? "",
    });
    if (profileError) throw new Error(profileError.message);

    const { error: roleError } = await admin.from("user_roles").insert({ user_id: id, role: data.role });
    if (roleError) throw new Error(roleError.message);

    return { id };
  });

/** Изменение карточки: свою может править каждый, чужую — администратор. */
export const saveStaffProfile = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as StaffProfileInput & { id: string })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const admin = await adminClient();
    if (data.id !== context.userId && (await roleOf(context.userId)) !== "admin") {
      throw new Error("Можно менять только свою карточку");
    }
    const { error } = await admin
      .from("profiles")
      .update({
        full_name: data.full_name.trim(),
        phone: data.phone.trim(),
        birth_date: data.birth_date || null,
        photo_path: data.photo_path ?? "",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Смена роли сотрудника. */
export const setStaffRole = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { id: string; role: StaffRole })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const admin = await requireAdmin(context.userId);
    if (data.id === context.userId && data.role !== "admin") {
      throw new Error("Нельзя снять с себя права администратора");
    }
    await admin.from("user_roles").delete().eq("user_id", data.id);
    const { error } = await admin.from("user_roles").insert({ user_id: data.id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Смена пароля сотрудника администратором. */
export const setStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { id: string; password: string })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const admin = await requireAdmin(context.userId);
    if ((data.password ?? "").length < 8) throw new Error("Пароль — минимум 8 символов");
    const { error } = await admin.auth.admin.updateUserById(data.id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Удаление сотрудника вместе с доступом. */
export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const admin = await requireAdmin(context.userId);
    if (data.id === context.userId) throw new Error("Нельзя удалить самого себя");
    await admin.from("user_roles").delete().eq("user_id", data.id);
    await admin.from("profiles").delete().eq("id", data.id);
    const { error } = await admin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
