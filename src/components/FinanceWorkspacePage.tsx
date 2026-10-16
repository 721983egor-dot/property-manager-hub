import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FinanceTabs } from "./FinanceTabs";
import { Button } from "./ui/button";
import { PaymentDialog } from "./PaymentDialog";
import { OwnerPayoutDialog } from "./OwnerPayoutDialog";
import PaymentAccountsChart from "./PaymentAccountsChart";
import {
  fetchPayments,
  fetchFinancePropertyOptions,
  financePropertyLabel,
  formatAdeskMoney,
  statusLabel,
  kindLabel,
  effectivePaymentStatus,
  type Payment,
} from "@/lib/finance";
import { financeToday, paymentFactAmount } from "@/lib/finance-payment-status";
import {
  companyPayments,
  companySummary,
  clientPayments,
  paymentPeriod,
} from "@/lib/finance-company-model";
import { buildFinanceCalendar } from "@/lib/finance-calendar-model";
import { fetchCounterparties, fetchObligations } from "@/lib/finance-counterparties";
import { fetchOwnerSettlements } from "@/lib/finance-owner-settlements";
import { fetchFinanceObjectAssignments } from "@/lib/finance-objects";
import {
  fetchFinanceClientRentals,
  refreshRentalSettlements,
  createRentalSchedule,
  saveRentalOwnerSettings,
} from "@/lib/finance-workspace";
import { fetchFinanceAccounts } from "@/lib/finance-accounts";
import { ownerSettlementState } from "@/lib/finance-owner-model";
import { fetchFinanceObjectProperties } from "@/lib/finance-rentals";
import { useFinanceToday } from "@/hooks/use-finance-today";
import "./finance-workspace.css";

