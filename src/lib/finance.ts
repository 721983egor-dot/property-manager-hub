import { buildPaymentSeriesEntries, type PaymentRepeatOptions } from "./finance-payment-series";
import { expandPaymentReceipts } from "./finance-cash-receipts";
import { supabase } from "@/integrations/supabase/client";
import { toISODate } from "@/lib/rentals";
import {
  effectivePaymentStatus,
  financeToday,
  paymentFactAmount,
} from "./finance-payment-status.ts";
export { effectivePaymentStatus } from "./finance-payment-status.ts";

export type PaymentDirection = "in" | "out";
export type PaymentStatus = "expected" | "partial" | "paid" | "overdue";
export type PaymentKind =
  | "rent_in"
  | "deposit_in"
  | "deposit_out"
  | "owner_payout"
  | "contractor"
  | "agency_cost"
  | "other";

export const PAYMENT_DIRECTIONS: { value: PaymentDirection; label: string }[] = [
  { value: "in", label: "Приход" },
  { value: "out", label: "Расход" },
];

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: "expected", label: "Планируемая" },
  { value: "partial", label: "Частично" },
  { value: "paid", label: "Проведена" },
  { value: "overdue", label: "Просрочено" },
];

export const PAYMENT_KINDS: { value: PaymentKind; label: string; direction: PaymentDirection }[] = [
  { value: "rent_in", label: "Аренда", direction: "in" },
  { value: "deposit_in", label: "Депозит (приход)", direction: "in" },
  { value: "deposit_out", label: "Возврат депозита", direction: "out" },
  { value: "owner_payout", label: "Выплата собственнику", direction: "out" },
  { value: "contractor", label: "Подрядчик / обслуживание", direction: "out" },
  { value: "agency_cost", label: "Расход агентства", direction: "out" },
  { value: "other", label: "Прочее", direction: "in" },
];

export const PAYMENT_ACCOUNTS = ["Основной", "Касса"] as const;

export type CashReceipt = {
  id: string;
  amount: number;
  total: number;
  date: string;
  account: string;
};
export type Payment = {
  recurring_series_id?: string | null;
  recurring_index?: number | null;
  cash_receipts?: CashReceipt[];
  cash_parent_id?: string | undefined;
  task_expected_date?: string | null;
  owner_task_expected_date?: string | null;
  contract_date?: string;
  requires_confirmation?: boolean;
  owner_payout_on_request?: boolean;
  expense_bearer?: "company" | "owner" | null;
  expense_owner_id?: string | null;
  owner_payout_day?: number | null;
  rental_schedule?: boolean;
  rental_installment_id?: string | null;
  rental_stage?: "prepayment" | "balance" | null;
  management_period?: string | null;
  rental_component?: "rent" | "utilities" | "owner_plan" | null;
  rental_period?: string | null;
  company_fee?: number | null;
  crm_charge?: string | null;
  id: string;
  planned_date: string;
  amount: number;
  direction: PaymentDirection;
  status: PaymentStatus;
  kind: PaymentKind;
  property_id: string | null;
  client_id: string | null;
  booking_id: string | null;
  deal_id: string | null;
  counterparty_id: string | null;
  counterparty_name: string;
  account: string;
  comment: string;
  paid_at: string | null;
  paid_amount: number | null;
  accrual_date: string | null;
  obligation_id: string | null;
  article_id: string | null;
  created_at: string;
  updated_at: string;
  property: {
    id: string;
    title: string;
    internal_name: string | null;
    ref_id: number | null;
  } | null;
  client: { id: string; full_name: string; phone: string } | null;
  article: {
    affects_profit?: boolean;
    id: string;
    name: string;
    category_id: string | null;
    category_name: string | null;
    code: string | null;
  } | null;
};

export type PaymentInput = {
  expense_bearer?: "company" | "owner" | null;
  expense_owner_id?: string | null;
  planned_date: string;
  amount: number;
  direction: PaymentDirection;
  status: PaymentStatus;
  kind: PaymentKind;
  property_id: string | null;
  client_id: string | null;
  rental_component?: "rent" | "utilities" | null;
  rental_period?: string | null;
  booking_id?: string | null;
  deal_id?: string | null;
  counterparty_id?: string | null;
  counterparty_name?: string;
  account?: string;
  comment?: string;
  paid_at?: string | null;
  paid_amount?: number | null;
  accrual_date?: string | null;
  obligation_id?: string | null;
  article_id?: string | null;
};

