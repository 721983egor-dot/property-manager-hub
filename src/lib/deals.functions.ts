import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";
import type { DealPipeline } from "@/lib/deals";

const RENTAL_STAGES = [
  { name: "Новая", color: "#0ea5e9", position: 0, kind: "open", pipeline: "rental" },
  { name: "Показ", color: "#6366f1", position: 1, kind: "open", pipeline: "rental" },
  { name: "Переговоры", color: "#f59e0b", position: 2, kind: "open", pipeline: "rental" },
  { name: "Договор", color: "#8b5cf6", position: 3, kind: "open", pipeline: "rental" },
  { name: "Успешно", color: "#10b981", position: 4, kind: "won", pipeline: "rental" },
  { name: "Отказ", color: "#ef4444", position: 5, kind: "lost", pipeline: "rental" },
];

const INTAKE_STAGES = [
  { name: "Заявка", color: "#0ea5e9", position: 0, kind: "open", pipeline: "intake" },
  { name: "Осмотр", color: "#6366f1", position: 1, kind: "open", pipeline: "intake" },
  { name: "Документы", color: "#f59e0b", position: 2, kind: "open", pipeline: "intake" },
  { name: "На площадках", color: "#8b5cf6", position: 3, kind: "open", pipeline: "intake" },
  { name: "В работе", color: "#10b981", position: 4, kind: "won", pipeline: "intake" },
  { name: "Отказ", color: "#ef4444", position: 5, kind: "lost", pipeline: "intake" },
];

/** Восстанавливает стадии воронки после проверки роли администратора. */
export const createDefaultDealStages = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => {
    const pipeline =
      input && typeof input === "object" && "pipeline" in input
        ? (input as { pipeline?: string }).pipeline
        : "rental";
    return { pipeline: (pipeline === "intake" ? "intake" : "rental") as DealPipeline };
  })
  .handler(async ({ context, data }): Promise<{ count: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    if (roleError) throw new Error(`Не удалось проверить права: ${roleError.message}`);
    if (!(roles ?? []).some((entry) => entry.role === "admin")) {
      throw new Error("Создавать стадии может только администратор");
    }

    const pipeline = data.pipeline;
    const defaults = pipeline === "intake" ? INTAKE_STAGES : RENTAL_STAGES;

    const withPipeline = await supabaseAdmin
      .from("deal_stages")
      .select("id")
      .eq("pipeline", pipeline)
      .limit(1);

    if (!withPipeline.error) {
      if ((withPipeline.data ?? []).length > 0) return { count: 0 };
      const { error: insertError } = await supabaseAdmin.from("deal_stages").insert(defaults);
      if (insertError) throw new Error(`Не удалось создать стадии: ${insertError.message}`);
      return { count: defaults.length };
    }

    if (!/pipeline|schema cache|could not find/i.test(withPipeline.error.message)) {
      throw new Error(
        withPipeline.error.message.includes("does not exist") || withPipeline.error.code === "42P01"
          ? "Таблицы стадий нет в базе. Нужно применить миграцию CRM сделок."
          : `Не удалось проверить стадии: ${withPipeline.error.message}`,
      );
    }

    if (pipeline !== "rental") {
      throw new Error("Сначала примените миграцию воронки «Новые объекты»");
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

    const legacy = RENTAL_STAGES.map(({ pipeline: _p, ...rest }) => rest);
    const { error: insertError } = await supabaseAdmin.from("deal_stages").insert(legacy);
    if (insertError) throw new Error(`Не удалось создать стадии: ${insertError.message}`);
    return { count: legacy.length };
  });
