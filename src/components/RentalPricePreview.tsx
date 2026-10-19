import { rentalPeriodPrice, type RentalPriceTerms } from "@/lib/rental-period-price";
import { formatAdeskMoney, formatFinanceDate } from "@/lib/finance";
export function RentalPricePreview({ terms }: { terms: RentalPriceTerms }) {
  if (
    !terms.start_date ||
    !terms.end_date ||
    terms.end_date <= terms.start_date ||
    Number(terms.end_date.slice(0, 4)) - Number(terms.start_date.slice(0, 4)) > 20
  )
    return null;
  const rows = [];
  for (
    let y = Number(terms.start_date.slice(0, 4)), m = Number(terms.start_date.slice(5, 7)) - 1;
    `${y}-${String(m + 1).padStart(2, "0")}-01` < terms.end_date;
    m++
  ) {
    if (m === 12) {
      y++;
      m = 0;
    }
    const row = rentalPeriodPrice(terms, `${y}-${String(m + 1).padStart(2, "0")}`);
    if (row.occupiedDays > 0) rows.push(row);
  }
  return (
    <details className="rounded-lg border border-border p-3 mt-3">
      <summary className="cursor-pointer text-sm font-medium">
        Как рассчитаны платежи · {rows.length}
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Арендный месяц начинается {Number(terms.start_date.slice(8, 10))}-го, от даты заезда. Срок
        оплаты — {terms.payment_day}-го. День выезда не включён. При смене цены складываются части
        по дням; неполный месяц оплачивается пропорционально.
      </p>
      <div className="max-h-64 overflow-auto mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.from} className="border-b pb-3 text-sm">
            <div className="flex justify-between gap-3">
              <b>
                {formatFinanceDate(row.from)} — {formatFinanceDate(row.to)}
              </b>
              <b>{row.amount == null ? "Уточните цену" : formatAdeskMoney(row.amount)}</b>
            </div>
            <p className="text-xs text-muted-foreground">
              Оплата до {formatFinanceDate(row.due)} · {row.occupiedDays} из {row.cycleDays} дней
            </p>
            {row.problem ? (
              <p className="text-xs text-destructive">{row.problem}</p>
            ) : (
              row.parts.map((part) => (
                <p key={part.from} className="text-xs mt-1">
                  {formatAdeskMoney(part.monthlyRate)} × {part.days}/{row.cycleDays} ={" "}
                  {formatAdeskMoney(part.amount)}
                </p>
              ))
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
