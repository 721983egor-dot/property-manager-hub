import type { DayMoneyLedger, Payment } from "./finance.ts";
import { financeToday, paymentFactAmount } from "./finance-payment-status.ts";

const money = (value: number) => Math.round(value * 100) / 100;

export type OpeningAnchor = { date: string; amount: number };
export type CalendarCashPoint = { date: string; balance: number; actual: number | null };

export function paymentCashDate(payment: Payment): string {
  return (
    payment.status === "paid" || payment.status === "partial"
      ? payment.paid_at || payment.planned_date
      : payment.planned_date
  ).slice(0, 10);
}

/** One continuous cash timeline, including operations outside the visible month. */
export function buildFinanceCalendar(
  payments: Payment[],
  year: number,
  monthIndex: number,
  today = financeToday(),
  anchor?: OpeningAnchor | null,
): { ledger: DayMoneyLedger[]; chart: CalendarCashPoint[]; opening: number } {
  const from = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const base = anchor && anchor.date <= from ? anchor : null;
  const actual = new Map<string, number>();
  const income = new Map<string, number>();
  const expense = new Map<string, number>();
  const byDay = new Map<string, Payment[]>();
  const addPlan = (date: string, amount: number, direction: Payment["direction"]) => {
    const map = direction === "in" ? income : expense;
    map.set(date, money((map.get(date) ?? 0) + amount));
  };
  for (const p of payments) {
    const list = byDay.get(p.planned_date) ?? [];
    list.push(p);
    byDay.set(p.planned_date, list);
    const fact = paymentFactAmount(p, today);
    const cashDate = paymentCashDate(p);
    if (fact) {
      actual.set(
        cashDate,
        money((actual.get(cashDate) ?? 0) + (p.direction === "in" ? fact : -fact)),
      );
      addPlan(cashDate, fact, p.direction);
    }
    if (p.status !== "paid") {
      const remaining = Math.max(0, p.amount - fact);
      // Explicit partial debt remains a forecast from today until it is actually settled.
      if (remaining)
        addPlan(p.planned_date < today ? today : p.planned_date, remaining, p.direction);
    }
  }
  const before = (map: Map<string, number>) =>
    Array.from(map).reduce(
      (sum, [date, value]) => (date < from && (!base || date >= base.date) ? sum + value : sum),
      0,
    );
  let projected = money((base?.amount ?? 0) + before(income) - before(expense));
  let conducted = money((base?.amount ?? 0) + before(actual));
  const opening = projected;
  const ledger: DayMoneyLedger[] = [];
  const chart: CalendarCashPoint[] = [];
  const count = new Date(year, monthIndex + 1, 0).getDate();
  for (let day = 1; day <= count; day++) {
    const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayIncome = income.get(date) ?? 0;
    const dayExpense = expense.get(date) ?? 0;
    const closing = money(projected + dayIncome - dayExpense);
    conducted = money(conducted + (actual.get(date) ?? 0));
    ledger.push({
      date,
      day,
      income: dayIncome,
      expense: dayExpense,
      saldo: money(dayIncome - dayExpense),
      opening: projected,
      closing,
      hasGap: projected < 0 || closing < 0,
      payments: byDay.get(date) ?? [],
    });
    chart.push({ date, balance: closing, actual: date <= today ? conducted : null });
    projected = closing;
  }
  return { ledger, chart, opening };
}

const PREFIX = "rm-os-finance-opening:";
export function findOpeningAnchor(
  storage: Pick<Storage, "length" | "key" | "getItem">,
  monthKey: string,
  scope = "",
): OpeningAnchor | null {
  const prefix = scope ? `${PREFIX}scope:${scope}:` : PREFIX;
  let result: OpeningAnchor | null = null;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const month = key.slice(prefix.length);
    if (!/^\d{4}-\d{2}$/.test(month) || month > monthKey) continue;
    const raw = storage.getItem(key);
    if (raw == null || raw === "" || !Number.isFinite(Number(raw))) continue;
    const date = `${month}-01`;
    if (!result || date > result.date) result = { date, amount: Number(raw) };
  }
  return result;
}
export function openingAnchorKey(monthKey: string, scope = "") {
  return scope ? `${PREFIX}scope:${scope}:${monthKey}` : `${PREFIX}${monthKey}`;
}