type Mode = "company" | "owners" | "clients";
const money = formatAdeskMoney;
const periodLabel = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  });
export function FinanceWorkspacePage({ mode, clientId }: { mode: Mode; clientId?: string }) {
  const today = useFinanceToday(),
    qc = useQueryClient();
  const [month, setMonth] = useState(today.slice(0, 7)),
    [property, setProperty] = useState("all"),
    [query, setQuery] = useState(""),
    [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null),
    [adding, setAdding] = useState<{
      booking?: string;
      component?: "rent" | "utilities";
      direction?: "in" | "out";
    } | null>(null);
  const [selectedSettlement, setSelectedSettlement] = useState<string | null>(null),
    [payout, setPayout] = useState<{ id: string; remaining: number } | null>(null);
  const payments = useQuery({
    queryKey: ["payments", "workspace"],
    queryFn: () => fetchPayments(),
  });
  const rentals = useQuery({
    queryKey: ["finance-client-rentals"],
    queryFn: fetchFinanceClientRentals,
  });
  const properties = useQuery({
    queryKey: ["finance-property-options"],
    queryFn: fetchFinancePropertyOptions,
  });
  const settings = useQuery({
    queryKey: ["finance-object-settings"],
    queryFn: fetchFinanceObjectAssignments,
  });
  const parties = useQuery({
    queryKey: ["finance-counterparties"],
    queryFn: () => fetchCounterparties(),
  });
  const obligations = useQuery({
    queryKey: ["finance-obligations", "workspace"],
    queryFn: () => fetchObligations(),
  });
  const settlements = useQuery({
    queryKey: ["finance-owner-settlements", "workspace"],
    queryFn: () => fetchOwnerSettlements(),
  });
  const accounts = useQuery({ queryKey: ["finance-accounts"], queryFn: fetchFinanceAccounts });
  const invalidate = () => {
    for (const key of [
      "payments",
      "finance-obligations",
      "finance-owner-settlements",
      "finance-object-settings",
      "finance-object-properties",
      "finance-counterparties",
    ])
      void qc.invalidateQueries({ queryKey: [key] });
  };
  const refresh = useMutation({ mutationFn: refreshRentalSettlements, onSuccess: invalidate });
  const refreshRef = useRef(refresh.mutate);
  refreshRef.current = refresh.mutate;
  useEffect(() => {
    refreshRef.current();
  }, [today]);
  const [schedule, setSchedule] = useState<{ booking: string; account: string } | null>(null);
  const generate = useMutation({
    mutationFn: () => createRentalSchedule(schedule!.booking, schedule!.account),
    onSuccess: (n) => {
      setSchedule(null);
      invalidate();
      toast.success(`Добавлено платежей: ${n}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = payments.data ?? [],
    books = rentals.data ?? [],
    props = properties.data ?? [],
    owners = parties.data ?? [],
    cfg = settings.data ?? [];
  const source = property === "all" ? rows : rows.filter((p) => p.property_id === property);
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
  const summary = companySummary(source, month + "-01", end, today);
  const company = companyPayments(source),
    calendar = buildFinanceCalendar(
      company,
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)) - 1,
      today,
    );
  const currentCompany = company.filter((p) => p.planned_date.startsWith(month));
  const error = [payments, rentals, properties, settings, parties, obligations, settlements].find(
    (q) => q.error,
  )?.error;
  const loading = [payments, rentals, properties, settings, parties, obligations, settlements].some(
    (q) => q.isPending,
  );
  const title =
    mode === "company"
      ? "Деньги компании"
      : mode === "owners"
        ? "Расчёты с собственниками"
        : "Клиенты";
  const ownerRows = (settlements.data ?? [])
    .filter((s) => s.period.startsWith(month) && (property === "all" || s.property_id === property))
    .flatMap((s) => {
      const o = obligations.data?.find((o) => o.id === s.obligation_id);
      return o ? [{ ...s, obligation: o, state: ownerSettlementState(o, rows, today) }] : [];
    });
  const selected = ownerRows.find((s) => s.id === selectedSettlement) ?? ownerRows[0];
  const clientBooks = books.filter((b) => b.client_id === clientId);
  const client = clientBooks.find((b) => b.clients)?.clients;
  const received = clientId ? clientPayments(source, clientId) : [];
  const inMonth = received.filter((p) => paymentPeriod(p) === month);
  const clientFact = inMonth
    .filter((p) => p.direction === "in")
    .reduce((s, p) => s + paymentFactAmount(p, today), 0);
  const clientDue = inMonth
    .filter((p) => p.direction === "in" && p.planned_date <= today)
    .reduce((s, p) => s + Math.max(0, p.amount - paymentFactAmount(p, today)), 0);
  const nextRent = received
    .filter(
      (p) =>
        p.kind === "rent_in" && p.planned_date > today && paymentFactAmount(p, today) < p.amount,
    )
    .sort((a, b) => a.planned_date.localeCompare(b.planned_date))[0];
  const activeClientIds = [
    ...new Set(
      books
        .filter((b) => showHistory || (b.status === "active" && b.end_date > today))
        .map((b) => b.client_id),
    ),
  ].filter(Boolean);
  const propertyName = (id: string) => {
    const p = props.find((p) => p.id === id);
    return p ? financePropertyLabel(p) : "Объект";
  };
  const openPayment = (p: Payment) => {
    if (p.id.startsWith("company:"))
      toast.info("Комиссия — часть аренды. Открыто исходное поступление клиента.");
    if (p.rental_component === "owner_plan") {
      const o = obligations.data?.find((o) => o.id === p.obligation_id);
      if (o) setPayout({ id: o.id, remaining: ownerSettlementState(o, rows, today).remaining });
      return;
    }
    setEditing(rows.find((x) => x.id === p.id.replace(/^company:/, "")) ?? p);
  };
  return (
    <div className="fw">
      <div className="fw-head">
        <div>
          <h1>{title}</h1>
          <p>
            {mode === "company"
              ? "Доходы, расходы и результат вашей работы"
              : mode === "owners"
                ? "Начисления, выплаты и задолженность по объектам"
                : "Аренда и платежи после заключения договора"}
          </p>
        </div>
        {refresh.isPending && <p>Обновляем расчёты…</p>}
      </div>
      <FinanceTabs active={mode === "company" ? "dashboard" : mode} />
      <div className="fw-tools">
        <div className="flex gap-3 flex-wrap">
          <input
            type="month"
            aria-label="Месяц финансов"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
          <select
            aria-label="Объект финансов"
            value={property}
            onChange={(e) => setProperty(e.target.value)}
          >
            <option value="all">Все объекты</option>
            {props.map((p) => (
              <option key={p.id} value={p.id}>
                {financePropertyLabel(p)}
              </option>
            ))}
          </select>
        </div>
        {mode === "company" ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAdding({ direction: "in" })}>
              + Доход компании
            </Button>
            <Button onClick={() => setAdding({ direction: "out" })}>− Расход компании</Button>
          </div>
        ) : (
          <Button variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            Обновить расчёты
          </Button>
        )}
      </div>
      {refresh.error && (
        <div className="fw-error" role="alert">
          Не удалось обновить выплаты: {refresh.error.message}.{" "}
          <button className="underline" onClick={() => refresh.mutate()}>
            Повторить
          </button>
        </div>
      )}
      {error ? (
        <div role="alert" className="fw-error">
          Не удалось загрузить финансовые данные: {error.message}
        </div>
      ) : loading ? (
        <div className="fw-loading">Загрузка финансов…</div>
      ) : (
        <>
          {mode === "company" && (
            <>
              <div className="fw-metrics">
                <Metric
                  label="Доходы компании"
                  amount={summary.income}
                  positive
                  note="Комиссия и другие доходы компании"
                />
                <Metric
                  label="Расходы компании"
                  amount={summary.expense}
                  note="Ваши операционные расходы"
                />
                <Metric
                  label="Прибыль компании"
                  amount={summary.profit}
                  positive={summary.profit >= 0}
                  note="Доходы минус расходы по проведённым операциям"
                />
              </div>
              <div className="fw-cash">
                <span>
                  На счетах по операциям <b>{money(summary.bank)}</b>
                </span>
                <span>
                  Собственникам <b>{money(summary.ownerReserve)}</b>
                </span>
                <span>
                  Депозиты <b>{money(summary.deposits)}</b>
                </span>
                <span>
                  Деньги компании <b>{money(summary.available)}</b>
                </span>
                <Link to="/finance/calendar">Все движения →</Link>
              </div>
              <p className="mb-4">
                Остатки рассчитаны по внесённым операциям. Начальные остатки счетов из календаря
                сюда не включены.
              </p>
              {summary.unallocated > 0 && (
                <div className="fw-notice">
                  Не распределено арендных платежей: {summary.unallocated}. Привяжите их к аренде
                  клиента и укажите комиссию — пока вся их сумма зарезервирована, в доход компании
                  она не попадает. <Link to="/finance/clients">Открыть клиентов →</Link>
                </div>
              )}
              <PaymentAccountsChart
                title="Деньги компании по дням"
                ledger={calendar.ledger}
                chart={calendar.chart}
                today={today}
              />
              <div className="fw-panel">
                <h2>Операции компании</h2>
                <PaymentTable payments={currentCompany} onOpen={openPayment} />
                {!currentCompany.length && (
                  <p className="mt-5">В выбранном месяце операций компании нет.</p>
                )}
              </div>
            </>
          )}
          {mode === "owners" && (
            <>
              <div className="fw-metrics">
                <Metric
                  label="Начислено собственникам"
                  amount={ownerRows.reduce((s, r) => s + r.obligation.amount, 0)}
                  note="Аренда после комиссии + КУ"
                />
                <Metric
                  label="Уже перечислено"
                  amount={ownerRows.reduce((s, r) => s + r.state.paid, 0)}
                  note="По расчётам выбранного месяца"
                />
                <Metric
                  label="Просрочено собственникам"
                  amount={ownerRows
                    .filter((r) => r.state.overdue)
                    .reduce((s, r) => s + r.state.remaining, 0)}
                  negative
                  note="После даты выплаты, без подтверждения перевода"
                />
              </div>
              <div className="fw-panel">
                <h2>Собственники и выплаты</h2>
                <div className="fw-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>СОБСТВЕННИК</th>
                        <th>ОБЪЕКТ / ПЕРИОД</th>
                        <th>ДАТА ВЫПЛАТЫ</th>
                        <th>СТАТУС</th>
                        <th className="fw-right">ОСТАЛОСЬ</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {ownerRows.map((r) => (
                        <tr
                          key={r.id}
                          className="fw-click"
                          onClick={() => setSelectedSettlement(r.id)}
                        >
                          <td>
                            <Link
                              to="/finance/counterparties/$id"
                              params={{ id: r.obligation.counterparty_id }}
                            >
                              {owners.find((o) => o.id === r.obligation.counterparty_id)?.name ??
                                "Собственник"}
                            </Link>
                          </td>
                          <td>
                            {propertyName(r.property_id)}
                            <small>{periodLabel(r.period)}</small>
                          </td>
                          <td>{r.obligation.planned_date}</td>
                          <td>
                            <span className={`fw-badge ${r.state.overdue ? "overdue" : ""}`}>
                              {r.state.label}
                            </span>
                          </td>
                          <td className="fw-right">
                            {money(r.obligation.status === "closed" ? 0 : r.state.remaining)}
                          </td>
                          <td>
                            {r.obligation.status === "open" && r.state.remaining > 0 && (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPayout({ id: r.obligation.id, remaining: r.state.remaining });
                                }}
                              >
                                Подтвердить перевод
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!ownerRows.length && (
                  <p className="mt-5">
                    За этот месяц начислений нет. Укажите собственника и день выплаты ниже. После
                    поступления связанной аренды расчёт создастся автоматически.
                  </p>
                )}
              </div>
              {selected && (
                <div className="fw-split">
                  <div className="fw-panel">
                    <h2>Расчёт выплаты · {propertyName(selected.property_id)}</h2>
                    {(
                      [
                        ["Аренда от клиентов", "rent"],
                        ["КУ от клиентов", "utilities"],
                      ] as const
                    ).map(([label, component]) => (
                      <div className="fw-calc" key={component}>
                        <span>{label}</span>
                        <b>
                          {money(
                            rows
                              .filter(
                                (p) =>
                                  p.property_id === selected.property_id &&
                                  p.rental_period === selected.period &&
                                  p.rental_component === component,
                              )
                              .reduce((s, p) => s + paymentFactAmount(p, today), 0),
                          )}
                        </b>
                      </div>
                    ))}
                    <div className="fw-calc">
                      <span>Комиссия компании</span>
                      <b>
                        −
                        {money(
                          rows
                            .filter(
                              (p) =>
                                p.property_id === selected.property_id &&
                                p.rental_period === selected.period &&
                                p.rental_component === "rent",
                            )
                            .reduce(
                              (s, p) =>
                                s + (p.company_fee ?? 0) * (paymentFactAmount(p, today) / p.amount),
                              0,
                            ),
                        )}
                      </b>
                    </div>
                    <div className="fw-calc fw-total">
                      <span>Начислено собственнику</span>
                      <span>{money(selected.obligation.amount)}</span>
                    </div>
                    <p>
                      КУ перечисляются полностью, комиссия удерживается только с аренды.
                      {!selected.automatic &&
                        " Это ранее созданный ручной расчёт; автоматический пересчёт его не изменяет."}
                    </p>
                  </div>
                  <div className="fw-panel">
                    <h2>Выплата за {periodLabel(selected.period)}</h2>
                    <div className="fw-calc fw-total">
                      <span>Осталось выплатить</span>
                      <span>{money(selected.state.remaining)}</span>
                    </div>
                    <p>
                      Дата выплаты: {selected.obligation.planned_date}. Долг погашается только
                      подтверждённым переводом.
                    </p>
                    {selected.state.overdue && (
                      <div className="fw-notice">
                        Срок выплаты прошёл. Задолженность перед собственником сохраняется.
                      </div>
                    )}
                    {selected.obligation.status === "open" && selected.state.remaining > 0 && (
                      <div className="fw-actions">
                        <Button
                          onClick={() =>
                            setPayout({
                              id: selected.obligation.id,
                              remaining: selected.state.remaining,
                            })
                          }
                        >
                          Подтвердить перевод / часть
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {rows.some(
                (p) =>
                  p.kind === "owner_payout" && !p.obligation_id && p.planned_date.startsWith(month),
              ) && (
                <div className="fw-notice">
                  Есть выплаты собственникам без привязки к расчёту. По этим объектам автоматическое
                  начисление за этот месяц остановлено, чтобы не создать повторный долг. Проверьте
                  историю в разделе «Все движения» и ранее созданные расчёты в карточке объекта.
                </div>
              )}
              <RentalOwnerSettings
                properties={props}
                parties={owners}
                settings={cfg}
                onSaved={invalidate}
              />
            </>
          )}
          {mode === "clients" && !clientId && (
            <>
              <div className="fw-tools">
                <input
                  aria-label="Поиск клиента"
                  placeholder="Имя или телефон клиента"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <label className="text-sm">
                  <input
                    type="checkbox"
                    checked={showHistory}
                    onChange={(e) => setShowHistory(e.target.checked)}
                  />{" "}
                  Показать завершённые аренды
                </label>
              </div>
              <div className="fw-panel">
                <h2>Клиенты с оформленной арендой</h2>
                <div className="fw-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>КЛИЕНТ</th>
                        <th>ОБЪЕКТЫ</th>
                        <th>ПОЛУЧЕНО ЗА МЕСЯЦ</th>
                        <th>БЛИЖАЙШАЯ ОПЛАТА</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {activeClientIds.map((id) => {
                        const bs = books.filter(
                            (b) =>
                              b.client_id === id &&
                              (property === "all" || b.property_id === property),
                          ),
                          c = bs.find((b) => b.clients)?.clients;
                        if (
                          !bs.length ||
                          !c ||
                          !`${c.full_name} ${c.phone}`.toLowerCase().includes(query.toLowerCase())
                        )
                          return null;
                        const ps = clientPayments(source, id),
                          next = ps
                            .filter((p) => p.planned_date > today && p.direction === "in")
                            .sort((a, b) => a.planned_date.localeCompare(b.planned_date))[0];
                        return (
                          <tr key={id}>
                            <td>
                              <Link to="/finance/clients/$id" params={{ id }}>
                                {c.full_name}
                              </Link>
                              <small>{c.phone}</small>
                            </td>
                            <td>
                              {[...new Set(bs.map((b) => propertyName(b.property_id)))].join(", ")}
                            </td>
                            <td>
                              {money(
                                ps
                                  .filter((p) => paymentPeriod(p) === month && p.direction === "in")
                                  .reduce((s, p) => s + paymentFactAmount(p, today), 0),
                              )}
                            </td>
                            <td>
                              {next
                                ? `${next.planned_date} · ${money(next.amount)}`
                                : "График не сформирован"}
                            </td>
                            <td>
                              <Link to="/finance/clients/$id" params={{ id }}>
                                Открыть →
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!activeClientIds.length && (
                  <p className="mt-5">
                    Нет действующих аренд. Завершённые договоры доступны по переключателю выше.
                  </p>
                )}
              </div>
            </>
          )}
          {mode === "clients" && clientId && (
            <>
              <Link to="/finance/clients" className="fw-link">
                ← Все клиенты
              </Link>
              {!client ? (
                <div className="fw-panel mt-5">
                  <p>Клиент с оформленной арендой не найден.</p>
                </div>
              ) : (
                <>
                  <div className="fw-panel mt-5">
                    <div className="fw-head">
                      <div>
                        <h2>{client.full_name}</h2>
                        <p>{client.phone}</p>
                      </div>
                      <Link to="/crm/clients/$id" params={{ id: clientId }} className="fw-link">
                        Открыть контакт →
                      </Link>
                    </div>
                    {clientBooks.map((b) => (
                      <div key={b.id} className="border-t mt-5 pt-5">
                        <div className="fw-details">
                          <div>
                            <small>Объект</small>
                            <b>{propertyName(b.property_id)}</b>
                          </div>
                          <div>
                            <small>Срок договора</small>
                            <b>
                              {b.start_date} — {b.end_date}
                            </b>
                          </div>
                          <div>
                            <small>Аренда</small>
                            <b>
                              {b.price_month == null ? "По периодам" : money(b.price_month)} ·{" "}
                              {b.payment_day}-го
                            </b>
                          </div>
                          <div>
                            <small>Собственник</small>
                            <b>
                              {owners.find(
                                (o) =>
                                  o.id ===
                                  cfg.find((c) => c.property_id === b.property_id)
                                    ?.owner_counterparty_id,
                              )?.name ?? "Укажите в расчётах с собственниками"}
                            </b>
                          </div>
                        </div>
                        <div className="fw-actions">
                          <Button
                            variant="outline"
                            onClick={() =>
                              setAdding({ booking: b.id, component: "rent", direction: "in" })
                            }
                          >
                            + Арендная плата
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              setAdding({ booking: b.id, component: "utilities", direction: "in" })
                            }
                          >
                            + КУ
                          </Button>
                          {b.status === "active" && (
                            <Button
                              variant="outline"
                              onClick={() => setSchedule({ booking: b.id, account: "" })}
                            >
                              Сформировать график аренды
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="fw-metrics">
                    <Metric
                      label={`Получено за ${month}`}
                      amount={clientFact}
                      note="Поступления от клиента"
                    />
                    <Metric
                      label="Не оплачено за месяц"
                      amount={clientDue}
                      positive={clientDue === 0}
                      note="По внесённым операциям, срок которых наступил"
                    />
                    <Metric
                      label={
                        nextRent
                          ? `Следующая аренда · ${nextRent.planned_date}`
                          : "Следующая аренда"
                      }
                      amount={nextRent?.amount ?? 0}
                      note={
                        nextRent ? "Плановый платёж в календаре" : "Сформируйте график по договору"
                      }
                    />
                  </div>
                  <div className="fw-panel">
                    <h2>Платежи клиента · все периоды</h2>
                    <PaymentTable payments={received} onOpen={openPayment} />
                    {!received.length && (
                      <p className="mt-5">
                        Платежей пока нет. Сформируйте график аренды или добавьте поступление.
                      </p>
                    )}
                  </div>
                  <div className="fw-panel">
                    <h2>Распределение поступлений за {month}</h2>
                    <div className="fw-calc">
                      <span>Комиссия компании</span>
                      <b className="fw-positive">
                        {money(
                          inMonth.reduce(
                            (s, p) =>
                              s +
                              (p.rental_component === "rent"
                                ? ((p.company_fee ?? 0) * paymentFactAmount(p, today)) / p.amount
                                : 0),
                            0,
                          ),
                        )}
                      </b>
                    </div>
                    <p>
                      Состояние перевода собственнику смотрите в{" "}
                      <Link to="/finance/owners" className="fw-link">
                        расчётах с собственниками →
                      </Link>
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
      <PaymentDialog
        open={!!editing || !!adding}
        onOpenChange={(v) => {
          if (!v) {
            setEditing(null);
            setAdding(null);
          }
        }}
        payment={editing}
        defaultCompany={mode === "company"}
        defaultDirection={adding?.direction}
        defaultBookingId={adding?.booking}
        defaultRentalComponent={adding?.component}
        defaultPropertyId={
          adding?.booking
            ? books.find((b) => b.id === adding.booking)?.property_id
            : property === "all"
              ? undefined
              : property
        }
      />
      {payout && (
        <OwnerPayoutDialog
          obligationId={payout.id}
          remaining={payout.remaining}
          onClose={() => setPayout(null)}
        />
      )}
      {schedule && (
        <div
          className="fw-panel fixed z-50 inset-x-4 top-1/3 mx-auto max-w-lg shadow-lg"
          role="dialog"
          aria-modal="true"
          aria-label="Сформировать график аренды"
        >
          <h2>График ежемесячной аренды</h2>
          <p className="my-4">
            Добавим платежи с текущего месяца до конца договора, максимум на 36 месяцев.
            Существующие поступления не дублируются. Даты сегодня и в прошлом считаются проведёнными
            по принятому правилу учёта; проверьте первый месяц.
          </p>
          <select
            aria-label="Счёт графика аренды"
            className="w-full"
            value={schedule.account}
            onChange={(e) => setSchedule({ ...schedule, account: e.target.value })}
          >
            <option value="">Выберите счёт поступления</option>
            {accounts.data
              ?.filter((a) => !a.archived)
              .map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
          </select>
          {accounts.error && <p role="alert">Не удалось загрузить счета</p>}
          <div className="fw-actions">
            <Button
              disabled={generate.isPending || !schedule.account}
              onClick={() => generate.mutate()}
            >
              Сформировать
            </Button>
            <Button
              variant="outline"
              disabled={generate.isPending}
              onClick={() => setSchedule(null)}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
function Metric({
  label,
  amount,
  note,
  positive,
  negative,
}: {
  label: string;
  amount: number;
  note: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="fw-metric">
      <label>{label}</label>
      <strong className={negative && amount > 0 ? "fw-negative" : positive ? "fw-positive" : ""}>
        {money(amount)}
      </strong>
      <small>{note}</small>
    </div>
  );
}
function PaymentTable({ payments, onOpen }: { payments: Payment[]; onOpen: (p: Payment) => void }) {
  const today = financeToday();
  return (
    <div className="fw-table-wrap">
      <table>
        <thead>
          <tr>
            <th>ДАТА</th>
            <th>НАЗНАЧЕНИЕ</th>
            <th>ОБЪЕКТ / КЛИЕНТ</th>
            <th>СТАТУС</th>
            <th className="fw-right">СУММА</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td>{p.planned_date}</td>
              <td>
                {p.id.startsWith("company:")
                  ? "Комиссия за управление"
                  : p.rental_component === "utilities"
                    ? "Коммунальные услуги"
                    : (p.article?.name ?? kindLabel(p.kind))}
                <small>{p.comment}</small>
              </td>
              <td>
                {p.property ? financePropertyLabel(p.property) : "Компания"}
                {p.client_id && (
                  <small>
                    <Link to="/finance/clients/$id" params={{ id: p.client_id }}>
                      {p.client?.full_name ?? p.counterparty_name}
                    </Link>
                  </small>
                )}
              </td>
              <td>
                <span className={`fw-badge ${effectivePaymentStatus(p, today)}`}>
                  {statusLabel(effectivePaymentStatus(p, today))}
                </span>
              </td>
              <td className={`fw-right ${p.direction === "in" ? "fw-positive" : ""}`}>
                {money(p.direction === "in" ? p.amount : -p.amount)}
              </td>
              <td>
                <button className="fw-link" onClick={() => onOpen(p)}>
                  Открыть
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function RentalOwnerSettings({
  properties,
  parties,
  settings,
  onSaved,
}: {
  properties: Awaited<ReturnType<typeof fetchFinancePropertyOptions>>;
  parties: Awaited<ReturnType<typeof fetchCounterparties>>;
  settings: Awaited<ReturnType<typeof fetchFinanceObjectAssignments>>;
  onSaved: () => void;
}) {
  const [property, setProperty] = useState(""),
    [owner, setOwner] = useState(""),
    [day, setDay] = useState("10"),
    [fee, setFee] = useState(""),
    [feeType, setFeeType] = useState<"percent" | "amount">("percent"),
    [newOwner, setNewOwner] = useState("");
  const feeProperties = useQuery({
    queryKey: ["finance-object-properties"],
    queryFn: () => fetchFinanceObjectProperties(),
  });
  const [newOwnerId, setNewOwnerId] = useState(() => crypto.randomUUID());
  const save = useMutation({
    mutationFn: async () => {
      await saveRentalOwnerSettings({
        propertyId: property,
        ownerId: owner === "new" ? newOwnerId : owner,
        day: Number(day),
        fee: Number(fee),
        feeType,
        ...(owner === "new" ? { ownerName: newOwner } : {}),
      });
    },
    onSuccess: () => {
      onSaved();
      if (owner === "new") {
        setOwner(newOwnerId);
        setNewOwnerId(crypto.randomUUID());
        setNewOwner("");
      }
      toast.success("Условия сохранены");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="fw-panel">
      <h2>Условия расчётов по объекту</h2>
      <p>
        Собственник, день выплаты и комиссия компании. Если комиссия уже установлена при заключении
        договора, для него действует договорная комиссия.
      </p>
      <div className="fw-tools">
        <select
          aria-label="Объект условий выплаты"
          value={property}
          onChange={(e) => {
            setProperty(e.target.value);
            const cfg = settings.find((s) => s.property_id === e.target.value),
              p = feeProperties.data?.find((p) => p.id === e.target.value);
            setOwner(cfg?.owner_counterparty_id ?? "");
            setDay(String(cfg?.payout_day ?? 10));
            setFee(p?.management_fee_value == null ? "" : String(p.management_fee_value));
            setFeeType(p?.management_fee_type ?? "percent");
          }}
        >
          <option value="">Выберите объект</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {financePropertyLabel(p)}
            </option>
          ))}
        </select>
        <select
          aria-label="Собственник для выплаты"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="">Выберите собственника</option>
          {parties
            .filter((p) => p.kind === "owner" || p.id === owner)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          <option value="new">+ Новый собственник</option>
        </select>
        {owner === "new" && (
          <input
            aria-label="Имя собственника"
            placeholder="Имя собственника"
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
          />
        )}
        <label className="text-sm">
          День выплаты{" "}
          <input
            aria-label="День выплаты собственнику"
            className="w-20"
            type="number"
            min="1"
            max="31"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Комиссия{" "}
          <input
            aria-label="Комиссия компании"
            className="w-24"
            type="number"
            min="0"
            step="0.01"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </label>
        <select
          aria-label="Тип комиссии"
          value={feeType}
          onChange={(e) => setFeeType(e.target.value as "percent" | "amount")}
        >
          <option value="percent">% от аренды</option>
          <option value="amount">₽ в месяц</option>
        </select>
        <Button
          disabled={
            save.isPending ||
            !property ||
            !owner ||
            (owner === "new" && !newOwner.trim()) ||
            !fee.trim() ||
            !Number.isFinite(Number(fee)) ||
            Number(fee) < 0 ||
            (feeType === "percent" && Number(fee) > 100) ||
            !Number.isInteger(Number(day)) ||
            Number(day) < 1 ||
            Number(day) > 31
          }
          onClick={() => save.mutate()}
        >
          Сохранить условия
        </Button>
      </div>
      <p>
        Для 29–31 числа в коротком месяце используется последний день месяца. Сохранённая комиссия
        проведённых платежей не меняется задним числом.
      </p>
    </div>
  );
}
