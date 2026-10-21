import { supabase } from "@/integrations/supabase/client";
import { mapPayment } from "./finance";
import {
  buildFinanceTasks,
  type FinanceTaskSources,
  type FinanceTaskBooking,
} from "./finance-tasks-model";
import type { OwnerSettlement } from "./finance-owner-settlements";
/** The browser uses existing finance RLS; Assistant callers must also check administrator access. */
export async function loadFinanceTasks(db: typeof supabase = supabase) {
  async function pages(
    run: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  ) {
    const result: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 500) {
      const r = await run(from, from + 499);
      if (r.error) throw new Error(r.error.message);
      result.push(...((r.data ?? []) as Record<string, unknown>[]));
      if ((r.data?.length ?? 0) < 500) return result;
    }
  }
  const [raw, bs, settings, sts, parties, articles, admins] = await Promise.all([
    pages((a, b) => db.from("payments").select("*").order("id").range(a, b)),
    pages((a, b) =>
      db
        .from("bookings")
        .select(
          "id,property_id,status,clients(full_name),properties(internal_name,title,portfolio)",
        )
        .order("id")
        .range(a, b),
    ),
    pages((a, b) =>
      db
        .from("finance_object_settings")
        .select("property_id,owner_counterparty_id,payout_day")
        .order("property_id")
        .range(a, b),
    ),
    pages((a, b) =>
      db
        .from("finance_owner_settlements")
        .select(
          "id,property_id,period,obligation_id,automatic,booking_id,gross_amount,expense_amount",
        )
        .order("id")
        .range(a, b),
    ),
    pages((a, b) => db.from("finance_counterparties").select("id,name").order("id").range(a, b)),
    pages((a, b) => db.from("finance_articles").select("id,name,code").order("id").range(a, b)),
    db.from("user_roles").select("user_id").eq("role", "admin").order("user_id").limit(1),
  ]);
  if (admins.error) throw admins.error;
  const join = (x: unknown) => ((Array.isArray(x) ? x[0] : x) ?? {}) as Record<string, unknown>;
  const bookings: FinanceTaskBooking[] = bs
    .filter((b) => join(b["properties"])["portfolio"] === "rm")
    .map((b) => ({
      id: String(b["id"]),
      property_id: String(b["property_id"]),
      status: String(b["status"]),
      clientName: String(join(b["clients"])["full_name"] ?? "Клиент"),
      propertyName: String(
        join(b["properties"])["internal_name"] ?? join(b["properties"])["title"] ?? "Объект",
      ),
    }));
  const sources: FinanceTaskSources = {
    payments: raw.map(mapPayment),
    bookings,
    settings: settings as unknown as FinanceTaskSources["settings"],
    settlements: sts as unknown as OwnerSettlement[],
    parties: parties as unknown as FinanceTaskSources["parties"],
    articles: articles as unknown as FinanceTaskSources["articles"],
    assigneeId: admins.data?.[0]?.user_id ?? null,
  };
  return { tasks: buildFinanceTasks(sources), sources };
}
export async function fetchFinanceTasks() {
  return (await loadFinanceTasks()).tasks;
}
