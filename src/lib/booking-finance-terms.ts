import { rentalPeriodPrice, type RentalPriceTerms } from "./rental-period-price.ts";
export type OwnerMonthlyRate = { from: string; to: string; owner_monthly: number };
export type BookingCollection = {
  period: string;
  through: string;
  date: string;
  amount: number;
  company_fee: number;
};
export type PrepaidOwnerPayout = { period: string; date: string; amount: number };
export type BookingFinancialTerms = {
  receipts_from: string;
  collection_interval: number;
  owner_rates: OwnerMonthlyRate[];
  collection_plan: BookingCollection[] | null;
  prepaid_owner_payouts: PrepaidOwnerPayout[];
};
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dayAfter = (d: string, offset: number) =>
  new Date(Date.parse(d + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
const addMonths = (d: string, n: number) =>
  new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1 + n, 1, 12))
    .toISOString()
    .slice(0, 10);
export function defaultBookingFinancialTerms(terms: RentalPriceTerms): BookingFinancialTerms {
  return {
    receipts_from:
      terms.start_date && terms.end_date > terms.start_date
        ? rentalPeriodPrice(terms, terms.start_date.slice(0, 7)).due
        : terms.start_date,
    collection_interval: 1,
    owner_rates: [],
    collection_plan: null,
    prepaid_owner_payouts: [],
  };
}
export function bookingFinancialTermsProblem(
  f: BookingFinancialTerms,
  terms: RentalPriceTerms,
): string | null {
  if (!f.receipts_from || f.receipts_from < terms.start_date || f.receipts_from > terms.end_date)
    return "Первое новое поступление должно быть в сроке аренды";
  if (
    !Number.isInteger(f.collection_interval) ||
    f.collection_interval < 0 ||
    f.collection_interval > 12
  )
    return "Укажите периодичность от 1 до 12 месяцев";
  for (const r of f.owner_rates) {
    if (
      !r.from ||
      !r.to ||
      r.from < terms.start_date ||
      r.to > terms.end_date ||
      r.to < r.from ||
      !Number.isFinite(r.owner_monthly) ||
      r.owner_monthly < 0
    )
      return "Проверьте периоды и суммы собственнику";
    if (f.owner_rates.filter((x) => x.from <= r.to && x.to >= r.from).length > 1)
      return "Периоды фиксированной суммы собственнику пересекаются";
  }
  for (const p of f.prepaid_owner_payouts) {
    if (
      !p.period ||
      !p.date ||
      p.period.slice(8) !== "01" ||
      p.period < terms.start_date.slice(0, 7) + "-01" ||
      p.period >= f.receipts_from.slice(0, 7) + "-01" ||
      p.date < p.period ||
      p.date > terms.end_date ||
      !Number.isFinite(p.amount) ||
      p.amount <= 0
    )
      return "Выплаты за ранее оплаченную аренду задайте за месяцы до первого нового поступления";
    if (f.prepaid_owner_payouts.filter((x) => x.period === p.period).length > 1)
      return "Укажите одну выплату за каждый ранее оплаченный месяц";
  }
  if (f.collection_interval === 0) {
    if (!f.collection_plan?.length) return "Добавьте хотя бы одно поступление отдельного графика";
    for (const p of f.collection_plan) {
      if (
        !p.period ||
        !p.through ||
        !p.date ||
        p.period.slice(8) !== "01" ||
        p.period < terms.start_date.slice(0, 7) + "-01" ||
        p.period >= terms.end_date ||
        p.through < p.period ||
        p.through > terms.end_date ||
        p.date < f.receipts_from ||
        p.date > terms.end_date ||
        !Number.isFinite(p.amount) ||
        p.amount <= 0 ||
        !Number.isFinite(p.company_fee) ||
        p.company_fee < 0 ||
        p.company_fee > p.amount
      )
        return "Проверьте даты, сумму и комиссию каждого поступления";
      if (
        f.collection_plan.filter((x) => x.period <= p.through && x.through >= p.period).length > 1
      )
        return "Периоды поступлений пересекаются";
    }
  }
  return null;
}
/** Mirrors the server's day-prorated automatic schedule. Explicit agreements keep their totals. */
export function previewBookingCollections(
  terms: RentalPriceTerms,
  f: BookingFinancialTerms,
  rate: number | null,
  feeType: "percent" | "amount",
): BookingCollection[] {
  if (
    !terms.start_date ||
    !terms.end_date ||
    terms.end_date <= terms.start_date ||
    Number(terms.end_date.slice(0, 4)) - Number(terms.start_date.slice(0, 4)) > 20 ||
    !f.receipts_from ||
    bookingFinancialTermsProblem(f, terms)
  )
    return [];
  if (f.collection_interval === 0) return f.collection_plan ?? [];
  const rows: BookingCollection[] = [];
  const step = f.collection_interval;
  for (let m = f.receipts_from.slice(0, 7) + "-01"; m < terms.end_date; m = addMonths(m, step)) {
    const first = rentalPeriodPrice(terms, m.slice(0, 7));
    const due = m === f.receipts_from.slice(0, 7) + "-01" ? f.receipts_from : first.due;
    if (due < f.receipts_from) continue;
    let amount = 0,
      fee = 0,
      through = "";
    for (let i = 0; i < step; i++) {
      const c = rentalPeriodPrice(terms, addMonths(m, i).slice(0, 7));
      if (c.occupiedDays <= 0) continue;
      if (c.amount == null) throw new Error("Уточните цену на каждый день аренды");
      let monthlyFee = 0;
      if (!f.owner_rates.length) {
        monthlyFee =
          rate == null
            ? NaN
            : feeType === "percent"
              ? (c.amount * rate) / 100
              : (rate * c.occupiedDays) / c.cycleDays;
        if (!Number.isFinite(monthlyFee) || monthlyFee < 0 || monthlyFee > c.amount)
          throw new Error("Сумма собственнику или комиссия превышает аренду. Проверьте условия");
      } else
        for (const part of c.parts)
          for (let day = part.from; day < part.to; day = dayAfter(day, 1)) {
            const owner = f.owner_rates.find((r) => r.from <= day && r.to >= day);
            const nominal = owner
              ? part.monthlyRate - owner.owner_monthly
              : rate == null
                ? NaN
                : feeType === "percent"
                  ? (part.monthlyRate * rate) / 100
                  : rate;
            if (!Number.isFinite(nominal) || nominal < 0 || nominal > part.monthlyRate)
              throw new Error(
                "Сумма собственнику или комиссия превышает аренду. Проверьте условия",
              );
            monthlyFee += nominal / c.cycleDays;
          }
      amount += c.amount;
      fee += round(monthlyFee);
      through = dayAfter(c.to, -1);
    }
    if (amount > 0)
      rows.push({ period: m, through, date: due, amount: round(amount), company_fee: round(fee) });
  }
  return rows;
}
export function bookingFinancialSummary(f: BookingFinancialTerms) {
  const money = (v: number) => v.toLocaleString("ru-RU") + " ₽";
  return `Первое новое поступление ${f.receipts_from}; ${f.collection_interval === 0 ? "согласованные суммы: " + (f.collection_plan ?? []).map((p) => `${p.date}: ${money(p.amount)}, компания ${money(p.company_fee)}, за ${p.period}–${p.through}`).join("; ") : f.collection_interval === 1 ? "ежемесячная оплата" : `оплата раз в ${f.collection_interval} мес., автоматический пересчёт`}. Фиксированные суммы собственнику: ${f.owner_rates.map((r) => `${r.from}–${r.to}: ${money(r.owner_monthly)}/мес.`).join("; ") || "нет, комиссия по объекту"}. Выплаты за ранее оплаченную аренду: ${f.prepaid_owner_payouts.map((p) => `${p.date}: ${money(p.amount)} за ${p.period.slice(0, 7)}`).join("; ") || "нет"}. Это план, без отметки о получении или переводе денег.`;
}
