import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { FinanceTabs } from "./FinanceTabs";
import { readFinanceManagement } from "@/lib/finance-management.functions";
import { managementMonth, type ManagementReport } from "@/lib/finance-management-model";
import { financeToday } from "@/lib/finance-payment-status";
import "./finance-management.css";

const amountFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const labelFormat = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortFormat = new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: "UTC" });
const fromMonth = (month: string) => new Date(month + "-01T00:00:00Z");
const monthLabel = (month: string) => labelFormat.format(fromMonth(month)).replace(/ г\.$/, "");
const amount = (cents: number | null) => (cents === null ? "—" : amountFormat.format(cents / 100));
const rubles = (cents: number | null) => (cents === null ? "—" : amount(cents) + " руб.");
const differenceLabel = (value: number) => (value > 0 ? "+" + amount(value) : amount(value));
const dateLabel = (date: string) => date.split("-").reverse().join(".");
const monthName = (month: string) => shortFormat.format(fromMonth(month)).replace(".", "");

function Status({ row }: { row: ManagementReport["rows"][number] }) {
  if (row.hasOverlap) return <>Договоры пересекаются</>;
  if (row.contractDatesMissing) return <>Даты договора не указаны</>;
  if (row.contractDates.length)
    return (
      <>
        <strong>По договорам</strong>
        {row.contractDates.map((period) => (
          <small key={period.from + period.to} className="management-sub">
            {dateLabel(period.from)} — {dateLabel(period.to)}
          </small>
        ))}
      </>
    );
  if (row.status === "rented" || row.status === "booked")
    return (
      <>
        {row.status === "rented" ? "Сдан" : "Забронирован"}
        <small className="management-sub">В этом месяце договоров нет</small>
      </>
    );
  return <>{row.status === "soon_free" ? "Скоро свободен" : "Свободен"}</>;
}

function Forecast({ chart }: { chart: ManagementReport["chart"] }) {
  const [index, setIndex] = useState<number | null>(null);
  const point = index === null ? null : chart[index];
  const first = chart[0]!;
  const last = chart[chart.length - 1]!;
  const summer = chart.filter((p) => p.seasonal);
  const values = chart.map((p) => ({
    ...p,
    contractedLine: p.missingContracted && !p.contracted ? null : p.contracted,
    fullLine: p.missingFull && !p.full ? null : p.full,
  }));
  return (
    <section
      className="management-dark management-forecast"
      aria-label="Доход от управления по месяцам"
    >
      <div className="management-section-heading">
        <h2>Доход от управления по месяцам</h2>
        <span className="management-range">
          {monthLabel(first.month)} — {monthLabel(last.month)}
        </span>
      </div>
      <p className="management-muted">Текущие объекты · тыс. руб. за месяц</p>
      <div className="management-legend">
        <span className="management-lime">По заключённым договорам</span>
        <span className="management-violet">При полной сдаче</span>
      </div>
      <div className="management-plot">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={values} margin={{ top: 22, right: 14, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#41414b" />
            <XAxis
              dataKey="month"
              tickFormatter={monthName}
              stroke="#cfced7"
              interval={0}
              axisLine={false}
              tickLine={false}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              width={57}
              stroke="#cfced7"
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => amountFormat.format(v / 100000)}
            />
            {summer.map((p, i) =>
              summer[i + 1]?.month === managementMonth(p.month, 1) ? (
                <ReferenceArea
                  key={p.month}
                  x1={p.month}
                  x2={summer[i + 1]!.month}
                  fill="#b697ff"
                  fillOpacity={0.15}
                  strokeOpacity={0}
                />
              ) : null,
            )}
            <Line
              dataKey="contractedLine"
              stroke="#cbfa5b"
              strokeWidth={3}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
            <Line
              dataKey="fullLine"
              stroke="#bc9bff"
              strokeWidth={3}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <div
          className="management-month-hitboxes"
          onMouseLeave={() => setIndex(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setIndex(null);
          }}
        >
          {chart.map((p, i) => (
            <button
              type="button"
              key={p.month}
              aria-label={monthLabel(p.month)}
              aria-pressed={i === index}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setIndex(i);
              }}
              onClick={() => setIndex(i)}
              onFocus={() => setIndex(i)}
              onBlur={() => setIndex(null)}
            />
          ))}
        </div>
        {point && (
          <aside className="management-tooltip" role="status">
            <strong>
              {monthLabel(point.month)}
              {point.seasonal ? " · летние ставки" : ""}
            </strong>
            <dl>
              <div>
                <dt>По договорам</dt>
                <dd>
                  {rubles(point.missingContracted && !point.contracted ? null : point.contracted)}
                </dd>
              </div>
              <div>
                <dt>При полной сдаче</dt>
                <dd>{rubles(point.missingFull && !point.full ? null : point.full)}</dd>
              </div>
              <div>
                <dt>Разница</dt>
                <dd>
                  {rubles(point.missingDifference && !point.difference ? null : point.difference)}
                </dd>
              </div>
            </dl>
            {Boolean(point.missingDifference) && (
              <small>Суммы по объектам с известными условиями</small>
            )}
          </aside>
        )}
      </div>
      <p className="management-muted">
        Неполный месяц рассчитан по дням договора. Летние ставки выделены на графике.
      </p>
    </section>
  );
}