const PAYMENT_SELECT =
  "recurring_series_id, recurring_index, cash_receipts, task_expected_date, owner_task_expected_date, requires_confirmation, owner_payout_on_request, id, planned_date, amount, direction, status, kind, property_id, client_id, booking_id, rental_installment_id, rental_stage, rental_schedule, rental_component, rental_period, expense_bearer, expense_owner_id, owner_payout_day, company_fee, crm_charge, management_period, deal_id, counterparty_id, counterparty_name, account, comment, paid_at, paid_amount, accrual_date, obligation_id, article_id, created_at, updated_at, properties(id, title, internal_name, ref_id), clients(id, full_name, phone), finance_articles(id, name, category_id, code, affects_profit, finance_article_categories(id, name))";
const PAYMENT_SELECT_LEGACY =
  "recurring_series_id, recurring_index, cash_receipts, task_expected_date, owner_task_expected_date, requires_confirmation, owner_payout_on_request, id, planned_date, amount, direction, status, kind, property_id, client_id, booking_id, rental_installment_id, rental_stage, rental_schedule, rental_component, rental_period, expense_bearer, expense_owner_id, owner_payout_day, company_fee, crm_charge, management_period, deal_id, counterparty_id, counterparty_name, account, comment, paid_at, paid_amount, accrual_date, obligation_id, created_at, updated_at, properties(id, title, internal_name, ref_id), clients(id, full_name, phone)";

function asDirection(value: unknown): PaymentDirection {
  return value === "out" ? "out" : "in";
}

function asStatus(value: unknown): PaymentStatus {
  if (value === "partial" || value === "paid" || value === "overdue") return value;
  return "expected";
}

function asKind(value: unknown): PaymentKind {
  const found = PAYMENT_KINDS.find((k) => k.value === value);
  return found?.value ?? "other";
}

