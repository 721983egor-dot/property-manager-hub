import { effectivePaymentStatus } from "./finance-payment-status.ts";
import { ownerCashPayments } from "./finance-company-model.ts";
import type { Payment } from "./finance.ts";
import type { StaffTask } from "./tasks.ts";
import type { OwnerSettlement } from "./finance-owner-settlements.ts";
export const FINANCE_TASKS_START = "2026-10-21";
export type FinanceTaskBooking = {
  id: string;
  property_id: string;
  status: string;
  clientName: string;
  propertyName: string;
};
export type FinanceTaskInfo = {
  kind: "receipt" | "owner_payout" | "payment";
  direction?: "in" | "out";
  bookingId: string | null;
  paymentId: string | null;
  period: string;
  amount: number;
  remaining: number;
  articleId: string | null;
  articleName: string;
  partyName: string;
  obligationId: string | null;
  payableNow: number;
  account: string;
  contractDate?: string;
  receipts?: Payment["cash_receipts"];
};
export type FinanceTask = StaffTask & { finance: FinanceTaskInfo };
export type FinanceTaskSources = {
  payments: Payment[];
  bookings: FinanceTaskBooking[];
  settings: {
    property_id: string;
    owner_counterparty_id?: string | null;
    payout_day?: number | null;
  }[];
  settlements: OwnerSettlement[];
  parties: { id: string; name: string }[];
  articles: { id: string; name: string; code: string | null }[];
  cancelledBookingIds?: string[];
  assigneeId: string | null;
};
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const paid = (p: Payment) =>
  money(p.status === "paid" ? (p.paid_amount ?? p.amount) : (p.paid_amount ?? 0));
const relevant = (p: Payment) =>
  [p.planned_date, p.paid_at ?? "", p.created_at ?? "", p.updated_at ?? ""].some(
    (d) => d.slice(0, 10) >= FINANCE_TASKS_START,
  );
