import { fetchFinanceObjectClasses, fetchFinanceObjectAssignments } from "@/lib/finance-objects";
import { filterFinanceObjects } from "@/lib/finance-object-model";
import { Fragment, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FinanceTabs } from "./FinanceTabs";
import { PaymentDialog } from "./PaymentDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import {
  fetchPayments,
  fetchFinanceReportPropertyOptions,
  financePropertyLabel,
  monthBounds,
  formatAdeskMoney,
  type Payment,
} from "@/lib/finance";
import { fetchFinanceCatalog } from "@/lib/finance-articles";
import { fetchObligations, fetchCounterparties } from "@/lib/finance-counterparties";
import {
  planFactCategories,
  csvText,
  currentDebts,
  entryTotals,
  groupEntries,
  reportEntries,
  type ReportEntry,
} from "@/lib/finance-analytics";
import "./finance-analytics.css";

type View = "cash" | "profit" | "plan" | "expenses" | "objects" | "debts";
const views: { id: View; label: string }[] = [
  { id: "cash", label: "Движение денег" },
  { id: "profit", label: "Прибыли и убытки" },
  { id: "plan", label: "План / факт" },
  { id: "expenses", label: "Анализ расходов" },
  { id: "objects", label: "По объектам" },
  { id: "debts", label: "Задолженность" },
];
const money = (v: number) => formatAdeskMoney(v);
const colors = ["#7555cf", "#4195e8", "#4fc2a6", "#f2b65a", "#e67777", "#91a5c4"];
export function FinanceAnalyticsPage({ dashboard = false }: { dashboard?: boolean }) {
  const now = new Date();
  const bounds = monthBounds(now.getFullYear(), now.getMonth());
  const [from, setFrom] = useState(bounds.from),
    [to, setTo] = useState(bounds.to),
    [propertyId, setProperty] = useState("all"),
    [classificationId, setClassification] = useState("all"),
    [view, setView] = useState<View>("cash");
  const [detail, setDetail] = useState<{ title: string; entries: ReportEntry[] } | null>(null),
    [editing, setEditing] = useState<Payment | null>(null);
  const payments = useQuery({
    queryKey: ["payments", "analytics"],
    queryFn: () => fetchPayments(),
  });
  const catalog = useQuery({ queryKey: ["finance-catalog"], queryFn: fetchFinanceCatalog });
  const properties = useQuery({
    queryKey: ["finance-properties", "all"],
    queryFn: () => fetchFinanceReportPropertyOptions(),
  });
  const obligations = useQuery({
    queryKey: ["finance-obligations", "analytics"],
    queryFn: () => fetchObligations(),
  });
  const parties = useQuery({
    queryKey: ["finance-counterparties", "analytics"],
    queryFn: () => fetchCounterparties(),
  });
  const objectClasses = useQuery({
    queryKey: ["finance-object-classes"],
    queryFn: fetchFinanceObjectClasses,
  });
  const objectAssignments = useQuery({
    queryKey: ["finance-object-settings"],
    queryFn: fetchFinanceObjectAssignments,
  });
  const data = useMemo(() => {
    const all = payments.data ?? [],
      cat = catalog.data ?? { articles: [], categories: [] };
    const allowed = new Set(
      filterFinanceObjects(
        properties.data ?? [],
        objectAssignments.data ?? [],
        classificationId,
      ).map((p) => p.id),
    );
    const selected =
      classificationId === "all"
        ? all
        : all.filter((p) => !!p.property_id && allowed.has(p.property_id));
    const cash = reportEntries(selected, cat, "cash", from, to, propertyId),
      profit = reportEntries(selected, cat, "profit", from, to, propertyId),
      plan = reportEntries(selected, cat, "plan", from, to, propertyId);
    const debt = currentDebts(
      (obligations.data ?? []).filter(
        (o) => classificationId === "all" || (!!o.property_id && allowed.has(o.property_id)),
      ),
      all,
      propertyId,
    );
    return {
      cash,
      profit,
      plan,
      debt,
      cashTotals: entryTotals(cash),
      profitTotals: entryTotals(profit),
      planTotals: entryTotals(plan),
    };
  }, [
    payments.data,
    catalog.data,
    obligations.data,
    from,
    to,
    propertyId,
    classificationId,
    properties.data,
    objectAssignments.data,
  ]);
  const error = [
    payments,
    catalog,
    properties,
    obligations,
    parties,
    objectClasses,
    objectAssignments,
  ].find((q) => q.error)?.error;
  const loading = [
    payments,
    catalog,
    properties,
    obligations,
    parties,
    objectClasses,
    objectAssignments,
  ].some((q) => q.isPending);
  const valid = !!from && !!to && from <= to;
  const entries = view === "profit" || view === "objects" ? data.profit : data.cash;
  const planCategories = planFactCategories(data.plan, data.cash);
  const expenses = data.cash.filter((e) => e.payment.direction === "out");
  const expenseGroups = groupEntries(expenses, (e) => e.category).sort(
    (a, b) => b.expense - a.expense,
  );
  const objects = groupEntries(data.profit, (e) => e.payment.property_id ?? "none")
    .map((g) => ({ ...g, label: g.items[0]?.object ?? "Без объекта" }))
    .sort((a, b) => b.net - a.net);
  const months = groupEntries(entries, (e) => e.date.slice(0, 7)).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const chart = groupEntries(data.cash, (e) => e.date).sort((a, b) => a.name.localeCompare(b.name));
  let cumulative = 0;
  const flow = chart.map((g) => {
    cumulative += g.net;
    return { ...g, change: cumulative };
  });
  const show = (title: string, items: ReportEntry[]) => setDetail({ title, entries: items });
  const exportReport = () => {
    const rows: (string | number)[][] =
      view === "debts"
        ? [
            ["Контрагент", "Направление", "Дата", "Объект", "Остаток"],
            ...data.debt.map((d) => [
              parties.data?.find((p) => p.id === d.counterparty_id)?.name ?? d.counterparty_id,
              d.direction === "receivable" ? "Нам должны" : "Мы должны",
              d.planned_date,
              d.property?.internal_name || d.property?.title || "Без объекта",
              d.remaining,
            ]),
          ]
        : view === "plan"
          ? [
              ["Показатель", "План", "Факт", "Отклонение"],
              [
                "Приход",
                data.planTotals.income,
                data.cashTotals.income,
                data.cashTotals.income - data.planTotals.income,
              ],
              [
                "Расход",
                data.planTotals.expense,
                data.cashTotals.expense,
                data.cashTotals.expense - data.planTotals.expense,
              ],
              [
                "Денежный поток",
                data.planTotals.net,
                data.cashTotals.net,
                data.cashTotals.net - data.planTotals.net,
              ],
              ...planCategories.map((g) => [
                `${g.direction === "in" ? "Приход" : "Расход"} · ${g.name}`,
                g.plan,
                g.fact,
                g.fact - g.plan,
              ]),
            ]
          : [
              [
                "Дата",
                "Объект",
                "Контрагент",
                "Деятельность",
                "Категория",
                "Статья",
                "Приход",
                "Расход",
              ],
              ...(view === "expenses" ? expenses : entries).map((e) => [
                e.date,
                e.object,
                e.payment.counterparty_name,
                e.activity,
                e.category,
                e.article,
                e.payment.direction === "in" ? e.amount : 0,
                e.payment.direction === "out" ? e.amount : 0,
              ]),
            ];
    const url = URL.createObjectURL(new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rm-os-${view}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const preset = (value: string) => {
    const offset = value === "last" ? -1 : 0;
    const b = monthBounds(now.getFullYear(), now.getMonth() + offset);
    setFrom(value === "year" ? `${now.getFullYear()}-01-01` : b.from);
    setTo(value === "year" ? `${now.getFullYear()}-12-31` : b.to);
  };
  const kpi = (label: string, value: number, items?: ReportEntry[], note?: string) => (
    <div className="fa-panel">
      <div className="fa-kpi-label">{label}</div>
      <button
        type="button"
        className={`fa-kpi-value ${value < 0 ? "fa-negative" : ""}`}
        disabled={!items}
        onClick={() => items && show(label, items)}
      >
        {money(value)}
      </button>
      {note && <div className="fa-note">{note}</div>}
    </div>
  );
  const debtTable = () => (
    <div className="fa-table-wrap">
      <table className="fa-table">
        <thead>
          <tr>
            <th>Контрагент</th>
            <th>Дата</th>
            <th>Объект</th>
            <th>Нам должны</th>
            <th>Мы должны</th>
          </tr>
        </thead>
        <tbody>
          {data.debt.map((d) => (
            <tr key={d.id}>
              <td>
                <Link
                  className="fa-debt-link"
                  to="/finance/counterparties/$id"
                  params={{ id: d.counterparty_id }}
                >
                  {parties.data?.find((p) => p.id === d.counterparty_id)?.name ?? "Контрагент"}
                </Link>
              </td>
              <td>{d.planned_date}</td>
              <td>{d.property?.internal_name || d.property?.title || "Без объекта"}</td>
              <td className="fa-positive">
                {d.direction === "receivable" ? money(d.remaining) : "—"}
              </td>
              <td className="fa-negative">
                {d.direction === "payable" ? money(d.remaining) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.debt.length && <p className="fa-empty">Нет открытых обязательств.</p>}
    </div>
  );
  const objectTable = () => (
    <div className="fa-table-wrap">
      <table className="fa-table">
        <thead>
          <tr>
            <th>Объект</th>
            <th>Доходы</th>
            <th>Расходы</th>
            <th>Прибыль</th>
            <th>Рентабельность</th>
          </tr>
        </thead>
        <tbody>
          {objects.map((g) => (
            <tr key={g.name}>
              <td>
                {g.name === "none" ? (
                  <button onClick={() => show(g.label, g.items)}>{g.label}</button>
                ) : (
                  <Link className="fa-debt-link" to="/finance/objects/$id" params={{ id: g.name }}>
                    {g.label}
                  </Link>
                )}
              </td>
              <td>{money(g.income)}</td>
              <td>{money(g.expense)}</td>
              <td className={g.net < 0 ? "fa-negative" : "fa-positive"}>{money(g.net)}</td>
              <td>{g.margin === null ? "—" : `${g.margin.toFixed(1)} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!objects.length && (
        <p className="fa-empty">За этот период нет доходов и расходов по объектам.</p>
      )}
    </div>
  );
  return (
    <div className="finance-ui finance-analytics">
      <h1>{dashboard ? "Финансовый дашборд" : "Отчёты"}</h1>
      <FinanceTabs active={dashboard ? "dashboard" : "reports"} />
      <div className="fa-toolbar">
        <select
          aria-label="Быстрый период"
          value={
            from === bounds.from && to === bounds.to
              ? "month"
              : from === monthBounds(now.getFullYear(), now.getMonth() - 1).from &&
                  to === monthBounds(now.getFullYear(), now.getMonth() - 1).to
                ? "last"
                : from === `${now.getFullYear()}-01-01` && to === `${now.getFullYear()}-12-31`
                  ? "year"
                  : "custom"
          }
          onChange={(e) => preset(e.target.value)}
        >
          <option value="custom" disabled>
            Свой период
          </option>
          <option value="month">Этот месяц</option>
          <option value="last">Прошлый месяц</option>
          <option value="year">Этот год</option>
        </select>
        <input
          aria-label="С даты"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span>—</span>
        <input
          aria-label="По дату"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <select
          aria-label="Объект отчёта"
          value={propertyId}
          onChange={(e) => setProperty(e.target.value)}
        >
          <option value="all">Все объекты</option>
          <option value="none">Без объекта</option>
          {properties.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {financePropertyLabel(p)}
            </option>
          ))}
        </select>
        <select
          aria-label="Классификация объектов отчёта"
          value={classificationId}
          onChange={(e) => setClassification(e.target.value)}
        >
          <option value="all">Все классификации</option>
          <option value="none">Без классификации</option>
          {objectClasses.data?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {!dashboard && (
          <button
            className="fa-button"
            onClick={exportReport}
            disabled={loading || !!error || !valid}
          >
            Экспорт CSV
          </button>
        )}
      </div>
      {!valid ? (
        <p className="fa-error">Дата начала должна быть не позже даты окончания.</p>
      ) : error ? (
        <p role="alert" className="fa-error">
          Не удалось загрузить финансовые данные. {error.message}
        </p>
      ) : loading ? (
        <p className="fa-empty">Загрузка финансов…</p>
      ) : (
        <>
          {dashboard ? (
            <>
              <div className="fa-kpis">
                {kpi(
                  "Доходы",
                  data.profitTotals.income,
                  data.profit.filter((e) => e.payment.direction === "in"),
                )}
                {kpi(
                  "Расходы",
                  data.profitTotals.expense,
                  data.profit.filter((e) => e.payment.direction === "out"),
                )}
                {kpi("Прибыль", data.profitTotals.net, data.profit)}
                {kpi(
                  "Денежный поток",
                  data.cashTotals.net,
                  data.cash,
                  "Приходы минус расходы по оплатам",
                )}
              </div>
              <p className="fa-note">
                Прибыль: по дате начисления, а без неё — по дате операции, включая неоплаченные
                начисления. Депозиты по умолчанию исключены; участие других статей задаётся в
                настройках.
              </p>
              <div className="fa-grid">
                <section className="fa-panel">
                  <h2>Динамика движения денег</h2>
                  <p className="fa-note">Накопленное изменение за выбранный период</p>
                  <div className="fa-chart">
                    <ResponsiveContainer>
                      <AreaChart data={flow}>
                        <CartesianGrid stroke="#eee" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v / 1000}K`} width={60} />
                        <Tooltip formatter={(v) => money(Number(v))} />
                        <Area
                          dataKey="change"
                          name="Изменение денег"
                          stroke="#7555cf"
                          fill="#eee8fb"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="fa-panel">
                  <h2>Рентабельность и долги</h2>
                  <div className="fa-kpi-label">Рентабельность по начислениям</div>
                  <div className="fa-kpi-value">
                    {data.profitTotals.margin === null
                      ? "—"
                      : `${data.profitTotals.margin.toFixed(1)} %`}
                  </div>
                  <p className="fa-note">Открытые обязательства на текущий момент</p>
                  <p className="fa-positive">
                    Нам должны:{" "}
                    {money(
                      data.debt
                        .filter((d) => d.direction === "receivable")
                        .reduce((s, d) => s + d.remaining, 0),
                    )}
                  </p>
                  <p className="fa-negative">
                    Мы должны:{" "}
                    {money(
                      data.debt
                        .filter((d) => d.direction === "payable")
                        .reduce((s, d) => s + d.remaining, 0),
                    )}
                  </p>
                </section>
              </div>
              <div className="fa-grid">
                <section className="fa-panel">
                  <h2>Приходы и расходы денег</h2>
                  <div className="fa-chart">
                    <ResponsiveContainer>
                      <BarChart data={chart}>
                        <CartesianGrid stroke="#eee" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v / 1000}K`} width={60} />
                        <Tooltip formatter={(v) => money(Number(v))} />
                        <Bar dataKey="income" name="Приход" fill="#4fc2a6" />
                        <Bar dataKey="expense" name="Расход" fill="#e67777" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="fa-legend">
                    <span>● Приход</span>
                    <span>● Расход</span>
                  </div>
                </section>
                <section className="fa-panel">
                  <h2>Структура расходов денег</h2>
                  {expenses.length ? (
                    <>
                      <div className="fa-chart">
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie
                              data={expenseGroups}
                              dataKey="expense"
                              nameKey="name"
                              innerRadius={65}
                              outerRadius={100}
                            >
                              {expenseGroups.map((g, i) => (
                                <Cell key={g.name} fill={colors[i % colors.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v) => money(Number(v))} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      {expenseGroups.map((g, i) => (
                        <p key={g.name}>
                          <button
                            onClick={() => show(g.name, g.items)}
                            style={{ color: colors[i % colors.length] }}
                          >
                            {g.name}: {money(g.expense)}
                          </button>
                        </p>
                      ))}
                    </>
                  ) : (
                    <p className="fa-empty">Нет оплаченных расходов.</p>
                  )}
                </section>
              </div>
              <div className="fa-grid">
                <section className="fa-panel">
                  <h2>План и факт движения денег</h2>
                  {(["income", "expense"] as const).map((key) => (
                    <div key={key} style={{ marginBottom: 22 }}>
                      <div className="fa-kpi-label">{key === "income" ? "Приход" : "Расход"}</div>
                      <div style={{ marginTop: 8 }}>
                        {money(data.cashTotals[key])}{" "}
                        <span className="fa-note">из {money(data.planTotals[key])}</span>
                      </div>
                      <div className="fa-meter">
                        <span
                          style={{
                            width: `${data.planTotals[key] > 0 ? Math.min(100, (data.cashTotals[key] / data.planTotals[key]) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <p className="fa-note">
                        {data.planTotals[key] > 0
                          ? `${((data.cashTotals[key] / data.planTotals[key]) * 100).toFixed(1)} % от плана`
                          : "План не задан"}
                      </p>
                    </div>
                  ))}
                </section>
                <section className="fa-panel">
                  <h2>Контрагенты по расходам денег</h2>
                  {groupEntries(
                    expenses,
                    (e) =>
                      e.payment.counterparty_id ?? e.payment.counterparty_name ?? "Без контрагента",
                  )
                    .sort((a, b) => b.expense - a.expense)
                    .slice(0, 5)
                    .map((g) => (
                      <div
                        key={g.name}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 16,
                          padding: "12px 0",
                          borderBottom: "1px solid #eee",
                        }}
                      >
                        <button
                          onClick={() =>
                            show(
                              g.items[0]?.payment.counterparty_name || "Без контрагента",
                              g.items,
                            )
                          }
                        >
                          {g.items[0]?.payment.counterparty_name || "Без контрагента"}
                        </button>
                        <span className="fa-negative">{money(g.expense)}</span>
                      </div>
                    ))}
                  {!expenses.length && <p className="fa-empty">Нет оплаченных расходов.</p>}
                </section>
              </div>
              <section className="fa-panel">
                <h2>Доходность объектов</h2>
                {objectTable()}
              </section>
              <section className="fa-panel" style={{ marginTop: 16 }}>
                <h2>Движение по счетам за период</h2>
                <div className="fa-table-wrap">
                  <table className="fa-table">
                    <thead>
                      <tr>
                        <th>Счёт</th>
                        <th>Приход</th>
                        <th>Расход</th>
                        <th>Изменение</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupEntries(data.cash, (e) => e.payment.account || "Без счёта").map((g) => (
                        <tr key={g.name}>
                          <td>
                            <button onClick={() => show(g.name, g.items)}>{g.name}</button>
                          </td>
                          <td>{money(g.income)}</td>
                          <td>{money(g.expense)}</td>
                          <td>{money(g.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="fa-tabs" role="tablist" aria-label="Финансовые отчёты">
                {views.map((v) => (
                  <button
                    role="tab"
                    aria-selected={view === v.id}
                    key={v.id}
                    onClick={() => setView(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <p className="fa-note">
                {view === "profit" || view === "objects"
                  ? "Полная сумма учитывается по дате начисления, а без неё — по дате операции, независимо от оплаты. Статьи с выключенным «В прибыли» исключены."
                  : view === "debts"
                    ? "Текущие открытые обязательства с учётом всех связанных оплат. Фильтр периода к остатку задолженности не применяется."
                    : view === "plan"
                      ? "План — по плановой дате; факт — оплаченная часть по дате оплаты. Оплата плана другого периода также входит в факт."
                      : "Оплаченные и частично оплаченные операции по дате оплаты; если она не задана — по плановой дате. Частичные оплаты учитываются общей суммой на указанную дату оплаты."}
              </p>
              <section className="fa-panel">
                <h2>{views.find((v) => v.id === view)?.label}</h2>
                {view === "debts" ? (
                  debtTable()
                ) : view === "objects" ? (
                  objectTable()
                ) : view === "expenses" ? (
                  <div className="fa-table-wrap">
                    <table className="fa-table">
                      <thead>
                        <tr>
                          <th>Категория</th>
                          <th>Сумма</th>
                          <th>Доля</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenseGroups.map((g) => (
                          <tr key={g.name}>
                            <td>
                              <button onClick={() => show(g.name, g.items)}>{g.name}</button>
                            </td>
                            <td>{money(g.expense)}</td>
                            <td>
                              {data.cashTotals.expense
                                ? ((g.expense / data.cashTotals.expense) * 100).toFixed(1)
                                : 0}{" "}
                              %
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="fa-total">
                          <td>Всего расходов</td>
                          <td>{money(data.cashTotals.expense)}</td>
                          <td>{expenses.length ? "100 %" : "—"}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : view === "plan" ? (
                  <div className="fa-table-wrap">
                    <table className="fa-table">
                      <thead>
                        <tr>
                          <th>Показатель</th>
                          <th>План</th>
                          <th>Факт</th>
                          <th>Отклонение</th>
                          <th>Исполнение</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(["income", "expense", "net"] as const).map((key, i) => (
                          <tr key={key}>
                            <td>{["Приход", "Расход", "Денежный поток"][i]}</td>
                            <td>
                              <button
                                onClick={() =>
                                  show(
                                    "План",
                                    data.plan.filter(
                                      (e) =>
                                        key === "net" ||
                                        e.payment.direction === (key === "income" ? "in" : "out"),
                                    ),
                                  )
                                }
                              >
                                {money(data.planTotals[key])}
                              </button>
                            </td>
                            <td>
                              <button
                                onClick={() =>
                                  show(
                                    "Факт",
                                    data.cash.filter(
                                      (e) =>
                                        key === "net" ||
                                        e.payment.direction === (key === "income" ? "in" : "out"),
                                    ),
                                  )
                                }
                              >
                                {money(data.cashTotals[key])}
                              </button>
                            </td>
                            <td>{money(data.cashTotals[key] - data.planTotals[key])}</td>
                            <td>
                              {data.planTotals[key] > 0
                                ? `${((data.cashTotals[key] / data.planTotals[key]) * 100).toFixed(1)} %`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                        {planCategories.map((g) => (
                          <tr key={`${g.direction}:${g.name}`}>
                            <td>
                              {g.direction === "in" ? "Приход" : "Расход"} · {g.name}
                            </td>
                            <td>
                              <button onClick={() => show(`План · ${g.name}`, g.planEntries)}>
                                {money(g.plan)}
                              </button>
                            </td>
                            <td>
                              <button onClick={() => show(`Факт · ${g.name}`, g.cashEntries)}>
                                {money(g.fact)}
                              </button>
                            </td>
                            <td>{money(g.fact - g.plan)}</td>
                            <td>
                              {g.plan > 0 ? `${((g.fact / g.plan) * 100).toFixed(1)} %` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="fa-table-wrap">
                    <table className="fa-table">
                      <thead>
                        <tr>
                          <th>Показатель</th>
                          {months.map((m) => (
                            <th key={m.name}>{m.name}</th>
                          ))}
                          <th>Итого</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(["in", "out"] as const).map((direction) => (
                          <Fragment key={direction}>
                            <tr className="fa-category">
                              <td>{direction === "in" ? "Доходы / приход" : "Расходы"}</td>
                              {months.map((m) => (
                                <td key={m.name}>
                                  {money(direction === "in" ? m.income : m.expense)}
                                </td>
                              ))}
                              <td>
                                {money(
                                  direction === "in"
                                    ? entryTotals(entries).income
                                    : entryTotals(entries).expense,
                                )}
                              </td>
                            </tr>
                            {groupEntries(
                              entries.filter((e) => e.payment.direction === direction),
                              (e) =>
                                view === "cash" ? `${e.activity} · ${e.category}` : e.category,
                            ).map((group) => (
                              <Fragment key={group.name}>
                                <tr className="fa-category">
                                  <td>
                                    <button onClick={() => show(group.name, group.items)}>
                                      {group.name}
                                    </button>
                                  </td>
                                  {months.map((m) => (
                                    <td key={m.name}>
                                      {money(
                                        group.items
                                          .filter((e) => e.date.startsWith(m.name))
                                          .reduce((s, e) => s + e.amount, 0),
                                      )}
                                    </td>
                                  ))}
                                  <td>{money(group.income + group.expense)}</td>
                                </tr>
                                {groupEntries(group.items, (e) => e.article).map((g) => (
                                  <tr key={g.name}>
                                    <td>
                                      <button onClick={() => show(g.name, g.items)}>
                                        {g.name}
                                      </button>
                                    </td>
                                    {months.map((m) => (
                                      <td key={m.name}>
                                        <button
                                          onClick={() =>
                                            show(
                                              `${g.name} · ${m.name}`,
                                              g.items.filter((e) => e.date.startsWith(m.name)),
                                            )
                                          }
                                        >
                                          {money(
                                            g.items
                                              .filter((e) => e.date.startsWith(m.name))
                                              .reduce((s, e) => s + e.amount, 0),
                                          )}
                                        </button>
                                      </td>
                                    ))}
                                    <td>{money(g.income + g.expense)}</td>
                                  </tr>
                                ))}
                              </Fragment>
                            ))}
                          </Fragment>
                        ))}
                        <tr className="fa-total">
                          <td>{view === "profit" ? "Прибыль" : "Чистый денежный поток"}</td>
                          {months.map((m) => (
                            <td key={m.name}>{money(m.net)}</td>
                          ))}
                          <td>{money(entryTotals(entries).net)}</td>
                        </tr>
                      </tbody>
                    </table>
                    {!entries.length && (
                      <p className="fa-empty">Нет операций за выбранный период.</p>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="fa-detail">
          <SheetHeader>
            <SheetTitle>{detail?.title}</SheetTitle>
            <SheetDescription>
              Операции отчёта. Нажмите на операцию, чтобы изменить её.
            </SheetDescription>
          </SheetHeader>
          {detail?.entries.map((e, i) => (
            <button
              key={`${e.payment.id}-${i}`}
              className="fa-detail-row"
              onClick={() => {
                setDetail(null);
                setEditing(e.payment);
              }}
            >
              <span>
                {e.article}
                <small>
                  {e.date} · {e.object}
                </small>
                <small>{e.payment.counterparty_name || "Без контрагента"}</small>
              </span>
              <span className={e.payment.direction === "in" ? "fa-positive" : "fa-negative"}>
                {e.payment.direction === "in" ? "+" : "−"}
                {money(e.amount)}
              </span>
            </button>
          ))}
        </SheetContent>
      </Sheet>
      <PaymentDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        payment={editing}
      />
    </div>
  );
}