function firstJoin<T>(raw: T | T[] | null | undefined): T | null {
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

function mapArticleJoin(row: Record<string, unknown>): Payment["article"] {
  const raw = firstJoin(
    row["finance_articles"] as Record<string, unknown> | Record<string, unknown>[] | null,
  );
  if (!raw) return null;
  const cat = firstJoin(
    raw["finance_article_categories"] as Record<string, unknown> | Record<string, unknown>[] | null,
  );
  return {
    id: String(raw["id"]),
    name: String(raw["name"] ?? ""),
    category_id: (raw["category_id"] as string | null) ?? null,
    category_name: cat ? String(cat["name"] ?? "") : null,
    code: (raw["code"] as string | null) ?? null,
    ...(typeof raw["affects_profit"] === "boolean"
      ? { affects_profit: raw["affects_profit"] }
      : {}),
  };
}

export function mapPayment(row: Record<string, unknown>): Payment {
  const property =
    firstJoin(row["properties"] as Payment["property"] | Payment["property"][] | null) ?? null;
  const client =
    firstJoin(row["clients"] as Payment["client"] | Payment["client"][] | null) ?? null;
  const article = mapArticleJoin(row);
  return {
    recurring_series_id: (row["recurring_series_id"] as string | null) ?? null,
    recurring_index: row["recurring_index"] == null ? null : Number(row["recurring_index"]),
    cash_receipts: (row["cash_receipts"] as CashReceipt[]) ?? [],
    task_expected_date: row["task_expected_date"] as string | null,
    owner_task_expected_date: row["owner_task_expected_date"] as string | null,
    requires_confirmation: row["requires_confirmation"] === true,
    owner_payout_on_request: row["owner_payout_on_request"] === true,
    expense_bearer: (row["expense_bearer"] as Payment["expense_bearer"]) ?? null,
    expense_owner_id: (row["expense_owner_id"] as string | null) ?? null,
    id: String(row["id"]),
    planned_date: String(row["planned_date"]),
    amount: Number(row["amount"] ?? 0),
    direction: asDirection(row["direction"]),
    status: asStatus(row["status"]),
    kind: asKind(row["kind"]),
    property_id: (row["property_id"] as string | null) ?? null,
    client_id: (row["client_id"] as string | null) ?? null,
    booking_id: (row["booking_id"] as string | null) ?? null,
    management_period: (row["management_period"] as string | null) ?? null,
    rental_schedule: row["rental_schedule"] === true,
    owner_payout_day: row["owner_payout_day"] == null ? null : Number(row["owner_payout_day"]),
    rental_installment_id: (row["rental_installment_id"] as string | null) ?? null,
    rental_stage: (row["rental_stage"] as Payment["rental_stage"]) ?? null,
    rental_component: (row["rental_component"] as Payment["rental_component"]) ?? null,
    rental_period: row["rental_period"] as string | null,
    company_fee: row["company_fee"] == null ? null : Number(row["company_fee"]),
    crm_charge: row["crm_charge"] as string | null,
    deal_id: (row["deal_id"] as string | null) ?? null,
    counterparty_id: (row["counterparty_id"] as string | null) ?? null,
    counterparty_name: String(row["counterparty_name"] ?? ""),
    account: String(row["account"] ?? "Основной") || "Основной",
    comment: String(row["comment"] ?? ""),
    paid_at: (row["paid_at"] as string | null) ?? null,
    paid_amount: row["paid_amount"] == null ? null : Number(row["paid_amount"]),
    accrual_date: (row["accrual_date"] as string | null) ?? null,
    obligation_id: (row["obligation_id"] as string | null) ?? null,
    article_id: (row["article_id"] as string | null) ?? article?.id ?? null,
    created_at: String(row["created_at"] ?? ""),
    updated_at: String(row["updated_at"] ?? ""),
    property,
    client,
    article,
  };
}

export function directionLabel(value: PaymentDirection) {
  return PAYMENT_DIRECTIONS.find((d) => d.value === value)?.label ?? value;
}

export function statusLabel(value: PaymentStatus) {
  return PAYMENT_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export function kindLabel(value: PaymentKind) {
  return PAYMENT_KINDS.find((k) => k.value === value)?.label ?? value;
}

export function rentalPaymentLabel(payment: Payment) {
  if (payment.rental_stage === "prepayment") return "Предоплата за аренду";
  if (payment.rental_stage === "balance") return "Остаток оплаты при заезде";
  return payment.article?.name ?? kindLabel(payment.kind);
}

export function defaultDirectionForKind(kind: PaymentKind): PaymentDirection {
  return PAYMENT_KINDS.find((k) => k.value === kind)?.direction ?? "in";
}

export function counterpartyLabel(payment: Payment) {
  if (payment.client?.full_name) return payment.client.full_name;
  if (payment.counterparty_name.trim()) return payment.counterparty_name.trim();
  return "—";
}

export type FetchPaymentsOpts = {
  bookingId?: string;
  from?: string;
  to?: string;
  propertyId?: string | null;
  counterpartyId?: string | null;
  status?: PaymentStatus | "all" | "open";
  direction?: PaymentDirection | "all";
};

function missingArticleColumn(message: string) {
  return /article_id|finance_articles|schema cache|could not find/i.test(message);
}

export async function fetchPayments(opts: FetchPaymentsOpts = {}): Promise<Payment[]> {
  const run = async (columns: string, offset: number) => {
    let query = supabase
      .from("payments")
      .select(columns)
      .order("planned_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + 499);
    if (opts.bookingId) query = query.eq("booking_id", opts.bookingId);
    if (opts.propertyId) query = query.eq("property_id", opts.propertyId);
    if (opts.counterpartyId)
      query = query.or(
        `counterparty_id.eq.${opts.counterpartyId},expense_owner_id.eq.${opts.counterpartyId}`,
      );
    if (opts.direction && opts.direction !== "all") query = query.eq("direction", opts.direction);
    return query;
  };

  const rows: Record<string, unknown>[] = [];
  let columns = PAYMENT_SELECT;
  for (let offset = 0; ; offset += 500) {
    let result = await run(columns, offset);
    if (result.error && /recurring_series_id|recurring_index/.test(result.error.message)) {
      columns = columns.replace("recurring_series_id, recurring_index, ", "");
      result = await run(columns, offset);
    }
    if (result.error && columns.includes("finance_articles(") && missingArticleColumn(result.error.message)) {
      columns = columns.includes("recurring_series_id") ? PAYMENT_SELECT_LEGACY : PAYMENT_SELECT_LEGACY.replace("recurring_series_id, recurring_index, ", "");
      result = await run(columns, offset);
    }
    if (result.error) throw result.error;
    const page = (result.data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < 500) break;
  }
  const today = financeToday();
  return rows
    .map(mapPayment)
    .flatMap(expandPaymentReceipts)
    .filter((payment) => {
      if (opts.from && payment.planned_date < opts.from) return false;
      if (opts.to && payment.planned_date > opts.to) return false;
      if (!opts.status || opts.status === "all") return true;
      const status = effectivePaymentStatus(payment, today);
      return opts.status === "open" ? status !== "paid" : status === opts.status;
    });
}

/** Лёгкий список объектов для фильтров Финансов — без select(*) и без server fn. */
export type FinancePropertyOption = {
  type?: string | undefined;
  id: string;
  title: string;
  internal_name: string | null;
  ref_id: number | null;
  status: string;
};

export async function fetchFinancePropertyOptions(): Promise<FinancePropertyOption[]> {
  return fetchFinanceReportPropertyOptions(false);
}

export async function fetchFinanceReportPropertyOptions(
  includeArchived = true,
): Promise<FinancePropertyOption[]> {
  let query = supabase
    .from("properties")
    .select("id, title, internal_name, ref_id, status, type")
    .order("title", { ascending: true });
  if (!includeArchived) query = query.neq("status", "archived");
  const { data, error } = await query;
  if (error) throw error;
  const rows = ((data ?? []) as FinancePropertyOption[]).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    internal_name: row.internal_name ?? null,
    ref_id: row.ref_id == null ? null : Number(row.ref_id),
    status: String(row.status ?? ""),
    type: row.type,
  }));
  return rows.sort((a, b) => financePropertyLabel(a).localeCompare(financePropertyLabel(b), "ru"));
}