function base(
  id: string,
  b: FinanceTaskBooking,
  date: string,
  done: boolean,
  meta: FinanceTaskInfo,
  s: FinanceTaskSources,
  p?: Payment,
): FinanceTask {
  const title =
    meta.kind === "receipt"
      ? `Получить оплату · ${b.clientName}`
      : meta.kind === "owner_payout"
        ? `Выплатить собственнику · ${meta.partyName}`
        : `${meta.direction === "in" ? "Получить" : "Оплатить"} · ${meta.articleName}${meta.partyName === "Без контрагента" ? "" : " · " + meta.partyName}`;
  const amount = (done ? meta.amount : meta.remaining).toLocaleString("ru-RU") + " ₽";
  return {
    id,
    title,
    description: `${b.propertyName}\n${meta.articleName} · ${amount}\n${meta.partyName}\nСвязано с платежом брони. Ожидаемую дату остатка можно перенести отдельно от срока договора.`,
    status: done ? "done" : "open",
    due_date: date,
    due_start: "",
    due_end: "",
    assignee_id: s.assigneeId,
    created_by: null,
    property_id: b.property_id || null,
    deal_id: p?.deal_id ?? null,
    task_type_id: null,
    maintenance_service_item_id: null,
    is_recurring: false,
    recurrence: "monthly",
    recurrence_until: null,
    position: 0,
    completed_at: done ? `${p?.paid_at ?? date}T12:00:00Z` : null,
    created_at: p?.created_at ?? "",
    updated_at: p?.updated_at ?? "",
    items: [],
    finance: meta,
  };
}
/** Tasks are a view of the ledger, never independent copies of dates or amounts. */
export function buildFinanceTasks(s: FinanceTaskSources): FinanceTask[] {
  const bookings = new Map(s.bookings.map((b) => [b.id, b]));
  const result: FinanceTask[] = [];
  for (const p of s.payments) {
    const b = bookings.get(p.booking_id ?? "");
    if (
      !b ||
      p.direction !== "in" ||
      (!["rent", "utilities", "deposit"].includes(p.rental_component ?? "") &&
        p.kind !== "deposit_in") ||
      !relevant(p)
    )
      continue;
    const remaining = money(Math.max(0, p.amount - paid(p)));
    if (b.status === "cancelled" && remaining > 0) continue;
    const article =
      s.articles.find((a) => a.id === p.article_id) ??
      s.articles.find(
        (a) =>
          a.code ===
          (p.rental_component === "rent"
            ? "rent_in"
            : p.rental_component === "utilities"
              ? "utilities_in"
              : "deposit_in"),
      );
    const meta: FinanceTaskInfo = {
      kind: "receipt",
      direction: "in",
      bookingId: b.id,
      paymentId: p.id,
      period: p.rental_period ?? p.planned_date.slice(0, 7) + "-01",
      amount: p.amount,
      remaining,
      articleId: article?.id ?? null,
      articleName:
        article?.name ??
        (p.rental_component === "rent"
          ? "Аренда"
          : p.rental_component === "utilities"
            ? "Коммунальные платежи"
            : "Страховой депозит"),
      partyName: b.clientName,
      obligationId: null,
      payableNow: remaining,
      account: p.account,
      contractDate: p.planned_date,
      receipts: p.cash_receipts,
    };
    result.push(
      base(
        `finance:receipt:${p.id}`,
        b,
        p.task_expected_date || p.planned_date,
        remaining <= 0,
        meta,
        s,
        p,
      ),
    );
  }
  const projected = ownerCashPayments(s.payments, s.settings, s.settlements);
  const groups = new Map<
    string,
    { booking: FinanceTaskBooking; rows: Payment[]; period: string }
  >();
  for (const p of projected) {
    if (p.kind !== "owner_payout") continue;
    const period = p.rental_period ?? p.planned_date.slice(0, 7) + "-01";
    const st = s.settlements.find((x) => x.obligation_id === p.obligation_id && !!p.obligation_id);
    let bid = p.booking_id ?? st?.booking_id;
    if (!bid && p.id.startsWith("owner-forecast:")) {
      const tail = p.id.split(":").at(-1)!;
      if (bookings.has(tail)) bid = tail;
    }
    if (!bid) {
      const candidates = [
        ...new Set(
          s.payments
            .filter(
              (x) =>
                x.property_id === p.property_id &&
                x.rental_period === period &&
                x.rental_component === "rent" &&
                x.booking_id,
            )
            .map((x) => x.booking_id!),
        ),
      ];
      if (candidates.length === 1) bid = candidates[0];
    }
    const b = bookings.get(bid ?? "");
    if (
      !b ||
      (!relevant(p) &&
        !s.payments.some(
          (x) =>
            x.booking_id === b.id &&
            x.rental_period === period &&
            x.direction === "in" &&
            relevant(x),
        )) ||
      (b.status === "cancelled" && !p.obligation_id)
    )
      continue;
    const key = b.id + ":" + period;
    const group = groups.get(key) ?? { booking: b, rows: [], period };
    group.rows.push(p);
    groups.set(key, group);
  }
  for (const [key, g] of groups) {
    const rows = g.rows.sort(
      (a, b) => a.planned_date.localeCompare(b.planned_date) || a.id.localeCompare(b.id),
    );
    const plans = rows.filter((p) => p.rental_component === "owner_plan");
    const remaining = money(plans.reduce((n, p) => n + p.amount, 0));
    const actual = money(
      rows.filter((p) => p.rental_component !== "owner_plan").reduce((n, p) => n + paid(p), 0),
    );
    if (remaining <= 0 && actual <= 0) continue;
    const first = plans[0] ?? rows[0]!;
    const physical = plans.find((p) => p.obligation_id);
    const article = s.articles.find((a) => a.code === "owner_payout");
    const owner =
      s.parties.find((c) => c.id === first.counterparty_id)?.name ||
      first.counterparty_name ||
      "Собственник";
    const meta: FinanceTaskInfo = {
      kind: "owner_payout",
      direction: "out",
      bookingId: g.booking.id,
      paymentId: physical?.id ?? null,
      period: g.period,
      amount: money(remaining + actual),
      remaining,
      articleId: article?.id ?? null,
      articleName: article?.name ?? "Выплата собственнику",
      partyName: owner,
      obligationId:
        physical?.obligation_id ?? rows.find((p) => p.obligation_id)?.obligation_id ?? null,
      payableNow: money(Math.min(remaining, physical?.amount ?? 0)),
      account: first.account,
      contractDate: first.contract_date || first.planned_date,
    };
    result.push(
      base("finance:owner:" + key, g.booking, first.planned_date, remaining <= 0, meta, s, first),
    );
  }
  // Booking receipts and owner settlement groups are already represented above.
  const handled = new Set(result.map((t) => t.finance.paymentId).filter(Boolean));
  const ownerObligations = new Set(
    result
      .filter((t) => t.finance.kind === "owner_payout")
      .map((t) => t.finance.obligationId)
      .filter(Boolean),
  );
  const ownerGroups = new Map<string, Payment[]>();
  for (const p of s.payments) {
    if (p.kind === "owner_payout" && p.obligation_id && !ownerObligations.has(p.obligation_id))
      ownerGroups.set(p.obligation_id, [...(ownerGroups.get(p.obligation_id) ?? []), p]);
  }
  for (const [obligation, rows] of ownerGroups) {
    const plan = rows.find((p) => p.rental_component === "owner_plan");
    if (plan?.owner_payout_on_request || !rows.some(relevant)) continue;
    const remaining = money(plan?.amount ?? 0);
    const actual = money(
      rows.filter((p) => p.rental_component !== "owner_plan").reduce((n, p) => n + paid(p), 0),
    );
    if (remaining <= 0 && actual <= 0) continue;
    const first = plan ?? rows[0]!;
    const b = bookings.get(first.booking_id ?? "");
    if (
      b?.status === "cancelled" ||
      (first.booking_id && s.cancelledBookingIds?.includes(first.booking_id))
    )
      continue;
    const party =
      s.parties.find((c) => c.id === first.counterparty_id)?.name ||
      first.counterparty_name ||
      "Собственник";
    const article =
      s.articles.find((a) => a.id === first.article_id) ??
      s.articles.find((a) => a.code === "owner_payout");
    const context = b ?? {
      id: "",
      property_id: first.property_id || "",
      status: "active",
      clientName: party,
      propertyName: first.property?.internal_name || first.property?.title || "Без объекта",
    };
    result.push(
      base(
        `finance:obligation:${obligation}`,
        context,
        first.task_expected_date || first.planned_date,
        remaining <= 0,
        {
          kind: "owner_payout",
          direction: "out",
          bookingId: b?.id ?? null,
          paymentId: plan?.id ?? null,
          period: first.rental_period || first.planned_date.slice(0, 7) + "-01",
          amount: money(remaining + actual),
          remaining,
          articleId: article?.id ?? null,
          articleName: article?.name || "Выплата собственнику",
          partyName: party,
          obligationId: obligation,
          payableNow: remaining,
          account: first.account,
          contractDate: first.planned_date,
        },
        s,
        first,
      ),
    );
  }
  for (const p of s.payments) {
    if (
      handled.has(p.id) ||
      (p.kind === "owner_payout" && p.obligation_id) ||
      p.rental_component === "owner_plan" ||
      (p.owner_payout_on_request && p.kind === "owner_payout")
    )
      continue;
    const b = bookings.get(p.booking_id ?? "");
    if ((p.booking_id || p.rental_schedule || p.rental_installment_id) && !b) continue;
    if (
      b?.status === "cancelled" ||
      (p.booking_id && s.cancelledBookingIds?.includes(p.booking_id))
    )
      continue;
    // Explicit pending operations persist after their due date. Legacy automatic facts stay historical.
    if (effectivePaymentStatus(p) === "paid" && p.status !== "paid") continue;
    if (p.status === "paid" && !p.cash_receipts?.length && !p.requires_confirmation) continue;
    const remaining = money(Math.max(0, p.amount - paid(p)));
    const party =
      s.parties.find((c) => c.id === p.counterparty_id)?.name ||
      p.counterparty_name ||
      p.client?.full_name ||
      b?.clientName ||
      "Без контрагента";
    const article = s.articles.find((a) => a.id === p.article_id);
    const context = b ?? {
      id: "",
      property_id: p.property_id || "",
      status: "active",
      clientName: party,
      propertyName: p.property?.internal_name || p.property?.title || "Без объекта",
    };
    const task = base(
      `finance:payment:${p.id}`,
      context,
      p.task_expected_date || p.planned_date,
      remaining <= 0,
      {
        kind: "payment",
        direction: p.direction,
        bookingId: p.booking_id,
        paymentId: p.id,
        period: p.rental_period || p.planned_date.slice(0, 7) + "-01",
        amount: p.amount,
        remaining,
        articleId: p.article_id,
        articleName:
          article?.name || p.article?.name || (p.direction === "in" ? "Приход" : "Расход"),
        partyName: party,
        obligationId: p.obligation_id,
        payableNow: remaining,
        account: p.account,
        contractDate: p.planned_date,
        receipts: p.cash_receipts,
      },
      s,
      p,
    );
    task.description = `${context.propertyName}\n${task.finance.articleName} · ${party}\n${p.comment || "Плановый платёж из финансов"}\nИзменение ожидания относится только к этой операции.`;
    result.push(task);
  }
  return result.sort(
    (a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "") || a.id.localeCompare(b.id),
  );
}
