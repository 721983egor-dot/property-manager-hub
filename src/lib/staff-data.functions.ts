import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";

async function requireStaff(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "manager"])
    .limit(1);

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("У сотрудника нет доступа к RM OS");
  return supabaseAdmin;
}

const BOOKING_COLUMNS =
  "id, property_id, client_id, start_date, end_date, price_type, price_month, payment_day, deposit, source, status, comment, clients(id, full_name, phone), booking_price_periods(id, start_date, end_date, price_month)";

/** Бронирования календаря с клиентами и периодами цены для всех сотрудников. */
export const listStaffBookings = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { from: string; to: string })
  .handler(async ({ context, data: input }) => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .lte("start_date", input.to)
      .gte("end_date", input.from)
      .order("start_date", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Бронирования конкретного клиента для карточки клиента. */
export const listStaffClientBookings = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { clientId: string })
  .handler(async ({ context, data: input }) => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .eq("client_id", input.clientId)
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Текущее бронирование объекта для внутренней карточки RM OS. */
export const getStaffCurrentBooking = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { propertyId: string; todayIso: string })
  .handler(async ({ context, data: input }) => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .eq("property_id", input.propertyId)
      .neq("status", "cancelled")
      .lte("start_date", input.todayIso)
      .gte("end_date", input.todayIso)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

/** Комплексы для внутренних экранов RM OS. */
export const listStaffComplexes = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("complexes")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getStaffComplex = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ context, data: input }) => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("complexes")
      .select("*")
      .eq("id", input.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

/** Объекты для вошедших сотрудников. Изменения по-прежнему контролируются RLS. */
export const listStaffProperties = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("properties")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Карточка объекта для сотрудников RM OS. Без входа недоступна. */
export const getStaffProperty = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ context, data: input }) => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("properties")
      .select("*")
      .eq("id", input.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const CLIENT_COLUMNS = "id, full_name, phone, comment, blacklisted, blacklist_reason";

/** Клиенты для вошедших сотрудников. Менеджер получает только чтение. */
export const listStaffClients = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("clients")
      .select(CLIENT_COLUMNS)
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getStaffClient = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ context, data: input }) => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("id", input.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });
