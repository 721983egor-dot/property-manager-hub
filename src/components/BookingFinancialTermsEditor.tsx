import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { formatAdeskMoney, formatFinanceDate } from "@/lib/finance";
import {
  bookingFinancialTermsProblem,
  previewBookingCollections,
  type BookingFinancialTerms,
} from "@/lib/booking-finance-terms";
import { rentalPeriodPrice, type RentalPriceTerms } from "@/lib/rental-period-price";
export function BookingFinancialTermsEditor({
  value,
  onChange,
  terms,
  rate,
  feeType,
  ownerName,
  payoutDay,
}: {
  value: BookingFinancialTerms;
  onChange: (value: BookingFinancialTerms) => void;
  terms: RentalPriceTerms;
  rate: number | null;
  feeType: "percent" | "amount";
  ownerName?: string | undefined;
  payoutDay: number | null;
}) {
  const problem = bookingFinancialTermsProblem(value, terms);
  const preview = useMemo(() => {
    try {
      return { rows: previewBookingCollections(terms, value, rate, feeType), error: null };
    } catch (e) {
      return { rows: [], error: e instanceof Error ? e.message : "Уточните условия" };
    }
  }, [terms, value, rate, feeType]);
  const patch = (p: Partial<BookingFinancialTerms>) => onChange({ ...value, ...p });
  const firstMonth = value.receipts_from.slice(0, 7) + "-01";
  const previousMonth = value.receipts_from
    ? new Date(
        Date.UTC(
          Number(value.receipts_from.slice(0, 4)),
          Number(value.receipts_from.slice(5, 7)) - 2,
          1,
          12,
        ),
      )
        .toISOString()
        .slice(0, 7)
    : terms.start_date.slice(0, 7);
  const payoutMonth = [terms.start_date.slice(0, 7), previousMonth].sort()[1]!;
  const payoutDate =
    payoutMonth &&
    `${payoutMonth}-${String(Math.min(payoutDay ?? 1, new Date(Date.UTC(Number(payoutMonth.slice(0, 4)), Number(payoutMonth.slice(5, 7)), 0)).getUTCDate())).padStart(2, "0")}`;
  return (
    <section className="rounded-lg border p-4 space-y-4" aria-label="Условия поступлений и выплат">
      <div>
        <h3 className="font-medium">Поступления и выплаты</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Все условия этой аренды — здесь. Календарь и финансы обновятся после сохранения. Получение
          денег и перевод собственнику отмечаются отдельно.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="booking-receipts-from">Первое новое поступление</Label>
          <Input
            id="booking-receipts-from"
            type="date"
            value={value.receipts_from}
            onChange={(e) => patch({ receipts_from: e.target.value })}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Если арендатор уже оплатил несколько месяцев, укажите следующую оплату. За более ранние
            месяцы новый приход не создаётся.
          </p>
        </div>
        <div>
          <Label>Как платит арендатор</Label>
          <Select
            value={String(value.collection_interval)}
            onValueChange={(v) =>
              patch({
                collection_interval: Number(v),
                ...(v === "0" && !value.collection_plan ? { collection_plan: preview.rows } : {}),
              })
            }
          >
            <SelectTrigger aria-label="Периодичность оплаты аренды">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 6, 12].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n === 1 ? "Каждый месяц" : `Раз в ${n} ${n < 5 ? "месяца" : "месяцев"}`}
                </SelectItem>
              ))}
              {![0, 1, 2, 3, 6, 12].includes(value.collection_interval) && (
                <SelectItem value={String(value.collection_interval)}>
                  Раз в {value.collection_interval} мес.
                </SelectItem>
              )}
              <SelectItem value="0">Отдельные согласованные суммы</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {value.collection_interval === 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Фиксированные суммы по договорённости. Они сохраняются при изменении цены объекта. Для
            автоматического пересчёта выберите оплату каждый месяц или раз в несколько месяцев.
          </p>
          {(value.collection_plan ?? []).map((p, i) => (
            <fieldset key={i} className="rounded border p-3 grid gap-2 sm:grid-cols-2">
              <legend className="text-sm px-1">Поступление {i + 1}</legend>
              <EditField
                label="С месяца"
                type="month"
                value={p.period.slice(0, 7)}
                onChange={(v) =>
                  patch({
                    collection_plan: value.collection_plan!.map((x, j) =>
                      j === i ? { ...x, period: v ? `${v}-01` : "" } : x,
                    ),
                  })
                }
              />
              <EditField
                label="По дату"
                type="date"
                value={p.through}
                onChange={(v) =>
                  patch({
                    collection_plan: value.collection_plan!.map((x, j) =>
                      j === i ? { ...x, through: v } : x,
                    ),
                  })
                }
              />
              <EditField
                label="Дата поступления"
                type="date"
                value={p.date}
                onChange={(v) =>
                  patch({
                    collection_plan: value.collection_plan!.map((x, j) =>
                      j === i ? { ...x, date: v } : x,
                    ),
                  })
                }
              />
              <Money
                label="Вся сумма, ₽"
                value={p.amount}
                onChange={(v) =>
                  patch({
                    collection_plan: value.collection_plan!.map((x, j) =>
                      j === i ? { ...x, amount: v } : x,
                    ),
                  })
                }
              />
              <Money
                label="Из них комиссия компании, ₽"
                value={p.company_fee}
                onChange={(v) =>
                  patch({
                    collection_plan: value.collection_plan!.map((x, j) =>
                      j === i ? { ...x, company_fee: v } : x,
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  patch({ collection_plan: value.collection_plan!.filter((_, j) => j !== i) })
                }
              >
                <Trash2 className="size-4" />
                Убрать поступление
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              patch({
                collection_plan: [
                  ...(value.collection_plan ?? []),
                  {
                    period: firstMonth,
                    through: terms.end_date,
                    date: value.receipts_from,
                    amount: 0,
                    company_fee: 0,
                  },
                ],
              })
            }
          >
            <Plus className="size-4" />
            Добавить поступление
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Платёж складывается из{" "}
          {value.collection_interval === 1
            ? "одного арендного месяца"
            : `${value.collection_interval} арендных месяцев`}
          . Сезонные цены и неполные периоды учитываются по дням. Изменение цены или комиссии
          пересчитает будущие неоплаченные платежи.
        </p>
      )}
      <details open={value.owner_rates.length > 0} className="space-y-3">
        <summary className="text-sm font-medium cursor-pointer">
          Особые суммы собственнику{" "}
          {value.owner_rates.length ? `· ${value.owner_rates.length}` : ""}
        </summary>
        <p className="text-xs text-muted-foreground">
          Обычно собственник получает аренду за вычетом комиссии объекта. Здесь можно задать
          фиксированную сумму в месяц, например 100 000 ₽ только на зимний сезон. За остальные даты
          действует обычная комиссия.
        </p>
        {value.owner_rates.map((r, i) => (
          <fieldset key={i} className="grid sm:grid-cols-2 gap-2 rounded border p-3">
            <legend className="text-sm px-1">Период {i + 1}</legend>
            <EditField
              label="С даты"
              type="date"
              value={r.from}
              onChange={(v) =>
                patch({
                  owner_rates: value.owner_rates.map((x, j) => (j === i ? { ...x, from: v } : x)),
                })
              }
            />
            <EditField
              label="По включительно"
              type="date"
              value={r.to}
              onChange={(v) =>
                patch({
                  owner_rates: value.owner_rates.map((x, j) => (j === i ? { ...x, to: v } : x)),
                })
              }
            />
            <Money
              label="Собственнику в месяц, ₽"
              value={r.owner_monthly}
              onChange={(v) =>
                patch({
                  owner_rates: value.owner_rates.map((x, j) =>
                    j === i ? { ...x, owner_monthly: v } : x,
                  ),
                })
              }
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => patch({ owner_rates: value.owner_rates.filter((_, j) => j !== i) })}
            >
              <Trash2 className="size-4" />
              Убрать период
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            patch({
              owner_rates: [
                ...value.owner_rates,
                { from: terms.start_date, to: terms.end_date, owner_monthly: NaN },
              ],
            })
          }
        >
          <Plus className="size-4" />
          Задать сумму собственнику
        </Button>
        {value.owner_rates.some((r) => r.owner_monthly === 0) && (
          <p role="alert" className="text-sm text-destructive">
            Собственнику задано 0 ₽: вся аренда за этот период станет доходом компании, независимо
            от процента комиссии. Чтобы действовал процент объекта, уберите этот особый период.
          </p>
        )}
      </details>
      <details open={value.prepaid_owner_payouts.length > 0} className="space-y-3">
        <summary className="text-sm font-medium cursor-pointer">
          Выплаты за уже оплаченную аренду{" "}
          {value.prepaid_owner_payouts.length ? `· ${value.prepaid_owner_payouts.length}` : ""}
        </summary>
        <p className="text-xs text-muted-foreground">
          Например, деньги получены раньше, но в ноябре ещё нужно выплатить собственнику 400 000 ₽.
          Здесь создаётся только выплата — без повторного прихода и комиссии.{" "}
          {ownerName
            ? `Собственник: ${ownerName}.`
            : "Сначала прикрепите собственника к объекту в контрагентах."}
        </p>
        {value.prepaid_owner_payouts.map((p, i) => (
          <fieldset key={i} className="grid sm:grid-cols-2 gap-2 rounded border p-3">
            <legend className="text-sm px-1">Выплата {i + 1}</legend>
            <EditField
              label="За месяц"
              type="month"
              value={p.period.slice(0, 7)}
              onChange={(v) =>
                patch({
                  prepaid_owner_payouts: value.prepaid_owner_payouts.map((x, j) =>
                    j === i ? { ...x, period: v ? `${v}-01` : "" } : x,
                  ),
                })
              }
            />
            <EditField
              label="Дата выплаты"
              type="date"
              value={p.date}
              onChange={(v) =>
                patch({
                  prepaid_owner_payouts: value.prepaid_owner_payouts.map((x, j) =>
                    j === i ? { ...x, date: v } : x,
                  ),
                })
              }
            />
            <Money
              label="Сумма собственнику, ₽"
              value={p.amount}
              onChange={(v) =>
                patch({
                  prepaid_owner_payouts: value.prepaid_owner_payouts.map((x, j) =>
                    j === i ? { ...x, amount: v } : x,
                  ),
                })
              }
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                patch({
                  prepaid_owner_payouts: value.prepaid_owner_payouts.filter((_, j) => j !== i),
                })
              }
            >
              <Trash2 className="size-4" />
              Убрать выплату
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!ownerName}
          onClick={() =>
            patch({
              prepaid_owner_payouts: [
                ...value.prepaid_owner_payouts,
                { period: payoutMonth + "-01", date: payoutDate, amount: 0 },
              ],
            })
          }
        >
          <Plus className="size-4" />
          Добавить выплату без прихода
        </Button>
      </details>
      {(problem || preview.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? preview.error}
        </p>
      )}
      {!!preview.rows.length && (
        <details open className="space-y-2">
          <summary className="text-sm font-medium cursor-pointer">
            Предварительный график · поступлений: {preview.rows.length}
          </summary>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Дата / период</th>
                  <th className="p-2">Приход</th>
                  <th className="p-2">Компания</th>
                  <th className="p-2">Собственник</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((p) => (
                  <tr key={p.period} className="border-b">
                    <td className="p-2">
                      {formatFinanceDate(p.date)}
                      <small className="block text-muted-foreground">
                        {formatFinanceDate(
                          value.collection_interval === 0
                            ? p.period
                            : rentalPeriodPrice(terms, p.period.slice(0, 7)).from,
                        )}{" "}
                        — {formatFinanceDate(p.through)}
                      </small>
                    </td>
                    <td className="p-2 whitespace-nowrap">{formatAdeskMoney(p.amount)}</td>
                    <td className="p-2 whitespace-nowrap">{formatAdeskMoney(p.company_fee)}</td>
                    <td className="p-2 whitespace-nowrap">
                      {formatAdeskMoney(p.amount - p.company_fee)}
                      {payoutDay && (
                        <small className="block text-muted-foreground">{payoutDay}-го числа</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Сумма собственнику указана до удержания его расходов. Полученные и частичные платежи
            сохраняют прежние условия; их фактические суммы смотрите в операциях.
          </p>
        </details>
      )}
    </section>
  );
}
function EditField({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm space-y-1 block">
      {label}
      <Input
        aria-label={label}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Money({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <EditField
      label={label}
      type="number"
      value={Number.isFinite(value) ? String(value) : ""}
      onChange={(v) => onChange(v === "" ? NaN : Number(v))}
    />
  );
}
