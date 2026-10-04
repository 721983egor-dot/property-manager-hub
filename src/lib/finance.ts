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
  counterparty_name: string;
  comment: string;
  paid_at: string | null;
  paid_amount: number | null;
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
  counterparty_name?: string;
  comment?: string;
  paid_at?: string | null;
  paid_amount?: number | null;
};

const PAYMENT_SELECT =
  "id, planned_date, amount, direction, status, kind, property_id, client_id, booking_id, deal_id, counterparty_name, comment, paid_at, paid_amount, created_at, updated_at, properties(id, title, internal_name, ref_id), clients(id, full_name, phone)";

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
    counterparty_name: String(row["counterparty_name"] ?? ""),
    comment: String(row["comment"] ?? ""),
    paid_at: (row["paid_at"] as string | null) ?? null,
    paid_amount: row["paid_amount"] == null ? null : Number(row["paid_amount"]),
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
    counterparty_name: (input.counterparty_name ?? "").trim(),
    comment: (input.comment ?? "").trim(),
    paid_at: paidAt,
    paid_amount: paidAmount,
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
