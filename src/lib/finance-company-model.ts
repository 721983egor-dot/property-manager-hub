import type { Payment } from "./finance.ts";
import { financeToday, paymentFactAmount } from "./finance-payment-status.ts";
import { paymentCashDate } from "./finance-calendar-model.ts";
const money = (n: number) => Math.round(n * 100) / 100;
export const paymentPeriod = (p: Payment) =>
  (p.rental_period ?? p.management_period ?? p.planned_date).slice(0, 7);

/** Earned from received rent for the rental period, independently of owner transfers.
 * Utilities are reimbursements, never rental income. Unknown fees stay unallocated. */
export function ownerRentalIncome(
  rows: Payment[],
  month: string,
  propertyId?: string,
  today = financeToday(),
) {
  let rent = 0,
    commission = 0,
    utilities = 0,
    unallocatedRent = 0;
  for (const p of rows) {
    if (
      p.direction !== "in" ||
      paymentPeriod(p) !== month ||
      (propertyId && p.property_id !== propertyId)
    )
      continue;
    const fact = paymentFactAmount(p, today);
    if (fact <= 0) continue;
    if (p.rental_component === "utilities") utilities += fact;
    else if (p.rental_component === "rent") {
      if (p.company_fee == null || p.amount <= 0) unallocatedRent += fact;
      else {
        rent += fact;
        commission += (fact * p.company_fee) / p.amount;
      }
    } else if (p.kind === "rent_in") unallocatedRent += fact;
  }
  return {
    rent: money(rent),
    commission: money(commission),
    netRent: money(rent - commission),
    utilities: money(utilities),
    total: money(rent - commission + utilities),
    unallocatedRent: money(unallocatedRent),
  };
}
/** Legacy monthly commission is already contained in a linked gross receipt. Upfront fees remain separate. */
export function bankPayments(rows: Payment[]) {
  const gross = new Set(
    rows
      .filter((p) => p.rental_component === "rent")
      .map((p) => `${p.booking_id}:${paymentPeriod(p)}`),
  );
  return rows.filter(
    (p) =>
      !(p.rental_component === "owner_plan" && p.owner_payout_on_request) &&
      !(
        p.booking_id &&
        (p.management_period || p.crm_charge?.startsWith("month:")) &&
        gross.has(`${p.booking_id}:${paymentPeriod(p)}`)
      ),
  );
}
export function companyPayments(rows: Payment[]): Payment[] {
  return bankPayments(rows).flatMap((p) => {
    if (p.expense_bearer === "owner") return [];
    if (p.rental_component === "rent") {
      if (p.company_fee == null || p.company_fee <= 0) return [];
      const ratio = p.company_fee / p.amount;
      return [
        {
          ...p,
          id: `company:${p.id}`,
          rental_stage: null,
          rental_installment_id: null,
          amount: p.company_fee,
          paid_amount: p.paid_amount == null ? null : money(p.paid_amount * ratio),
          kind: "other" as const,
          comment: `Комиссия компании · ${p.comment}`,
          article: null,
          article_id: null,
        },
      ];
    }
    if (
      p.rental_component ||
      ["rent_in", "owner_payout", "deposit_in", "deposit_out"].includes(p.kind)
    )
      return [];
    if (
      p.expense_bearer !== "company" &&
      (p.article?.affects_profit === false || p.article?.code === "utilities_out")
    )
      return [];
    return [p];
  });
}
export function companySummary(rows: Payment[], from: string, to: string, today = financeToday()) {
  const company = companyPayments(rows);
  let income = 0,
    expense = 0;
  for (const p of company) {
    const date = paymentCashDate(p);
    if (date < from || date > to) continue;
    const fact = paymentFactAmount(p, today);
    if (p.direction === "in") income += fact;
    else expense += fact;
  }
  let bank = 0,
    ownerReserve = 0,
    deposits = 0;
  for (const p of bankPayments(rows)) {
    const fact = paymentFactAmount(p, today),
      sign = p.direction === "in" ? 1 : -1;
    bank += sign * fact;
    if (p.kind === "rent_in" || p.rental_component === "utilities")
      ownerReserve +=
        p.rental_component === "rent" && p.company_fee != null
          ? fact * (1 - p.company_fee / p.amount)
          : fact;
    if (p.kind === "owner_payout" || p.expense_bearer === "owner") ownerReserve -= fact;
    if (p.kind === "deposit_in" || p.kind === "deposit_out") deposits += sign * fact;
  }
  return {
    income: money(income),
    expense: money(expense),
    profit: money(income - expense),
    bank: money(bank),
    ownerReserve: money(Math.max(0, ownerReserve)),
    deposits: money(Math.max(0, deposits)),
    available: money(bank - Math.max(0, ownerReserve) - Math.max(0, deposits)),
    unallocated: rows.filter(
      (p) => p.kind === "rent_in" && (p.rental_component !== "rent" || p.company_fee == null),
    ).length,
  };
}
export function clientPayments(rows: Payment[], clientId: string) {
  return bankPayments(rows).filter(
    (p) =>
      p.client_id === clientId &&
      !p.crm_charge &&
      !p.management_period &&
      p.kind !== "owner_payout",
  );
}

