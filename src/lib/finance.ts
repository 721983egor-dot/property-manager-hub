import { supabase } from "@/integrations/supabase/client";
import { toISODate } from "@/lib/rentals";

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
  { value: "expected", label: "Ожидается" },
  { value: "partial", label: "Частично" },
  { value: "paid", label: "Оплачено" },
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

export type Payment = {
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
  created_at: string;
  updated_at: string;
  property: {
    id: string;
    title: string;
    internal_name: string | null;
    ref_id: number | null;
  } | null;
  client: { id: string; full_name: string; phone: string } | null;
};

export type PaymentInput = {
  planned_date: string;
  amount: number;
  direction: PaymentDirection;
  status: PaymentStatus;
  kind: PaymentKind;
  property_id: string | null;
  client_id: string | null;
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
};

const PAYMENT_SELECT =
  "id, planned_date, amount, direction, status, kind, property_id, client_id, booking_id, deal_id, counterparty_id, counterparty_name, account, comment, paid_at, paid_amount, accrual_date, obligation_id, created_at, updated_at, properties(id, title, internal_name, ref_id), clients(id, full_name, phone)";

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

function mapPayment(row: Record<string, unknown>): Payment {
  const property =
    firstJoin(row["properties"] as Payment["property"] | Payment["property"][] | null) ?? null;
  const client =
    firstJoin(row["clients"] as Payment["client"] | Payment["client"][] | null) ?? null;
  return {
    id: String(row["id"]),
    planned_date: String(row["planned_date"]),
    amount: Number(row["amount"] ?? 0),
    direction: asDirection(row["direction"]),
    status: asStatus(row["status"]),
    kind: asKind(row["kind"]),
    property_id: (row["property_id"] as string | null) ?? null,
    client_id: (row["client_id"] as string | null) ?? null,
    booking_id: (row["booking_id"] as string | null) ?? null,
    deal_id: (row["deal_id"] as string | null) ?? null,
    counterparty_id: (row["counterparty_id"] as string | null) ?? null,
    counterparty_name: String(row["counterparty_name"] ?? ""),
    account: String(row["account"] ?? "Основной") || "Основной",
    comment: String(row["comment"] ?? ""),
    paid_at: (row["paid_at"] as string | null) ?? null,
    paid_amount: row["paid_amount"] == null ? null : Number(row["paid_amount"]),
    accrual_date: (row["accrual_date"] as string | null) ?? null,
    obligation_id: (row["obligation_id"] as string | null) ?? null,
    created_at: String(row["created_at"] ?? ""),
    updated_at: String(row["updated_at"] ?? ""),
    property,
    client,
  };
}

/** Эффективный статус: просрочка по дате, если ещё не оплачено. */
export function effectivePaymentStatus(
  payment: Pick<Payment, "status" | "planned_date">,
  today = toISODate(new Date()),
): PaymentStatus {
  if (payment.status === "paid") return "paid";
  if (payment.status === "partial") {
    return payment.planned_date < today ? "overdue" : "partial";
  }
  if (payment.planned_date < today) return "overdue";
  return payment.status === "overdue" ? "overdue" : "expected";
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

export function defaultDirectionForKind(kind: PaymentKind): PaymentDirection {
  return PAYMENT_KINDS.find((k) => k.value === kind)?.direction ?? "in";
}

export function counterpartyLabel(payment: Payment) {
  if (payment.client?.full_name) return payment.client.full_name;
  if (payment.counterparty_name.trim()) return payment.counterparty_name.trim();
  return "—";
}

export type FetchPaymentsOpts = {
  from?: string;
  to?: string;
  propertyId?: string | null;
  counterpartyId?: string | null;
  status?: PaymentStatus | "all" | "open";
  direction?: PaymentDirection | "all";
};

export async function fetchPayments(opts: FetchPaymentsOpts = {}): Promise<Payment[]> {
  let query = supabase
    .from("payments")
    .select(PAYMENT_SELECT)
    .order("planned_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (opts.from) query = query.gte("planned_date", opts.from);
  if (opts.to) query = query.lte("planned_date", opts.to);
  if (opts.propertyId) query = query.eq("property_id", opts.propertyId);
  if (opts.counterpartyId) query = query.eq("counterparty_id", opts.counterpartyId);
  if (opts.direction && opts.direction !== "all") query = query.eq("direction", opts.direction);
  if (opts.status && opts.status !== "all" && opts.status !== "open") {
    query = query.eq("status", opts.status);
  }
  if (opts.status === "open") {
    query = query.in("status", ["expected", "partial", "overdue"]);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapPayment);
}

export async function fetchPayment(id: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapPayment(data as Record<string, unknown>);
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
    planned_date: input.planned_date,
    amount,
    direction: asDirection(input.direction),
    status,
    kind: asKind(input.kind),
    property_id: input.property_id || null,
    client_id: input.client_id || null,
    booking_id: input.booking_id || null,
    deal_id: input.deal_id || null,
    counterparty_id: input.counterparty_id || null,
    counterparty_name: (input.counterparty_name ?? "").trim(),
    account: (input.account ?? "Основной").trim() || "Основной",
    comment: (input.comment ?? "").trim(),
    paid_at: paidAt,
    paid_amount: paidAmount,
    accrual_date: input.accrual_date || null,
    obligation_id: input.obligation_id || null,
  };
}

export async function savePayment(id: string | null, input: PaymentInput): Promise<string> {
  const row = normalizeInput(input);
  if (id) {
    const { error } = await supabase
      .from("payments")
      .update(row as never)
      .eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("payments")
    .insert(row as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

function addMonthsIso(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1 + months, 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const day = Math.min(d ?? 1, last);
  return toISODate(new Date(date.getFullYear(), date.getMonth(), day));
}

/** Сохранить операцию: опционально повтор по месяцам. */
export async function savePaymentSeries(
  id: string | null,
  input: PaymentInput,
  repeatMonths = 0,
): Promise<string> {
  const firstId = await savePayment(id, input);
  if (id || repeatMonths <= 0) return firstId;
  const extras = Math.min(11, Math.floor(repeatMonths));
  for (let i = 1; i <= extras; i += 1) {
    await savePayment(null, {
      ...input,
      planned_date: addMonthsIso(input.planned_date, i),
      accrual_date: input.accrual_date ? addMonthsIso(input.accrual_date, i) : null,
    });
  }
  return firstId;
}

export async function markPaymentPaid(
  id: string,
  opts?: { paidAt?: string; paidAmount?: number | null },
): Promise<void> {
  const { data: current, error: loadError } = await supabase
    .from("payments")
    .select("amount")
    .eq("id", id)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!current) throw new Error("Платёж не найден");
  const amount = Number((current as { amount: number }).amount);
  const { error } = await supabase
    .from("payments")
    .update({
      status: "paid",
      paid_at: opts?.paidAt || toISODate(new Date()),
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
  const today = toISODate(new Date());
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
      const fact = payment.paid_amount ?? payment.amount;
      if (payment.direction === "in") factIn += fact;
      else factOut += fact;
    } else if (status === "partial") {
      const fact = payment.paid_amount ?? 0;
      if (payment.direction === "in") factIn += fact;
      else factOut += fact;
    }
    if (status === "overdue") {
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
  today = toISODate(new Date()),
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

export function formatAdeskMoney(value: number, withSign = false) {
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
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
