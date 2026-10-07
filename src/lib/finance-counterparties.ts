import { supabase } from "@/integrations/supabase/client";
import { fetchPayments, type Payment, type PaymentDirection } from "@/lib/finance";
export { summarizeCounterparty, obligationCash } from "./finance-counterparty-model";

export type CounterpartyKind = "tenant" | "owner" | "contractor" | "employee" | "deposit" | "other";

export const COUNTERPARTY_KINDS: { value: CounterpartyKind; label: string }[] = [
  { value: "tenant", label: "Арендатор" },
  { value: "owner", label: "Собственник" },
  { value: "contractor", label: "Подрядчик" },
  { value: "employee", label: "Сотрудник" },
  { value: "deposit", label: "Депозит" },
  { value: "other", label: "Прочее" },
];

export function counterpartyKindLabel(kind: CounterpartyKind | string) {
  return COUNTERPARTY_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function asCounterpartyKind(value: unknown): CounterpartyKind {
  return COUNTERPARTY_KINDS.some((k) => k.value === value) ? (value as CounterpartyKind) : "other";
}

export type ObligationDirection = "receivable" | "payable";

export const OBLIGATION_DIRECTIONS: { value: ObligationDirection; label: string }[] = [
  { value: "receivable", label: "Мы передали (должен нам)" },
  { value: "payable", label: "Нам передали (мы должны)" },
];

export type FinanceCounterparty = {
  id: string;
  name: string;
  kind: CounterpartyKind;
  classification_id: string | null;
  requisites: string;
  client_id: string | null;
  comment: string;
  created_at: string;
  updated_at: string;
};

export type FinanceObligation = {
  id: string;
  counterparty_id: string;
  planned_date: string;
  amount: number;
  direction: ObligationDirection;
  description: string;
  legal_entity: string;
  property_id: string | null;
  status: "open" | "closed";
  created_at: string;
  property: {
    id: string;
    title: string;
    internal_name: string | null;
    ref_id: number | null;
  } | null;
};

function firstJoin<T>(raw: T | T[] | null | undefined): T | null {
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

function mapCounterparty(row: Record<string, unknown>): FinanceCounterparty {
  return {
    id: String(row["id"]),
    name: String(row["name"] ?? ""),
    kind: asCounterpartyKind(row["kind"]),
    classification_id: (row["classification_id"] as string | null) ?? null,
    requisites: String(row["requisites"] ?? ""),
    client_id: (row["client_id"] as string | null) ?? null,
    comment: String(row["comment"] ?? ""),
    created_at: String(row["created_at"] ?? ""),
    updated_at: String(row["updated_at"] ?? ""),
  };
}

function mapObligation(row: Record<string, unknown>): FinanceObligation {
  const property =
    firstJoin(
      row["properties"] as FinanceObligation["property"] | FinanceObligation["property"][] | null,
    ) ?? null;
  return {
    id: String(row["id"]),
    counterparty_id: String(row["counterparty_id"]),
    planned_date: String(row["planned_date"]),
    amount: Number(row["amount"] ?? 0),
    direction: row["direction"] === "payable" ? "payable" : "receivable",
    description: String(row["description"] ?? ""),
    legal_entity: String(row["legal_entity"] ?? ""),
    property_id: (row["property_id"] as string | null) ?? null,
    status: row["status"] === "closed" ? "closed" : "open",
    created_at: String(row["created_at"] ?? ""),
    property,
  };
}

export async function fetchCounterparties(kind?: CounterpartyKind | "all") {
  let query = supabase
    .from("finance_counterparties")
    .select(
      "id, name, kind, classification_id, requisites, client_id, comment, created_at, updated_at",
    )
    .order("name", { ascending: true });
  if (kind && kind !== "all") query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapCounterparty);
}

export async function fetchCounterparty(id: string) {
  const { data, error } = await supabase
    .from("finance_counterparties")
    .select(
      "id, name, kind, classification_id, requisites, client_id, comment, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapCounterparty(data as Record<string, unknown>);
}

export async function saveCounterparty(
  id: string | null,
  input: {
    name: string;
    kind: CounterpartyKind;
    client_id?: string | null;
    comment?: string;
    classification_id?: string | null;
    requisites?: string;
  },
) {
  const name = input.name.trim();
  if (!name) throw new Error("Укажите имя контрагента");
  const row = {
    name,
    kind: asCounterpartyKind(input.kind),
    ...(input.client_id !== undefined ? { client_id: input.client_id || null } : {}),
    ...(input.comment !== undefined ? { comment: input.comment.trim() } : {}),
    ...(input.classification_id !== undefined
      ? { classification_id: input.classification_id }
      : {}),
    ...(input.requisites !== undefined ? { requisites: input.requisites.trim() } : {}),
  };
  if (id) {
    const { error } = await supabase
      .from("finance_counterparties")
      .update(row as never)
      .eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("finance_counterparties")
    .insert(row as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteCounterparty(id: string) {
  const { error } = await supabase.from("finance_counterparties").delete().eq("id", id);
  if (error) throw error;
}

/** Найти или создать контрагента по имени (для операции из календаря). */
export async function ensureCounterparty(input: {
  id?: string | null;
  name?: string;
  kind?: CounterpartyKind;
  clientId?: string | null;
}): Promise<{ id: string | null; name: string }> {
  if (input.id) {
    const existing = await fetchCounterparty(input.id);
    if (existing) return { id: existing.id, name: existing.name };
  }
  const name = (input.name ?? "").trim();
  if (!name) return { id: null, name: "" };
  const { data: found } = await supabase
    .from("finance_counterparties")
    .select("id, name")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (found) return { id: String((found as { id: string }).id), name };
  const id = await saveCounterparty(null, {
    name,
    kind: input.kind ?? "other",
    client_id: input.clientId ?? null,
  });
  return { id, name };
}

export async function fetchObligations(
  opts: {
    counterpartyId?: string;
    propertyId?: string;
    status?: "open" | "closed" | "all";
  } = {},
) {
  let query = supabase
    .from("finance_obligations")
    .select(
      "id, counterparty_id, planned_date, amount, direction, description, legal_entity, property_id, status, created_at, properties(id, title, internal_name, ref_id)",
    )
    .order("planned_date", { ascending: false })
    .order("id", { ascending: true });
  if (opts.counterpartyId) query = query.eq("counterparty_id", opts.counterpartyId);
  if (opts.propertyId) query = query.eq("property_id", opts.propertyId);
  if (opts.status && opts.status !== "all") query = query.eq("status", opts.status);
  const rows: FinanceObligation[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page.map(mapObligation));
    if (page.length < 500) return rows;
  }
}

export async function saveObligation(
  id: string | null,
  input: {
    counterparty_id: string;
    planned_date: string;
    amount: number;
    direction: ObligationDirection;
    description?: string;
    legal_entity?: string;
    property_id?: string | null;
    status?: "open" | "closed";
  },
) {
  if (!input.planned_date) throw new Error("Укажите дату обязательства");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Укажите сумму");
  const row = {
    counterparty_id: input.counterparty_id,
    planned_date: input.planned_date,
    amount,
    direction: input.direction === "payable" ? "payable" : "receivable",
    description: (input.description ?? "").trim(),
    ...(input.legal_entity !== undefined ? { legal_entity: input.legal_entity.trim() } : {}),
    property_id: input.property_id || null,
    status: input.status === "closed" ? "closed" : "open",
  };
  if (id) {
    const { error } = await supabase
      .from("finance_obligations")
      .update(row as never)
      .eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("finance_obligations")
    .insert(row as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteObligation(id: string) {
  const { error } = await supabase.from("finance_obligations").delete().eq("id", id);
  if (error) throw error;
}

export function kindFromPaymentDirection(
  direction: PaymentDirection,
  kind?: string,
): CounterpartyKind {
  if (kind === "owner_payout") return "owner";
  if (kind === "contractor") return "contractor";
  if (kind === "deposit_in" || kind === "deposit_out") return "deposit";
  if (kind === "rent_in") return "tenant";
  return direction === "in" ? "tenant" : "other";
}

export async function paymentsForCounterparty(counterpartyId: string) {
  return fetchPayments({ counterpartyId });
}