/** Future owner remittances affect forecast only; they are not yet a liability or an actual transfer. */
export function ownerForecastPayments(
  rows: Payment[],
  settings: {
    property_id: string;
    owner_counterparty_id?: string | null;
    payout_day?: number | null;
  }[],
  settlements: {
    booking_id?: string | null;
    property_id: string;
    period: string;
    obligation_id: string;
    automatic?: boolean;
    expense_amount?: number;
  }[],
): Payment[] {
  const result: Payment[] = [];
  const groups = new Map<string, Payment[]>();
  for (const p of rows) {
    if (p.owner_payout_on_request) continue;
    if (!["rent", "utilities"].includes(p.rental_component ?? "") || p.company_fee == null)
      continue;
    const legacy =
      settlements.some(
        (s) =>
          s.property_id === p.property_id && s.period.startsWith(paymentPeriod(p)) && !s.booking_id,
      ) ||
      rows.some(
        (x) =>
          x.kind === "owner_payout" &&
          !x.obligation_id &&
          x.property_id === p.property_id &&
          paymentPeriod(x) === paymentPeriod(p),
      );
    const key = [
      p.property_id,
      paymentPeriod(p),
      legacy ? "legacy" : (p.booking_id ?? "unlinked"),
    ].join(":");
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  for (const [key, receipts] of groups) {
    const first = receipts[0]!,
      month = paymentPeriod(first),
      cfg = settings.find((s) => s.property_id === first.property_id);
    const dates = receipts
      .map((p) => (p.owner_payout_day === undefined ? cfg?.payout_day : p.owner_payout_day))
      .filter((v): v is number => v != null && Number.isInteger(v) && v >= 1 && v <= 31);
    const payoutDay = dates.length ? Math.min(...dates) : null;
    if (!cfg?.owner_counterparty_id || !payoutDay) continue;
    const existing = settlements.find(
      (s) =>
        s.property_id === first.property_id &&
        s.period.startsWith(month) &&
        (!s.booking_id || s.booking_id === first.booking_id),
    );
    if (existing && !existing.automatic) continue;
    const total = receipts.reduce((sum, p) => sum + p.amount - (p.company_fee ?? 0), 0);
    const represented = rows
      .filter(
        (p) =>
          p.kind === "owner_payout" &&
          (existing
            ? p.obligation_id === existing.obligation_id
            : p.property_id === first.property_id &&
              paymentPeriod(p) === month &&
              !p.obligation_id &&
              (!p.booking_id || p.booking_id === first.booking_id)),
      )
      .reduce(
        (sum, p) => sum + (p.rental_component === "owner_plan" ? p.amount : paymentFactAmount(p)),
        0,
      );
    const remaining = money(total - represented - (existing?.expense_amount ?? 0));
    if (remaining <= 0) continue;
    const day = Math.min(
      payoutDay,
      new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate(),
    );
    result.push({
      ...first,
      id: `owner-forecast:${key}`,
      cash_parent_id: undefined,
      cash_receipts: [],
      task_expected_date: null,
      rental_stage: null,
      rental_installment_id: null,
      planned_date: `${month}-${String(day).padStart(2, "0")}`,
      amount: remaining,
      status: "expected",
      paid_amount: null,
      paid_at: null,
      direction: "out",
      kind: "owner_payout",
      rental_component: "owner_plan",
      company_fee: null,
      client_id: null,
      client: null,
      booking_id: null,
      deal_id: null,
      obligation_id: null,
      counterparty_id: cfg.owner_counterparty_id,
      counterparty_name: "Собственник · прогноз",
      article: null,
      article_id: null,
      comment: `Прогноз выплаты за ${month}. Начисление появится после поступления аренды.`,
    });
  }
  return result;
}

/** Deduct each owner cost once from projected transfers; cash costs remain separate movements. */
export function ownerCashPayments(
  rows: Payment[],
  settings: Parameters<typeof ownerForecastPayments>[1],
  settlements: Parameters<typeof ownerForecastPayments>[2],
): Payment[] {
  const result = [...bankPayments(rows), ...ownerForecastPayments(rows, settings, settlements)].map(
    (p) => ({ ...p }),
  );
  const allocated = new Map<string, number>();
  for (const st of settlements) {
    const owner =
      rows.find((p) => p.obligation_id === st.obligation_id && p.kind === "owner_payout")
        ?.counterparty_id ??
      settings.find((c) => c.property_id === st.property_id)?.owner_counterparty_id;
    const key = `${st.property_id}:${owner}`;
    allocated.set(key, (allocated.get(key) ?? 0) + (st.expense_amount ?? 0));
  }
  const plans = result
    .filter((p) => p.rental_component === "owner_plan")
    .sort((a, b) => a.planned_date.localeCompare(b.planned_date) || a.id.localeCompare(b.id));
  for (const cost of rows
    .filter((p) => p.expense_bearer === "owner")
    .sort(
      (a, b) =>
        (a.paid_at ?? a.planned_date).localeCompare(b.paid_at ?? b.planned_date) ||
        a.id.localeCompare(b.id),
    )) {
    const key = `${cost.property_id}:${cost.expense_owner_id}`;
    let amount = cost.status === "paid" ? paymentFactAmount(cost) : cost.amount;
    const used = Math.min(amount, allocated.get(key) ?? 0);
    allocated.set(key, (allocated.get(key) ?? 0) - used);
    amount = money(amount - used);
    for (const plan of plans) {
      if (amount <= 0) break;
      if (
        plan.property_id !== cost.property_id ||
        plan.counterparty_id !== cost.expense_owner_id ||
        (paymentFactAmount(cost) === 0 && plan.planned_date < cost.planned_date)
      )
        continue;
      const deduct = Math.min(amount, plan.amount);
      plan.amount = money(plan.amount - deduct);
      amount = money(amount - deduct);
    }
  }
  return result
    .filter(
      (p) => p.rental_component !== "owner_plan" || (p.amount > 0 && !p.owner_payout_on_request),
    )
    .map((p) => {
      if (p.rental_component !== "owner_plan") return p;
      const settlement = settlements.find((s) => s.obligation_id === p.obligation_id);
      const booking =
        p.booking_id ||
        (settlement as { booking_id?: string })?.booking_id ||
        (p.id.startsWith("owner-forecast:") ? p.id.split(":").at(-1) : null);
      const override = rows.find(
        (x) =>
          x.booking_id === booking &&
          x.rental_period === p.rental_period &&
          x.owner_task_expected_date,
      )?.owner_task_expected_date;
      return { ...p, contract_date: p.planned_date, planned_date: override || p.planned_date };
    });
}

/** The pair is one contract amount, never a third bank receipt. Read from full payment history. */
export function rentalInstallmentSummary(rows: Payment[], groupId: string, today = financeToday()) {
  const pair = rows.filter(
    (p) =>
      p.rental_installment_id === groupId && p.direction === "in" && !p.id.startsWith("company:"),
  );
  const total = money(pair.reduce((sum, p) => sum + p.amount, 0));
  const received = money(pair.reduce((sum, p) => sum + paymentFactAmount(p, today), 0));
  return { total, received, remaining: money(Math.max(0, total - received)) };
}
