import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FinanceTabs } from "./FinanceTabs";
import {
  fetchFinanceReportPropertyOptions,
  fetchPayments,
  financePropertyLabel,
  monthBounds,
  formatAdeskMoney,
} from "@/lib/finance";
import { fetchFinanceCatalog } from "@/lib/finance-articles";
import { fetchObligations } from "@/lib/finance-counterparties";
import { fetchFinanceObjectClasses, fetchFinanceObjectAssignments } from "@/lib/finance-objects";
import { filterFinanceObjects, objectFinanceSummary } from "@/lib/finance-object-model";
import "./finance-analytics.css";
export function FinanceObjectsPage() {
  const now = new Date(),
    bounds = monthBounds(now.getFullYear(), now.getMonth());
  const [classification, setClassification] = useState("all"),
    [search, setSearch] = useState("");
  const [month, setMonth] = useState(bounds.monthKey);
  const selected = monthBounds(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1);
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
  const error = [properties, payments, catalog, obligations, groups, assignments].find(
    (q) => q.error,
  )?.error;
  const loading = [properties, payments, catalog, obligations, groups, assignments].some(
    (q) => q.isPending,
  );
  const rows = useMemo(
    () =>
      filterFinanceObjects(
        properties.data ?? [],
        assignments.data ?? [],
        classification,
        search,
      ).map((property) => ({
        property,
        summary: objectFinanceSummary(
          property.id,
          payments.data ?? [],
          obligations.data ?? [],
          catalog.data ?? { articles: [], categories: [] },
          selected.from,
          selected.to,
        ),
      })),
    [
      properties.data,
      assignments.data,
      classification,
      search,
      payments.data,
      obligations.data,
      catalog.data,
      selected.from,
      selected.to,
    ],
  );
  return (
    <div className="finance-ui">
      <h1>Объекты</h1>
      <FinanceTabs active="objects" />
      <div className="fa-toolbar">
        <input
          aria-label="Поиск финансового объекта"
          placeholder="Найти объект"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="fa-button"
        />
        <select
          aria-label="Классификация объектов"
          value={classification}
          onChange={(e) => setClassification(e.target.value)}
        >
          <option value="all">Все классификации</option>
          <option value="none">Без классификации</option>
          {groups.data?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Месяц финансов объектов"
          type="month"
          value={month}
          onChange={(e) => {
            if (e.target.value) setMonth(e.target.value);
          }}
        />
        <Link className="fa-button" to="/finance/settings">
          Настроить классификации
        </Link>
      </div>
      <p className="fa-note">
        Финансы существующих объектов РМ ОС. Прибыль — за выбранный месяц, обязательства — текущий
        остаток. Параметры недвижимости здесь не меняются.
      </p>
      {error ? (
        <p role="alert" className="fa-error">
          Не удалось загрузить объекты. {error.message}
        </p>
      ) : loading ? (
        <p className="fa-empty">Загрузка объектов…</p>
      ) : (
        <section className="fa-panel">
          <div className="fa-table-wrap">
            <table className="fa-table">
              <thead>
                <tr>
                  <th>Объект</th>
                  <th>Классификация</th>
                  <th>Доходы</th>
                  <th>Расходы</th>
                  <th>Прибыль</th>
                  <th>Рентабельность</th>
                  <th>Обязательства, сальдо</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ property: p, summary: s }) => (
                  <tr key={p.id}>
                    <td>
                      <Link
                        className="fa-debt-link"
                        to="/finance/objects/$id"
                        params={{ id: p.id }}
                      >
                        {financePropertyLabel(p)}
                        {p.status === "archived" && <small> · Архив</small>}
                      </Link>
                    </td>
                    <td>
                      {groups.data?.find(
                        (g) =>
                          g.id ===
                          assignments.data?.find((a) => a.property_id === p.id)?.classification_id,
                      )?.name ?? "Без классификации"}
                    </td>
                    <td>{formatAdeskMoney(s.income)}</td>
                    <td>{formatAdeskMoney(s.expense)}</td>
                    <td className={s.net < 0 ? "fa-negative" : "fa-positive"}>
                      {formatAdeskMoney(s.net)}
                    </td>
                    <td>{s.margin === null ? "—" : `${s.margin.toFixed(1)} %`}</td>
                    <td>{formatAdeskMoney(s.debtBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <p className="fa-empty">Нет объектов по выбранным фильтрам.</p>}
        </section>
      )}
    </div>
  );
}