function ManagementReportContent({ report }: { report: ManagementReport }) {
  const scale = Math.max(1, ...report.groups.map((g) => Math.max(g.full, g.contracted)));
  const commissions = report.commissions.filter((r) => r.amount !== 0);
  const contractedCommissions = commissions.filter((r) => r.kind === "contract");
  const potentialCommissions = commissions.filter((r) => r.kind === "potential");
  const commissionTotal = (items: typeof commissions) =>
    items.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const metrics = [
    {
      label: "При полной сдаче",
      value: report.full,
      missing: report.missingFull,
      color: "",
      delta: false,
    },
    {
      label: "По договорам",
      value: report.contracted,
      missing: report.missingContracted,
      color: "management-lime",
      delta: false,
    },
    {
      label: "Разница",
      value: report.difference,
      missing: report.missingDifference,
      color: "management-violet",
      delta: true,
    },
  ];
  return (
    <>
      <section className="management-dark">
        <div className="management-metrics">
          {metrics.map((metric) => (
            <div className="management-metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong className={metric.color}>
                {metric.missing && !metric.value
                  ? "—"
                  : metric.delta
                    ? differenceLabel(metric.value)
                    : amount(metric.value)}
              </strong>
              <small>руб. за месяц{metric.missing ? " · по известным условиям" : ""}</small>
            </div>
          ))}
        </div>
        <div className="management-groups">
          <h2>Ежемесячное управление по направлениям</h2>
          {report.groups.map((g) => (
            <div key={g.label} className="management-group">
              <strong>{g.label}</strong>
              <div
                className="management-group-stack"
                aria-label={`По договорам ${rubles(g.contracted)}, при полной сдаче ${rubles(g.full)}, разница ${rubles(g.difference)}`}
              >
                {g.contracted > 0 && (
                  <span
                    className="management-bar-contract"
                    style={{ width: `${(g.contracted / scale) * 100}%` }}
                  />
                )}
                {g.full > g.contracted && (
                  <span
                    className="management-bar-full"
                    style={{ width: `${((g.full - g.contracted) / scale) * 100}%` }}
                  />
                )}
              </div>
              <div className="management-group-values">
                <span className="management-lime">
                  {g.missingContracted && !g.contracted ? "—" : amount(g.contracted)} по договорам
                </span>
                <span>{g.missingFull && !g.full ? "—" : amount(g.full)} при полной сдаче</span>
                <span className="management-violet">
                  {g.missingDifference && !g.difference ? "—" : differenceLabel(g.difference)}{" "}
                  разница
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="management-commissions">
        <div>
          <h2>Разовые комиссии при сдаче</h2>
          {commissions.length ? (
            <ul>
              {commissions.map((r) => (
                <li key={r.kind + r.key}>
                  {r.title} · {r.kind === "contract" ? "по сделке" : "при сдаче"} ·{" "}
                  {r.amount === null ? "уточнить условия" : rubles(r.amount)}
                </li>
              ))}
            </ul>
          ) : (
            <p>В выбранном месяце расчётных комиссий нет.</p>
          )}
        </div>
        <div className="management-commission-totals">
          <span>
            По сделкам <strong>{rubles(commissionTotal(contractedCommissions))}</strong>
          </span>
          <span>
            При сдаче{" "}
            <strong>
              {rubles(
                potentialCommissions.length && potentialCommissions.every((r) => r.amount === null)
                  ? null
                  : commissionTotal(potentialCommissions),
              )}
            </strong>
          </span>
        </div>
      </section>

      <section>
        <h2 className="management-table-title">Расчёт по объектам</h2>
        {report.missingDifference > 0 && (
          <p className="management-note" role="status">
            Для сравнения не хватает условий по {report.missingDifference} объектам. Уточните строки
            с прочерком или пересечением договоров.
          </p>
        )}
        {report.rows.length ? (
          <div className="management-table-wrap" tabIndex={0}>
            <table className="management-table">
              <thead>
                <tr>
                  {[
                    "Объект",
                    "Статус и срок",
                    "Аренда / мес.",
                    "Условия объекта",
                    "По договорам",
                    "При полной сдаче",
                    "Разовая комиссия",
                  ].map((s) => (
                    <th scope="col" key={s}>
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.groups.map((g) => (
                  <ObjectRows
                    key={g.label}
                    group={g.label}
                    rows={report.rows.filter((r) => r.group === g.label)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="management-note">В текущем портфеле нет объектов для расчёта.</p>
        )}
        <p className="management-note">
          При полной сдаче применяется ставка карточки на весь месяц. По договорам учитываются
          согласованные условия и дни аренды.
        </p>
      </section>

      <Forecast key={report.month} chart={report.chart} />
    </>
  );
}

function ObjectRows({ group, rows }: { group: string; rows: ManagementReport["rows"] }) {
  if (!rows.length) return null;
  return (
    <>
      <tr className="management-table-group">
        <th colSpan={7}>{group}</th>
      </tr>
      {rows.map((r) => (
        <tr key={r.id}>
          <th scope="row">
            <Link to="/objects/$id" params={{ id: r.id }}>
              {r.title}
            </Link>
          </th>
          <td>
            <Status row={r} />
          </td>
          <td>
            {rubles(r.rent === null ? null : Math.round(r.rent * 100))}
            {r.seasonal && <small className="management-sub">Летняя ставка</small>}
          </td>
          <td>
            {r.commissionOnly
              ? r.commissionRate === null
                ? "Комиссия не указана"
                : r.commissionRate + "% разово"
              : r.feeValue === null
                ? "Условия не указаны"
                : r.feeType === "amount"
                  ? rubles(r.feeValue * 100) + " / мес."
                  : r.feeValue + "% в месяц"}
          </td>
          <td>{rubles(r.contracted)}</td>
          <td>
            <strong>{r.commissionOnly ? "—" : rubles(r.full)}</strong>
          </td>
          <td>
            {r.actualCommissions.length
              ? rubles(r.actualCommissions.reduce((sum, row) => sum + (row.amount ?? 0), 0))
              : rubles(r.possibleCommission?.amount ?? null)}
          </td>
        </tr>
      ))}
    </>
  );
}

export function FinanceManagementPage() {
  const [month, setMonth] = useState(() => financeToday().slice(0, 7));
  const report = useQuery({
    queryKey: ["finance-management", month],
    queryFn: () => readFinanceManagement({ data: { month } }),
  });
  return (
    <div className="finance-ui management-page">
      <header className="finance-page-header">
        <div className="management-section-heading">
          <div>
            <Link to="/finance/reports" className="management-back">
              Отчёты
            </Link>
            <h1>Доход от управления</h1>
          </div>
          <div className="management-picker">
            <button
              type="button"
              aria-label="Предыдущий месяц"
              onClick={() => setMonth(managementMonth(month, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <strong>{monthLabel(month)}</strong>
            <button
              type="button"
              aria-label="Следующий месяц"
              onClick={() => setMonth(managementMonth(month, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <FinanceTabs active="reports" />
      </header>
      <main className="management-body">
        {report.isPending && <p role="status">Загружаем договоры и цены…</p>}
        {report.error && <p role="alert">Не удалось рассчитать доход. {report.error.message}</p>}
        {report.data && <ManagementReportContent report={report.data} />}
      </main>
    </div>
  );
}
