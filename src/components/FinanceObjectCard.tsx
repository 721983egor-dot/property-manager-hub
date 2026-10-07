import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Folder } from "lucide-react";
import { toast } from "sonner";
import { FinanceTabs } from "./FinanceTabs";
import { PaymentDialog } from "./PaymentDialog";
import { FinanceObjectObligationDialog } from "./FinanceObjectObligationDialog";
import {
  fetchFinanceReportPropertyOptions,
  fetchPayments,
  financePropertyLabel,
  formatAdeskMoney,
  monthBounds,
  statusLabel,
  type Payment,
  type PaymentDirection,
} from "@/lib/finance";
import { fetchFinanceCatalog, paymentArticleLabel } from "@/lib/finance-articles";
import {
  fetchCounterparties,
  fetchObligations,
  obligationCash,
  type FinanceObligation,
} from "@/lib/finance-counterparties";
import {
  fetchFinanceObjectClasses,
  fetchFinanceObjectAssignments,
  assignFinanceObjectClass,
} from "@/lib/finance-objects";
import { objectFinanceSummary, objectFinanceSeries } from "@/lib/finance-object-model";
import { csvText } from "@/lib/finance-analytics";
import "./finance-analytics.css";
export function FinanceObjectCard({ id }: { id: string }) {
  const qc = useQueryClient(),
    now = new Date(),
    today = new Intl.DateTimeFormat("en-CA").format(now);
  const [month, setMonth] = useState(monthBounds(now.getFullYear(), now.getMonth()).monthKey);
  const [basis, setBasis] = useState<"profit" | "cash">("profit"),
    [tab, setTab] = useState<"money" | "obligations">("money"),
    [direction, setDirection] = useState<"all" | PaymentDirection>("all"),
    [party, setParty] = useState("all");
  const [paymentForm, setPaymentForm] = useState<{
      payment: Payment | null;
      direction: PaymentDirection;
    } | null>(null),
    [obligationForm, setObligationForm] = useState<{ obligation: FinanceObligation | null } | null>(
      null,
    );
  const bounds = monthBounds(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1);
  const properties = useQuery({
    queryKey: ["finance-properties", "all"],
    queryFn: () => fetchFinanceReportPropertyOptions(),
  });
  const payments = useQuery({
    queryKey: ["payments", "analytics"],
    queryFn: () => fetchPayments(),
  });
  const catalog = useQuery({ queryKey: ["finance-catalog"], queryFn: fetchFinanceCatalog });
  const obligations = useQuery({
    queryKey: ["finance-obligations", "analytics"],
    queryFn: () => fetchObligations(),
  });
  const groups = useQuery({
    queryKey: ["finance-object-classes"],
    queryFn: fetchFinanceObjectClasses,
  });
  const assignments = useQuery({
    queryKey: ["finance-object-settings"],
    queryFn: fetchFinanceObjectAssignments,
  });
  const parties = useQuery({
    queryKey: ["finance-counterparties"],
    queryFn: () => fetchCounterparties(),
  });
  const property = properties.data?.find((p) => p.id === id);
  const name = property ? financePropertyLabel(property) : "Объект";
  const classification =
    assignments.data?.find((a) => a.property_id === id)?.classification_id ?? "";
  const assign = useMutation({
    mutationFn: (value: string) => assignFinanceObjectClass(id, value || null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["finance-object-settings"] });
      toast.success("Классификация сохранена");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });
  const error = [properties, payments, catalog, obligations, groups, assignments, parties].find(
    (q) => q.error,
  )?.error;
  const loading = [properties, payments, catalog, obligations, groups, assignments, parties].some(
    (q) => q.isPending,
  );
  const summary = useMemo(
    () =>
      objectFinanceSummary(
        id,
        payments.data ?? [],
        obligations.data ?? [],
        catalog.data ?? { articles: [], categories: [] },
        bounds.from,
        bounds.to,
        basis,
      ),
    [id, payments.data, obligations.data, catalog.data, bounds.from, bounds.to, basis],
  );
  const series = useMemo(
    () =>
      objectFinanceSeries(
        id,
        payments.data ?? [],
        catalog.data ?? { articles: [], categories: [] },
        bounds.from,
        bounds.to,
        basis,
        today,
      ),
    [id, payments.data, catalog.data, bounds.from, bounds.to, basis, today],
  );
  const partyFilter = (partyId: string | null) =>
    party === "all" || (party === "none" ? !partyId : partyId === party);
  const visiblePayments = (payments.data ?? []).filter(
    (p) =>
      p.property_id === id &&
      p.planned_date >= bounds.from &&
      p.planned_date <= bounds.to &&
      (direction === "all" || p.direction === direction) &&
      partyFilter(p.counterparty_id),
  );
  const visibleObligations = (obligations.data ?? []).filter(
    (o) => o.property_id === id && partyFilter(o.counterparty_id),
  );
  const exportRows = () => {
    const rows: (string | number)[][] =
      tab === "money"
        ? [
            ["Дата", "Приход", "Расход", "Статья", "Контрагент", "Статус"],
            ...visiblePayments.map((p) => [
              p.planned_date,
              p.direction === "in" ? p.amount : 0,
              p.direction === "out" ? p.amount : 0,
              paymentArticleLabel(p, catalog.data?.articles),
              p.counterparty_name,
              statusLabel(p.status),
            ]),
          ]
        : [
            ["Дата", "Контрагент", "Описание", "Направление", "Сумма", "Остаток", "Статус"],
            ...visibleObligations.map((o) => [
              o.planned_date,
              parties.data?.find((p) => p.id === o.counterparty_id)?.name ?? o.counterparty_id,
              o.description,
              o.direction === "receivable" ? "Нам должны" : "Мы должны",
              o.amount,
              o.status === "closed" ? 0 : obligationCash(o, payments.data ?? []).remaining,
              o.status === "closed" ? "Закрыто" : "Открыто",
            ]),
          ];
    const url = URL.createObjectURL(new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rm-os-object-${id}-${tab}-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="finance-ui finance-object-card">
      <Link to="/finance/objects" className="fa-note">
        ← Объекты
      </Link>
      <h1>{name}</h1>
      <FinanceTabs active="objects" />
      {error ? (
        <p role="alert" className="fa-error">
          Не удалось загрузить финансы объекта. {error.message}
        </p>
      ) : loading ? (
        <p className="fa-empty">Загрузка…</p>
      ) : !property ? (
        <p className="fa-empty">Объект не найден.</p>
      ) : (
        <>
          <div className="finance-object-meta">
            <Folder size={17} />
            <select
              aria-label="Классификация объекта"
              value={classification}
              disabled={assign.isPending}
              onChange={(e) => assign.mutate(e.target.value)}
            >
              <option value="">Без классификации</option>
              {groups.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {property.status === "archived" && <span>Архив</span>}
          </div>
          <div className="finance-object-overview">
            <span>Обзор</span>
          </div>
          <div className="fa-toolbar">
            <div className="finance-segments">
              <button aria-pressed={basis === "profit"} onClick={() => setBasis("profit")}>
                Прибыль
              </button>
              <button aria-pressed={basis === "cash"} onClick={() => setBasis("cash")}>
                Денежный поток
              </button>
            </div>
            <input
              aria-label="Месяц объекта"
              type="month"
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
              }}
            />
          </div>
          <section className="fa-panel">
            <div className="finance-object-summary">
              <div>
                <small>{basis === "profit" ? "Прибыль" : "Денежный поток"}</small>
                <strong className={summary.net < 0 ? "fa-negative" : ""}>
                  {formatAdeskMoney(summary.net)}
                </strong>
              </div>
              <div>
                <small>{basis === "profit" ? "Доходы" : "Приход"}</small>
                <strong>{formatAdeskMoney(summary.income)}</strong>
              </div>
              <div>
                <small>Расходы</small>
                <strong>{formatAdeskMoney(summary.expense)}</strong>
              </div>
              <div>
                <small>Рентабельность</small>
                <strong>
                  {basis === "profit" && summary.margin !== null
                    ? `${summary.margin.toFixed(1)} %`
                    : "—"}
                </strong>
              </div>
              <div>
                <small>Баланс по обязательствам</small>
                <strong>{formatAdeskMoney(summary.debtBalance)}</strong>
              </div>
            </div>
            <div className="finance-object-chart">
              <ResponsiveContainer>
                <LineChart data={series}>
                  <CartesianGrid stroke="#eee" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) =>
                      String(value).slice(8, 10) + "." + String(value).slice(5, 7)
                    }
                    tick={{ fontSize: 12 }}
                    minTickGap={70}
                  />
                  <YAxis width={60} tickFormatter={(value) => `${value / 1000}K`} />
                  <Tooltip formatter={(value) => formatAdeskMoney(Number(value))} />
                  {today >= bounds.from && today <= bounds.to && (
                    <ReferenceLine
                      x={today}
                      stroke="#ddd"
                      strokeDasharray="4 4"
                      label={{ value: "Сегодня", position: "insideTop", fill: "#999" }}
                    />
                  )}
                  <Line
                    dataKey="actual"
                    name={basis === "profit" ? "Прибыль" : "Денежный поток"}
                    stroke="#2782ec"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="forecast"
                    name="Прогноз"
                    stroke="#2782ec"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="fa-note">
              {basis === "profit"
                ? "Прибыль нарастающим итогом по начислениям. Будущие начисления показаны пунктиром."
                : "Накопленный денежный поток за месяц. Пунктир — прогноз с учётом неоплаченного остатка будущих операций."}{" "}
              Обязательства — текущий остаток: нам должны {formatAdeskMoney(summary.receivable)}, мы
              должны {formatAdeskMoney(summary.payable)}.
            </p>
          </section>
          <section className="fa-panel" style={{ marginTop: 16 }}>
            <div className="fa-tabs" role="tablist" aria-label="Финансы объекта">
              <button role="tab" aria-selected={tab === "money"} onClick={() => setTab("money")}>
                Деньги
              </button>
              <button
                role="tab"
                aria-selected={tab === "obligations"}
                onClick={() => setTab("obligations")}
              >
                Обязательства
              </button>
            </div>
            <div className="fa-toolbar">
              {tab === "money" ? (
                <>
                  <button
                    className="finance-primary-button"
                    onClick={() => setPaymentForm({ payment: null, direction: "in" })}
                  >
                    + Приход
                  </button>
                  <button
                    className="finance-primary-button"
                    onClick={() => setPaymentForm({ payment: null, direction: "out" })}
                  >
                    − Расход
                  </button>
                  <div className="finance-segments">
                    {(["in", "out", "all"] as const).map((d) => (
                      <button
                        key={d}
                        aria-pressed={direction === d}
                        onClick={() => setDirection(d)}
                      >
                        {d === "in" ? "Приходы" : d === "out" ? "Расходы" : "Все"}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <button
                  className="finance-primary-button"
                  onClick={() => setObligationForm({ obligation: null })}
                >
                  Добавить обязательство
                </button>
              )}
              <select
                aria-label="Контрагент объекта"
                value={party}
                onChange={(e) => setParty(e.target.value)}
              >
                <option value="all">Все контрагенты</option>
                <option value="none">Без контрагента</option>
                {parties.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="fa-button" onClick={exportRows}>
                Экспорт CSV
              </button>
            </div>
            <p className="fa-note">
              {tab === "money"
                ? "Операции по плановой дате за выбранный месяц, включая ожидаемые. Нажмите на строку для корректировки."
                : "Все обязательства объекта, независимо от выбранного месяца. Нажмите на строку для корректировки."}
            </p>
            <div className="fa-table-wrap">
              <table className="fa-table finance-operation-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Контрагент</th>
                    <th>{tab === "money" ? "Статья / описание" : "Описание"}</th>
                    <th>Сумма</th>
                    <th>{tab === "money" ? "Статус" : "Остаток"}</th>
                    {tab === "obligations" && <th>Статус</th>}
                  </tr>
                </thead>
                <tbody>
                  {tab === "money"
                    ? visiblePayments.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => setPaymentForm({ payment: p, direction: p.direction })}
                        >
                          <td>
                            <button
                              aria-label={`Изменить операцию ${p.planned_date} ${p.amount}`}
                              onClick={() => setPaymentForm({ payment: p, direction: p.direction })}
                            >
                              {p.planned_date}
                            </button>
                          </td>
                          <td>
                            {parties.data?.find((x) => x.id === p.counterparty_id)?.name ||
                              p.counterparty_name ||
                              "Без контрагента"}
                          </td>
                          <td>
                            <button
                              onClick={() => setPaymentForm({ payment: p, direction: p.direction })}
                            >
                              {paymentArticleLabel(p, catalog.data?.articles)}
                            </button>
                            <small style={{ display: "block", color: "#999" }}>{p.comment}</small>
                          </td>
                          <td className={p.direction === "in" ? "fa-positive" : "fa-negative"}>
                            {p.direction === "in" ? "+" : "−"}
                            {formatAdeskMoney(p.amount)}
                          </td>
                          <td>{statusLabel(p.status)}</td>
                        </tr>
                      ))
                    : visibleObligations.map((o) => (
                        <tr key={o.id} onClick={() => setObligationForm({ obligation: o })}>
                          <td>
                            <button
                              aria-label={`Изменить обязательство ${o.description || o.planned_date}`}
                              onClick={() => setObligationForm({ obligation: o })}
                            >
                              {o.planned_date}
                            </button>
                          </td>
                          <td>
                            {parties.data?.find((p) => p.id === o.counterparty_id)?.name ??
                              "Контрагент"}
                          </td>
                          <td>
                            <button onClick={() => setObligationForm({ obligation: o })}>
                              {o.description || "Без описания"}
                            </button>
                            <small style={{ display: "block", color: "#999" }}>
                              {o.direction === "receivable" ? "Мы передали" : "Нам передали"}
                            </small>
                          </td>
                          <td>{formatAdeskMoney(o.amount)}</td>
                          <td>
                            {formatAdeskMoney(
                              o.status === "closed"
                                ? 0
                                : obligationCash(o, payments.data ?? []).remaining,
                            )}
                          </td>
                          <td>{o.status === "closed" ? "Закрыто" : "Открыто"}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {!(tab === "money" ? visiblePayments : visibleObligations).length && (
              <p className="fa-empty">
                Здесь пока нет {tab === "money" ? "операций" : "обязательств"}. Добавьте запись или
                измените фильтры.
              </p>
            )}
          </section>
        </>
      )}
      <PaymentDialog
        open={!!paymentForm}
        onOpenChange={(open) => !open && setPaymentForm(null)}
        payment={paymentForm?.payment ?? null}
        defaultPropertyId={id}
        defaultDirection={paymentForm?.direction}
      />
      {obligationForm && (
        <FinanceObjectObligationDialog
          key={obligationForm.obligation?.id ?? "new"}
          propertyId={id}
          propertyName={name}
          obligation={obligationForm.obligation}
          onClose={() => setObligationForm(null)}
        />
      )}
    </div>
  );
}
