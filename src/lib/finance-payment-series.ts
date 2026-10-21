export type PaymentRepeatInterval = "month" | "week";
export type PaymentRepeatOptions = {
  interval: PaymentRepeatInterval;
  /** Total operations, including the original payment. */
  count?: number | undefined;
  untilDate?: string | undefined;
  /** Monthly repeats only. First operation keeps its own date. */
  paymentDay?: number | undefined;
};
const MAX_SERIES = 36;
function dateParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  if (
    !y ||
    !m ||
    !d ||
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) !== iso
  )
    throw new Error("Укажите корректную дату операции");
  return [y, m, d];
}
export function addMonthsIso(iso: string, months: number, paymentDay?: number) {
  const [y, m, d] = dateParts(iso);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(paymentDay ?? d, last));
  return date.toISOString().slice(0, 10);
}
export function addWeeksIso(iso: string, weeks: number) {
  const [y, m, d] = dateParts(iso);
  return new Date(Date.UTC(y, m - 1, d + 7 * weeks)).toISOString().slice(0, 10);
}
export function buildPaymentSeriesDates(
  startDate: string,
  opts?: PaymentRepeatOptions | null,
): string[] {
  dateParts(startDate);
  if (!opts) return [startDate];
  if (!["week", "month"].includes(opts.interval)) throw new Error("Выберите период повтора");
  if (
    opts.paymentDay !== undefined &&
    (opts.interval !== "month" ||
      !Number.isInteger(opts.paymentDay) ||
      opts.paymentDay < 1 ||
      opts.paymentDay > 31)
  )
    throw new Error("День ежемесячной оплаты — целое число от 1 до 31");
  if (
    opts.count !== undefined &&
    (!Number.isInteger(opts.count) || opts.count < 1 || opts.count > MAX_SERIES)
  )
    throw new Error("Укажите от 1 до 36 операций в серии");
  if (opts.untilDate) {
    dateParts(opts.untilDate);
    if (opts.untilDate < startDate) throw new Error("Дата окончания не раньше первой операции");
  }
  const dates = [startDate];
  const total = opts.untilDate ? MAX_SERIES : (opts.count ?? 1);
  for (let i = 1; i < total; i++) {
    const next =
      opts.interval === "week"
        ? addWeeksIso(startDate, i)
        : addMonthsIso(startDate, i, opts.paymentDay);
    if (opts.untilDate && next > opts.untilDate) break;
    dates.push(next);
  }
  return dates;
}
type SeriesEntry = {
  planned_date: string;
  status: string;
  paid_at?: string | null;
  paid_amount?: number | null;
  accrual_date?: string | null;
};
/** Only the first operation is a receipt/payment already entered by the user. */
export function buildPaymentSeriesEntries<T extends SeriesEntry>(
  input: T,
  opts?: PaymentRepeatOptions | null,
): T[] {
  return buildPaymentSeriesDates(input.planned_date, opts).map((planned, index) =>
    index === 0
      ? { ...input }
      : {
          ...input,
          planned_date: planned,
          status: "expected",
          paid_at: null,
          paid_amount: null,
          accrual_date: input.accrual_date
            ? opts?.interval === "week"
              ? addWeeksIso(input.accrual_date, index)
              : addMonthsIso(input.accrual_date, index)
            : null,
        },
  );
}
