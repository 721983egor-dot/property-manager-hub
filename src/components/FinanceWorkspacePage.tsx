import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FinanceTabs } from "./FinanceTabs";
import { Button } from "./ui/button";
import { PaymentDialog } from "./PaymentDialog";
import { BookingDialog } from "./BookingDialog";
import { fetchBooking } from "@/lib/bookings";
import { OwnerPayoutDialog } from "./OwnerPayoutDialog";
import { FinanceOverview } from "./FinanceOverview";
import {
  fetchPayments,
  fetchFinancePropertyOptions,
  financePropertyLabel,
  formatAdeskMoney,
  statusLabel,
  rentalPaymentLabel,
  effectivePaymentStatus,
  type Payment,
} from "@/lib/finance";
import { financeToday, paymentFactAmount } from "@/lib/finance-payment-status";
import {
  ownerCashPayments,
  ownerRentalIncome,
  rentalInstallmentSummary,
  companyPayments,
  clientPayments,
  paymentPeriod,
} from "@/lib/finance-company-model";

import { fetchCounterparties, fetchObligations } from "@/lib/finance-counterparties";
import { fetchOwnerSettlements } from "@/lib/finance-owner-settlements";
import { fetchFinanceObjectAssignments } from "@/lib/finance-objects";
import { fetchFinanceClientRentals, refreshRentalSettlements } from "@/lib/finance-workspace";
import { ownerSettlementState } from "@/lib/finance-owner-model";
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
export function FinanceWorkspacePage({
  mode,
  clientId: routeClientId,
  embedded,
  scope,
  onBack,
  onOwners,
}: {
  mode: Mode;
  clientId?: string | undefined;
  embedded?: boolean;
  onBack?: () => void;
  onOwners?: () => void;
  scope?: { month: string; property: string };
}) {
  const today = useFinanceToday(),
    qc = useQueryClient();
  const [localMonth, setMonth] = useState(today.slice(0, 7)),
    [localProperty, setProperty] = useState("all"),
    [query, setQuery] = useState(""),
    [showHistory, setShowHistory] = useState(false);
  const month = scope?.month ?? localMonth;
  const property = scope?.property ?? localProperty;
  const [detail, setDetail] = useState<"company" | "all" | "clients" | "owners">("company");
  const [showDetails, setShowDetails] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showDetails) detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showDetails, detail]);
  const [inlineClient, setInlineClient] = useState<string>();
  const [contractId, setContractId] = useState<string | null>(null);
  const contract = useQuery({
    queryKey: ["booking-finance-editor", contractId],
    queryFn: () => fetchBooking(contractId!),
    enabled: !!contractId,
  });
  const clientId = routeClientId ?? inlineClient;
  const [operationDate, setOperationDate] = useState("");
  const [editing, setEditing] = useState<Payment | null>(null),
    [adding, setAdding] = useState<{
      booking?: string;
      component?: "rent" | "utilities" | "deposit";
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
    if (!embedded) refreshRef.current();
  }, [today, embedded]);
  const rows = payments.data ?? [],
    books = rentals.data ?? [],
    props = properties.data ?? [],
    owners = parties.data ?? [],
    cfg = settings.data ?? [];
  const source = property === "all" ? rows : rows.filter((p) => p.property_id === property);
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
  const company = companyPayments(source);
  const bank = ownerCashPayments(source, cfg, settlements.data ?? []);
  const visiblePayments = (detail === "company" ? company : bank).filter(
    (p) =>
      p.planned_date.startsWith(month) &&
      (!operationDate.startsWith(month) || p.planned_date === operationDate),
  );
  const error = [payments, rentals, properties, settings, parties, obligations, settlements].find(
    (q) => q.error,
  )?.error;
  const loading = [payments, rentals, properties, settings, parties, obligations, settlements].some(
    (q) => q.isPending,
  );
  const title =
    mode === "company"
      ? "Обзор финансов"
      : mode === "owners"
        ? "Расчёты с собственниками"
        : "Клиенты";
  const ownerRows = (settlements.data ?? [])
    .filter((s) => s.period.startsWith(month) && (property === "all" || s.property_id === property))
    .flatMap((s) => {
      const o = obligations.data?.find((o) => o.id === s.obligation_id);
      return o ? [{ ...s, obligation: o, state: ownerSettlementState(o, rows, today) }] : [];
    });
  const ownerIncome = ownerRentalIncome(source, month, undefined, today);
  const selected = ownerRows.find((s) => s.id === selectedSettlement) ?? ownerRows[0];
  const selectedIncome = selected
    ? ownerRentalIncome(
        selected.booking_id ? rows.filter((p) => p.booking_id === selected.booking_id) : rows,
        selected.period.slice(0, 7),
        selected.property_id,
        today,
      )
    : null;
  const clientBooks = books.filter(
    (b) => b.client_id === clientId && (property === "all" || b.property_id === property),
  );
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
    if (p.id.startsWith("owner-forecast:")) {
      setMonth(paymentPeriod(p));
      setDetail("owners");
      setShowDetails(true);
      toast.info(
        "Прогноз выплаты по графику аренды. После поступления денег появится расчёт для подтверждения перевода.",
      );
      return;
    }
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
    <div className={embedded ? "fw-embedded" : "fw"}>
      {!embedded && (
        <>
          <div className="fw-head">
            <div>
              <h1>{title}</h1>
              <p>
                {mode === "company"
                  ? "Результат компании и деньги, которыми вы распоряжаетесь"
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
              <Button
                variant="outline"
                disabled={refresh.isPending}
                onClick={() => refresh.mutate()}
              >
                Обновить расчёты
              </Button>
            )}
          </div>
        </>
      )}
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
              <FinanceOverview
                payments={rows}
                settings={cfg}
                settlements={settlements.data ?? []}
                month={month}
                today={today}
                propertyId={property}
                onOpen={openPayment}
                onClients={() => {
                  setDetail("clients");
                  setShowDetails(true);
                }}
                onOwners={() => {
                  setMonth(today.slice(0, 7));
                  setDetail("owners");
                  setShowDetails(true);
                }}
              />
              <Button
                variant="outline"
                aria-expanded={showDetails}
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? "Скрыть детали" : "Операции, клиенты и расчёты"}
              </Button>
              {showDetails && (
                <div ref={detailsRef}>
                  <div className="fw-section-switch" aria-label="Детали финансов">
                    {(
                      [
                        ["all", "Все операции"],
                        ["company", "Только компания"],
                        ["clients", "Клиенты"],
                        ["owners", "Выплаты собственникам"],
                      ] as const
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        variant={detail === value ? "default" : "outline"}
                        aria-pressed={detail === value}
                        onClick={() => setDetail(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  {detail === "owners" || detail === "clients" ? (
                    <FinanceWorkspacePage
                      key={detail}
                      mode={detail}
                      onBack={() => setInlineClient(undefined)}
                      onOwners={() => setDetail("owners")}
                      clientId={detail === "clients" ? inlineClient : undefined}
                      embedded
                      scope={{ month, property }}
                    />
                  ) : (
                    <div className="fw-panel">
                      <div className="fw-panel-head">
                        <h2>{detail === "company" ? "Операции компании" : "Все операции"}</h2>
                        <label className="text-sm">
                          Дата{" "}
                          <input
                            type="date"
                            aria-label="Дата операций"
                            min={month + "-01"}
                            max={end}
                            value={operationDate.startsWith(month) ? operationDate : ""}
                            onChange={(e) => setOperationDate(e.target.value)}
                          />
                        </label>
                        {operationDate && (
                          <Button variant="ghost" onClick={() => setOperationDate("")}>
                            Весь месяц
                          </Button>
                        )}
                      </div>
                      <PaymentTable
                        payments={visiblePayments}
                        onOpen={openPayment}
                        onClient={(id) => {
                          setDetail("clients");
                          setInlineClient(id);
                        }}
                      />
                      {!visiblePayments.length && (
                        <p className="mt-5">За выбранный период операций нет.</p>
                      )}
                      <p className="mt-4">
                        Платежи с пометкой «Бронь» связаны с договором аренды. Остальные — отдельные
                        операции, расчёты и прогнозы выплат.{" "}
                        <Link to="/finance/calendar" className="fw-link">
                          Открыть сетку календаря →
                        </Link>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {mode === "owners" && (
            <>
              <div className="fw-metrics">
                <Metric
                  label="Доход собственников от аренды"
                  amount={ownerIncome.netRent}
                  positive
                  note="Полученная аренда после комиссии, без КУ"
                />
                <Metric
                  label="Получено КУ"
                  amount={ownerIncome.utilities}
                  note="Возмещение КУ — отдельно от дохода"
                />
                <Metric
                  label="Начислено к переводу"
                  amount={ownerRows.reduce((s, r) => s + r.obligation.amount, 0)}
                  note="Аренда после комиссии + КУ"
                />
                <Metric
                  label="Уже перечислено"
                  amount={ownerRows.reduce((s, r) => s + r.state.paid, 0)}
                  note="По расчётам выбранного месяца"
                />
                <Metric
                  label="Осталось выплатить"
                  amount={ownerRows
                    .filter((r) => r.obligation.status === "open")
                    .reduce((s, r) => s + r.state.remaining, 0)}
                  note="Включая выплаты, срок которых ещё не наступил"
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
              {ownerIncome.unallocatedRent > 0 && (
                <div className="fw-notice">
                  Аренда без распределения: {money(ownerIncome.unallocatedRent)}. Укажите привязку к
                  брони и комиссию — до этого доход собственника по этим платежам не определён.
                </div>
              )}
              <div className="fw-panel">
                <h2>Собственники и выплаты</h2>
                <div className="fw-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>СОБСТВЕННИК</th>
                        <th>ОБЪЕКТ / ПЕРИОД</th>
                        <th className="fw-right">ДОХОД ОТ АРЕНДЫ</th>
                        <th className="fw-right">КУ</th>
                        <th className="fw-right">РАСХОДЫ СОБСТВЕННИКА</th>
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
                          <td className="fw-right">
                            {money(
                              ownerRentalIncome(
                                r.booking_id
                                  ? rows.filter((p) => p.booking_id === r.booking_id)
                                  : rows,
                                r.period.slice(0, 7),
                                r.property_id,
                                today,
                              ).netRent,
                            )}
                          </td>
                          <td className="fw-right">
                            {money(
                              ownerRentalIncome(
                                r.booking_id
                                  ? rows.filter((p) => p.booking_id === r.booking_id)
                                  : rows,
                                r.period.slice(0, 7),
                                r.property_id,
                                today,
                              ).utilities,
                            )}
                          </td>
                          <td className="fw-right">{money(r.expense_amount ?? 0)}</td>
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
                    <div className="fw-calc">
                      <span>Полученная аренда с известной комиссией</span>
                      <b>{money(selectedIncome!.rent)}</b>
                    </div>
                    <div className="fw-calc">
                      <span>Комиссия компании</span>
                      <b>−{money(selectedIncome!.commission)}</b>
                    </div>
                    <div className="fw-calc fw-total">
                      <span>Доход собственника от аренды</span>
                      <span>{money(selectedIncome!.netRent)}</span>
                    </div>
                    <div className="fw-calc">
                      <span>КУ · отдельно от дохода</span>
                      <b>{money(selectedIncome!.utilities)}</b>
                    </div>
                    {selectedIncome!.unallocatedRent > 0 && (
                      <div className="fw-notice">
                        Не распределено аренды: {money(selectedIncome!.unallocatedRent)}. Доход по
                        ней пока не определён.
                      </div>
                    )}
                    <div className="fw-calc">
                      <span>Расходы за счёт собственника</span>
                      <b>−{money(selected.expense_amount ?? 0)}</b>
                    </div>
                    <div className="fw-calc fw-total">
                      <span>К перечислению после расходов</span>
                      <span>{money(selected.obligation.amount)}</span>
                    </div>
                    <p>
                      Доход показан по полученной аренде после комиссии, до прочих расходов
                      собственника. КУ перечисляются полностью и в доход не включены.
                      {!selected.automatic &&
                        " Арендная сумма задана вручную; оплаченные расходы учитываются отдельно."}
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
                  p.kind === "owner_payout" &&
                  !p.obligation_id &&
                  p.planned_date.startsWith(month) &&
                  (property === "all" || p.property_id === property),
              ) && (
                <div className="fw-notice">
                  Есть выплаты собственникам без привязки к расчёту. По этим объектам автоматическое
                  начисление за этот месяц остановлено, чтобы не создать повторный долг. Проверьте
                  историю в разделе «Все движения» и ранее созданные расчёты в карточке объекта.
                </div>
              )}
              <div className="fw-notice">
                Собственника и его объекты указывайте в{" "}
                <Link to="/finance/counterparties">контрагентах</Link>. День выплаты и условия
                конкретной аренды задаются в брони календаря или карточки объекта.
              </div>
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
                              <button className="fw-link" onClick={() => setInlineClient(id)}>
                                {c.full_name}
                              </button>
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
                              <button className="fw-link" onClick={() => setInlineClient(id)}>
                                Открыть →
                              </button>
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
              {routeClientId && !embedded ? (
                <Link to="/finance/clients" className="fw-link">
                  ← Все клиенты
                </Link>
              ) : (
                <button
                  className="fw-link"
                  onClick={() => {
                    setInlineClient(undefined);
                    onBack?.();
                  }}
                >
                  ← Все клиенты
                </button>
              )}
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
                            <small>День выплаты собственнику</small>
                            <b>{b.owner_payout_day ?? "Укажите в брони"}</b>
                          </div>
                          <div>
                            <small>Собственник</small>
                            <b>
                              {owners.find(
                                (o) =>
                                  o.id ===
                                  cfg.find((c) => c.property_id === b.property_id)
                                    ?.owner_counterparty_id,
                              )?.name ?? "Прикрепите в контрагентах"}
                            </b>
                          </div>
                        </div>
                        <div className="fw-actions">
                          <Button variant="outline" onClick={() => setContractId(b.id)}>
                            Условия и платежи брони
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              const planned = rows
                                .filter(
                                  (p) =>
                                    p.booking_id === b.id &&
                                    p.rental_component === "rent" &&
                                    paymentFactAmount(p, today) < p.amount,
                                )
                                .sort((a, b) => a.planned_date.localeCompare(b.planned_date))[0];
                              if (planned) setEditing(planned);
                              else {
                                setContractId(b.id);
                                toast.info("Нет неоплаченных платежей. Проверьте график в брони");
                              }
                            }}
                          >
                            Оплата аренды
                          </Button>
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
                    {[
                      ...new Set(
                        received
                          .map((p) => p.rental_installment_id)
                          .filter((id): id is string => !!id),
                      ),
                    ].map((id) => {
                      const pair = rentalInstallmentSummary(received, id, today);
                      return (
                        <div className="fw-notice" key={id}>
                          Аренда с предоплатой: всего {money(pair.total)} · Получено{" "}
                          {money(pair.received)} · Осталось {money(pair.remaining)}
                        </div>
                      );
                    })}
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
                      {onOwners ? (
                        <button className="fw-link" onClick={onOwners}>
                          расчётах с собственниками ↓
                        </button>
                      ) : (
                        <Link to="/finance/owners" className="fw-link">
                          расчётах с собственниками →
                        </Link>
                      )}
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
      {contractId && contract.data && (
        <BookingDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setContractId(null);
              void qc.invalidateQueries({ queryKey: ["booking-finance-editor"] });
            }
          }}
          booking={contract.data}
        />
      )}
      {contractId && contract.error && (
        <p className="text-destructive">Не удалось открыть бронь: {String(contract.error)}</p>
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
function PaymentTable({
  payments,
  onOpen,
  onClient,
}: {
  payments: Payment[];
  onOpen: (p: Payment) => void;
  onClient?: (id: string) => void;
}) {
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
                    : rentalPaymentLabel(p)}
                <small>{p.comment}</small>
                <small>
                  {p.booking_id
                    ? `Бронь · ${paymentPeriod(p)}`
                    : p.id.startsWith("owner-forecast:")
                      ? "Прогноз по графику аренды"
                      : p.obligation_id
                        ? "Расчёт с собственником"
                        : "Отдельная операция"}
                </small>
              </td>
              <td>
                {p.property ? financePropertyLabel(p.property) : "Компания"}
                {p.client_id && (
                  <small>
                    {onClient ? (
                      <button className="fw-link" onClick={() => onClient(p.client_id!)}>
                        {p.client?.full_name ?? p.counterparty_name}
                      </button>
                    ) : (
                      <Link to="/finance/clients/$id" params={{ id: p.client_id }}>
                        {p.client?.full_name ?? p.counterparty_name}
                      </Link>
                    )}
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
