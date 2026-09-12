import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";

const DEFAULT_STAGES = [
  { name: "Новая", color: "#0ea5e9", position: 0, kind: "open" },
  { name: "Показ", color: "#6366f1", position: 1, kind: "open" },
  { name: "Переговоры", color: "#f59e0b", position: 2, kind: "open" },
  { name: "Договор", color: "#8b5cf6", position: 3, kind: "open" },
  { name: "Успешно", color: "#10b981", position: 4, kind: "won" },
  { name: "Отказ", color: "#ef4444", position: 5, kind: "lost" },
];

/** Восстанавливает стадии через сервер после обязательной проверки роли администратора. */
export const createDefaultDealStages = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }): Promise<{ count: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    if (roleError) throw new Error(`Не удалось проверить права: ${roleError.message}`);
    if (!(roles ?? []).some((entry) => entry.role === "admin")) {
      throw new Error("Создавать стадии может только администратор");
    }

    const { data: existing, error: readError } = await supabaseAdmin
      .from("deal_stages")
      .select("id")
      .limit(1);
    if (readError) {
      throw new Error(
        readError.message.includes("does not exist") || readError.code === "42P01"
          ? "Таблицы стадий нет в базе. Нужно применить миграцию CRM сделок."
          : `Не удалось проверить стадии: ${readError.message}`,
      );
    }
    if ((existing ?? []).length > 0) return { count: 0 };

    const { error: insertError } = await supabaseAdmin.from("deal_stages").insert(DEFAULT_STAGES);
    if (insertError) throw new Error(`Не удалось создать стадии: ${insertError.message}`);
    return { count: DEFAULT_STAGES.length };
  });