export function financePropertyLabel(p: Pick<FinancePropertyOption, "title" | "internal_name">) {
  const name = p.internal_name?.trim() ? p.internal_name : p.title;
  return name;
}

export async function fetchPayment(id: string): Promise<Payment | null> {
  let columns = PAYMENT_SELECT;
  const read = () => supabase.from("payments").select(columns).eq("id", id).maybeSingle();
  let result = await read();
  if (result.error && /recurring_series_id|recurring_index/.test(result.error.message)) {
    columns = columns.replace("recurring_series_id, recurring_index, ", ""); result = await read();
  }
  if (result.error && missingArticleColumn(result.error.message)) {
    columns = columns.includes("recurring_series_id") ? PAYMENT_SELECT_LEGACY : PAYMENT_SELECT_LEGACY.replace("recurring_series_id, recurring_index, ", ""); result = await read();
  }
  if (result.error) throw result.error;
  if (!result.data) return null;
  return mapPayment(result.data as unknown as Record<string, unknown>);
}

function normalizeInput(input: PaymentInput) {
  const amount = Number(input.amount);
  if (!input.planned_date) throw new Error("Укажите плановую дату");
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Укажите сумму");
  const status = asStatus(input.status);
  const paidAt = status === "paid" ? input.paid_at || input.planned_date : (input.paid_at ?? null);
  const paidAmount =
    status === "paid"
      ? (input.paid_amount ?? amount)
      : status === "partial"
        ? (input.paid_amount ?? null)
        : (input.paid_amount ?? null);
  return {
    ...(input.expense_bearer !== undefined ? { expense_bearer: input.expense_bearer } : {}),
    ...(input.expense_owner_id !== undefined ? { expense_owner_id: input.expense_owner_id } : {}),
    planned_date: input.planned_date,
    amount,
    direction: asDirection(input.direction),
    status,
    kind: asKind(input.kind),
    property_id: input.property_id || null,
    client_id: input.client_id || null,
    booking_id: input.booking_id || null,
    ...(input.rental_component !== undefined ? { rental_component: input.rental_component } : {}),
    ...(input.rental_period !== undefined ? { rental_period: input.rental_period } : {}),
    deal_id: input.deal_id || null,
    counterparty_id: input.counterparty_id || null,
    counterparty_name: (input.counterparty_name ?? "").trim(),
    account: (input.account ?? "Основной").trim() || "Основной",
    comment: (input.comment ?? "").trim(),
    paid_at: paidAt,
    paid_amount: paidAmount,
    accrual_date: input.accrual_date || null,
    obligation_id: input.obligation_id || null,
    article_id: input.article_id || null,
  };
}

export async function savePayment(id: string | null, input: PaymentInput): Promise<string> {
  const row = normalizeInput(input);
  const write = async (payload: Record<string, unknown>) => {
    if (id) {
      const { error } = await supabase
        .from("payments")
        .update(payload as never)
        .eq("id", id);
      if (error) throw error;
      return id;
    }
    const { data, error } = await supabase
      .from("payments")
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  };
  try {
    return await write(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!missingArticleColumn(message) || !("article_id" in row)) throw error;
    const { article_id: _drop, ...stripped } = row;
    return await write(stripped);
  }
}

