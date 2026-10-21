import { useState } from "react";
import type { ObjectProfitability } from "@/lib/finance-object-profitability";
import { groupEntries, type ReportEntry } from "@/lib/finance-analytics";
import { formatAdeskMoney as money } from "@/lib/finance";
import "./finance-object-profitability.css";

const percent = (value: number | null) =>
  value === null ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} %`;
export function FinanceObjectProfitability({
  report,
  from,
  to,
  show,
}: {
  report: ObjectProfitability;
  from: string;
  to: string;
  show: (title: string, entries: ReportEntry[]) => void;
}) {
  const [sort, setSort] = useState("desc");
  const rows = [...report.rows].sort((a, b) =>
    sort === "name"
      ? a.label.localeCompare(b.label, "ru")
      : sort === "asc"
        ? a.net - b.net
        : b.net - a.net,
  );
  const max = Math.max(1, ...report.rows.map((g) => Math.abs(g.net)));
  const income = report.entries.filter((e) => e.payment.direction === "in");
  const expense = report.entries.filter((e) => e.payment.direction === "out");
  const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU");
  return (
    <div className="object-profitability">
      <div className="op-period">
        <strong>
          {date(from)} — {date(to)}
        </strong>
        <span>По начислениям · прибыль компании</span>
      </div>
      {report.unallocated > 0 && (
        <p role="status" className="op-warning">
          В аренде на {money(report.unallocated)} не определена комиссия. Эти суммы показаны в
          начислениях гостям, но не включены в выручку и прибыль. Доля собственников показана только
          для распределённой аренды.
        </p>
      )}
      <div className="op-metrics">
        {[
          {
            label: "Выручка компании",
            value: money(report.income),
            note: "Комиссия за управление и услуги",
            entries: income,
          },
          {
            label: "Расходы на объекты",
            value: money(report.expense),
            note: "Расходы за счёт компании",
            entries: expense,
          },
          {
            label: "Прибыль компании",
            value: money(report.net),
            note: "Выручка минус расходы",
            entries: report.entries,
            primary: true,
          },
          {
            label: "Рентабельность",
            value: percent(report.margin),
            note: "Доля прибыли в выручке компании",
          },
        ].map((k) => (
          <section key={k.label} className={`op-metric ${k.primary ? "op-primary" : ""}`}>
            <label>{k.label}</label>
            {k.entries ? (
              <button
                disabled={!k.entries.length}
                className={k.primary && report.net < 0 ? "fa-negative" : ""}
                onClick={() => show(k.label, k.entries!)}
              >
                {k.value}
              </button>
            ) : (
              <strong>{k.value}</strong>
            )}
            <p>{k.note}</p>
          </section>
        ))}
      </div>
      <div className="op-grid">
        <section className="op-panel">
          <h2>Прибыль по объектам</h2>
          <p>За выбранный период, ₽ · зелёный — прибыль, красный — убыток</p>
          <div className="op-ranking">
            {report.rows.slice(0, 10).map((g) => (
              <button key={g.id} className="op-rank" onClick={() => show(g.label, g.entries)}>
                <span>{g.label}</span>
                <span className="op-track">
                  <i
                    className={g.net < 0 ? "op-loss" : ""}
                    style={{ width: `${(Math.abs(g.net) / max) * 100}%` }}
                  />
                </span>
                <strong className={g.net < 0 ? "fa-negative" : "fa-positive"}>
                  {money(g.net)}
                </strong>
              </button>
            ))}
          </div>
          {!rows.length && (
            <p className="fa-empty">За выбранный период нет начислений по объектам.</p>
          )}
          {rows.length > 10 && (
            <p>Показаны первые 10 объектов по прибыли. Все объекты — в таблице ниже.</p>
          )}
        </section>
        <section className="op-panel">
          <h2>Как складывается результат</h2>
          <p>От аренды до прибыли компании</p>
          <div className="op-formula">
            <div>
              <span>Начислено гостям за аренду</span>
              <span>{money(report.guest)}</span>
            </div>
            <div>
              <span>Доля собственников{report.unallocated > 0 ? " (известная)" : ""}</span>
              <span>{money(report.owner)}</span>
            </div>
            <div className="op-subtotal">
              <span>Выручка компании</span>
              <span>{money(report.income)}</span>
            </div>
            {groupEntries(income, (e) => e.article).map((g) => (
              <div className="op-sub" key={g.name}>
                <button onClick={() => show(g.name, g.items)}>{g.name}</button>
                <span>{money(g.income)}</span>
              </div>
            ))}
            <div>
              <span>− Расходы компании на объекты</span>
              <span>{money(report.expense)}</span>
            </div>
            <div className="op-subtotal">
              <strong>Прибыль компании</strong>
              <strong className={report.net < 0 ? "fa-negative" : "fa-positive"}>
                {money(report.net)}
              </strong>
            </div>
          </div>
        </section>
      </div>
      <section className="op-panel">
        <div className="op-table-heading">
          <div>
            <h2>
              Детализация по объектам <small>{rows.length}</small>
            </h2>
            <p>Нажмите на объект для расшифровки доходов и расходов</p>
          </div>
          <select
            aria-label="Сортировка прибыльности"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="desc">Сначала прибыльные</option>
            <option value="asc">Сначала убыточные</option>
            <option value="name">По названию</option>
          </select>
        </div>
        <div className="fa-table-wrap">
          <table className="fa-table op-table">
            <thead>
              <tr>
                <th>Объект</th>
                <th>Начислено гостям</th>
                <th>Доля собственника</th>
                <th>Выручка компании</th>
                <th>Расходы</th>
                <th>Прибыль</th>
                <th>Рентаб.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <td>
                    <button onClick={() => show(g.label, g.entries)}>
                      {g.label}
                      <small>
                        {["house", "villa", "townhouse"].includes(g.type ?? "")
                          ? "Дом"
                          : ["apartment", "aparts"].includes(g.type ?? "")
                            ? "Квартира"
                            : "Тип не указан"}
                      </small>
                    </button>
                  </td>
                  <td>{money(g.guest)}</td>
                  <td>{g.unallocated ? `${money(g.owner)} *` : money(g.owner)}</td>
                  <td>{money(g.income)}</td>
                  <td>{money(g.expense)}</td>
                  <td className={g.net < 0 ? "fa-negative" : "fa-positive"}>{money(g.net)}</td>
                  <td>{percent(g.margin)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Итого по выборке</td>
                <td>{money(report.guest)}</td>
                <td>
                  {money(report.owner)}
                  {report.unallocated > 0 ? " *" : ""}
                </td>
                <td>{money(report.income)}</td>
                <td>{money(report.expense)}</td>
                <td className={report.net < 0 ? "fa-negative" : "fa-positive"}>
                  {money(report.net)}
                </td>
                <td>{percent(report.margin)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {!rows.length && (
          <p className="fa-empty">Нет данных. Измените период или фильтры объектов.</p>
        )}
        <p className="op-footnote">
          Общие расходы компании без привязки к объекту в отчёт не входят. Депозиты, КУ и расходы
          собственника исключены из прибыли. Виллы и таунхаусы относятся к домам, апартаменты — к
          квартирам.
        </p>
      </section>
    </div>
  );
}