export { buildPaymentSeriesDates } from "./finance-payment-series";
export type { PaymentRepeatInterval, PaymentRepeatOptions } from "./finance-payment-series";

/** Validate the whole series first, then insert all rows atomically. */
export async function savePaymentSeries(
  id: string | null,
  input: PaymentInput,
  repeat: PaymentRepeatOptions | number | null = null,
): Promise<string> {
  if (id || repeat == null) return savePayment(id, input);
  const opts: PaymentRepeatOptions = typeof repeat === "number"
    ? { interval: "month", count: Math.min(36, Math.max(1, Math.floor(repeat) + 1)) }
    : repeat;
  if (input.booking_id || input.rental_component || input.obligation_id)
    throw new Error("Для связанной аренды и выплат используйте график в брони");
  // The RPC persists the template and occurrence IDs together; unlimited series are extended by cron.
  buildPaymentSeriesEntries(input, opts); // validate before any write
  const { createPaymentSeries } = await import("./finance-recurring-client");
  return createPaymentSeries(normalizeInput(input), opts);

}

export async function markPaymentPaid(
  id: string,
  opts?: { paidAt?: string; paidAmount?: number | null },
): Promise<void> {
  const { data: current, error: loadError } = await supabase
    .from("payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!current) throw new Error("Платёж не найден");
  if (current.requires_confirmation && current.direction === "in" && current.booking_id) {
    const { confirmTaskReceipt } = await import("./finance-task-receipt");
    const received =
      current.status === "paid"
        ? (current.paid_amount ?? current.amount)
        : (current.paid_amount ?? 0);
    if (received >= current.amount) return;
    await confirmTaskReceipt(supabase, {
      p_payment: id,
      p_booking: current.booking_id,
      p_expected_amount: current.amount,
      p_expected_paid: received,
      p_expected_date: current.task_expected_date || current.planned_date,
      p_expected_account: current.account,
      p_paid_total: opts?.paidAmount ?? current.amount,
      p_paid_date: opts?.paidAt || financeToday(),
      p_received_account: current.account,
      p_request_id: crypto.randomUUID(),
    });
    return;
  }
  const amount = Number((current as { amount: number }).amount);
  const plan = current as unknown as {
    rental_component: string | null;
    obligation_id: string | null;
    account: string;
  };
  if (plan.rental_component === "owner_plan" && plan.obligation_id) {
    const { payOwnerSettlement } = await import("./finance-owner-settlements");
    await payOwnerSettlement(
      plan.obligation_id,
      opts?.paidAmount ?? amount,
      plan.account,
      opts?.paidAt || financeToday(),
      crypto.randomUUID(),
    );
    return;
  }

  const { error } = await supabase
    .from("payments")
    .update({
      status: "paid",
      paid_at: opts?.paidAt || financeToday(),
      paid_amount: opts?.paidAmount ?? amount,
    } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) throw error;
}

export type MonthFinanceSummary = {
  month: string;
  planIn: number;
  planOut: number;
  factIn: number;
  factOut: number;
  overdueCount: number;
  overdueAmount: number;
};

export function summarizeMonth(payments: Payment[], month: string): MonthFinanceSummary {
  const today = financeToday();
  let planIn = 0;
  let planOut = 0;
  let factIn = 0;
  let factOut = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  for (const payment of payments) {
    if (!payment.planned_date.startsWith(month)) continue;
    if (payment.direction === "in") planIn += payment.amount;
    else planOut += payment.amount;
    const status = effectivePaymentStatus(payment, today);
    if (status === "paid") {
      const fact = paymentFactAmount(payment, today);
      if (payment.direction === "in") factIn += fact;
      else factOut += fact;
    } else if (status === "partial") {
      const fact = payment.paid_amount ?? 0;
      if (payment.direction === "in") factIn += fact;
      else factOut += fact;
    }
    if (status === "partial" && payment.planned_date < today) {
      overdueCount += 1;
      overdueAmount += Math.max(0, payment.amount - (payment.paid_amount ?? 0));
    }
  }
  return { month, planIn, planOut, factIn, factOut, overdueCount, overdueAmount };
}

export type FinanceCounterparty = {
  key: string;
  name: string;
  clientId: string | null;
  roles: string[];
  paymentCount: number;
  openAmount: number;
  propertyIds: string[];
};

/** Тонкий слой контрагентов из платежей (+ имя клиента CRM). */
export function buildCounterparties(
  payments: Payment[],
  today = financeToday(),
): FinanceCounterparty[] {
  const map = new Map<string, FinanceCounterparty>();
  for (const payment of payments) {
    const name = counterpartyLabel(payment);
    if (name === "—") continue;
    const key = payment.client_id ? `client:${payment.client_id}` : `name:${name.toLowerCase()}`;
    const existing = map.get(key) ?? {
      key,
      name,
      clientId: payment.client_id,
      roles: [],
      paymentCount: 0,
      openAmount: 0,
      propertyIds: [],
    };
    existing.paymentCount += 1;
    const role =
      payment.kind === "owner_payout"
        ? "Собственник"
        : payment.kind === "contractor"
          ? "Подрядчик"
          : payment.direction === "in"
            ? "Арендатор"
            : "Прочее";
    if (!existing.roles.includes(role)) existing.roles.push(role);
    const status = effectivePaymentStatus(payment, today);
    if (status !== "paid") {
      existing.openAmount += Math.max(0, payment.amount - (payment.paid_amount ?? 0));
    }
    if (payment.property_id && !existing.propertyIds.includes(payment.property_id)) {
      existing.propertyIds.push(payment.property_id);
    }
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function monthBounds(year: number, monthIndex: number) {
  const from = toISODate(new Date(year, monthIndex, 1));
  const to = toISODate(new Date(year, monthIndex + 1, 0));
  return { from, to, monthKey: from.slice(0, 7) };
}

/** Сводка дня для платёжного календаря (как в Адеске). */
export type DayMoneyLedger = {
  date: string;
  day: number;
  income: number;
  expense: number;
  saldo: number;
  opening: number;
  closing: number;
  /** Кассовый разрыв: остаток уходит в минус. */
  hasGap: boolean;
  payments: Payment[];
};

/** По дням месяца: приход/расход/сальдо и накопительный остаток с openingBalance. */
export function buildMonthDayLedger(
  payments: Payment[],
  year: number,
  monthIndex: number,
  openingBalance = 0,
): DayMoneyLedger[] {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const byDay = new Map<string, Payment[]>();
  for (const payment of payments) {
    const list = byDay.get(payment.planned_date) ?? [];
    list.push(payment);
    byDay.set(payment.planned_date, list);
  }

  let opening = openingBalance;
  const rows: DayMoneyLedger[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = toISODate(new Date(year, monthIndex, day));
    const dayPayments = byDay.get(date) ?? [];
    let income = 0;
    let expense = 0;
    for (const payment of dayPayments) {
      if (payment.direction === "in") income += payment.amount;
      else expense += payment.amount;
    }
    const saldo = income - expense;
    const closing = opening + saldo;
    rows.push({
      date,
      day,
      income,
      expense,
      saldo,
      opening,
      closing,
      hasGap: closing < 0 || opening < 0,
      payments: dayPayments,
    });
    opening = closing;
  }
  return rows;
}

const OPENING_STORAGE_PREFIX = "rm-os-finance-opening:";

export function loadMonthOpeningBalance(monthKey: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(`${OPENING_STORAGE_PREFIX}${monthKey}`);
    if (raw == null || raw === "") return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function saveMonthOpeningBalance(monthKey: string, value: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${OPENING_STORAGE_PREFIX}${monthKey}`, String(value));
  } catch {
    /* ignore quota */
  }
}

export function formatCompactMoney(value: number) {
  const abs = Math.abs(Math.round(value));
  const formatted = abs.toLocaleString("ru-RU");
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return "0";
}

/** Сумма как в платёжном календаре Адеска: 12 000,00 ₽ */
export function formatFinanceDate(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

const ADESK_MONEY = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAdeskMoney(value: number, withSign = false) {
  const formatted = ADESK_MONEY.format(Math.abs(value));
  const body = `${formatted} ₽`;
  if (!withSign) return value < 0 ? `−${body}` : body;
  if (value > 0) return `+${body}`;
  if (value < 0) return `−${body}`;
  return `+${body}`;
}

export function formatGapLabel(closing: number) {
  const abs = Math.abs(closing);
  if (abs >= 1000) return `Разрыв в ${Math.round(abs / 1000)}K ₽`;
  return `Разрыв в ${Math.round(abs).toLocaleString("ru-RU")} ₽`;
}
