import { FinanceObjectFlowSelector } from "./FinanceObjectFlowSelector";
import { useFinanceObjectFlow } from "@/hooks/use-finance-object-flow";
import { useFinanceToday } from "@/hooks/use-finance-today";
import { objectFlowPayments, objectFlowSummary, objectFlowNotes } from "@/lib/finance-object-flow";
import { fetchOwnerSettlements } from "@/lib/finance-owner-settlements";
import { signedUrls } from "@/lib/properties";
import { fetchFinanceObjectProperties, fetchFinanceRentals } from "@/lib/finance-rentals";
import { financeToday, rentalForProperty, rentalMonthPlan } from "@/lib/finance-rental-model";
import { ImageIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FinanceTabs } from "./FinanceTabs";
import { fetchPayments, financePropertyLabel, monthBounds, formatAdeskMoney } from "@/lib/finance";
import { fetchFinanceCatalog } from "@/lib/finance-articles";
import { fetchFinanceObjectClasses, fetchFinanceObjectAssignments } from "@/lib/finance-objects";
import { filterFinanceObjects } from "@/lib/finance-object-model";
import "./finance-analytics.css";
export function FinanceObjectsPage() {
  const today = useFinanceToday();
  const [flow, setFlow] = useFinanceObjectFlow();
  const [classification, setClassification] = useState("all"),
    [search, setSearch] = useState("");
  const [month, setMonth] = useState(today.slice(0, 7));
  const selected = monthBounds(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1);
  const properties = useQuery({
    queryKey: ["finance-object-properties", "active"],
    queryFn: () => fetchFinanceObjectProperties(false),
  });
  const rentals = useQuery({ queryKey: ["finance-rentals"], queryFn: fetchFinanceRentals });
  const photoPaths = (properties.data ?? []).flatMap((p) =>
    p.first_photo_path ? [p.first_photo_path] : [],
  );
  const photos = useQuery({
    queryKey: ["finance-object-photos", photoPaths],
    queryFn: () => signedUrls(photoPaths),
    enabled: photoPaths.length > 0,
    staleTime: 5 * 60 * 60 * 1000,
  });
  const payments = useQuery({
    queryKey: ["payments", "analytics"],
    queryFn: () => fetchPayments(),
  });
  const catalog = useQuery({ queryKey: ["finance-catalog"], queryFn: fetchFinanceCatalog });
  const settlements = useQuery({
    queryKey: ["finance-owner-settlements"],
    queryFn: () => fetchOwnerSettlements(),
  });
  const groups = useQuery({
    queryKey: ["finance-object-classes"],
    queryFn: fetchFinanceObjectClasses,
  });
  const assignments = useQuery({
    queryKey: ["finance-object-settings"],
    queryFn: fetchFinanceObjectAssignments,
  });
  const error = [properties, payments, catalog, settlements, groups, assignments, rentals].find(
    (q) => q.error,
  )?.error;
  const loading = [properties, payments, catalog, settlements, groups, assignments, rentals].some(
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
        summary: objectFlowSummary(
          objectFlowPayments(
            property.id,
            payments.data ?? [],
            catalog.data ?? { articles: [], categories: [] },
            flow,
            assignments.data ?? [],
            settlements.data ?? [],
          ),
          catalog.data ?? { articles: [], categories: [] },
          selected.from,
          selected.to,
          today,
        ),
      })),
    [
      properties.data,
      assignments.data,
      classification,
      search,
      payments.data,
      settlements.data,
      flow,
      today,
      catalog.data,
      selected.from,
      selected.to,
    ],
  );
  return (
    <div className="finance-ui">
      <h1>Объекты</h1>
      <FinanceTabs active="objects" />
      <div className="fa-toolbar finance-object-flow-toolbar">
        <FinanceObjectFlowSelector value={flow} onChange={setFlow} />
      </div>
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
        {objectFlowNotes[flow]} Приход и расход — факт за выбранный месяц; остаток учитывает всю
        историю объекта.
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
                  <th>Аренда в месяц</th>
                  <th>Комиссия компании</th>
                  <th>Приход</th>
                  <th>Расходы</th>
                  <th>Движение за месяц</th>
                  <th>Остаток по операциям</th>
                  <th>Прогноз на конец месяца</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ property: p, summary: s }) => {
                  const { booking, conflict } = rentalForProperty(
                    rentals.data ?? [],
                    p.id,
                    financeToday(),
                  );
                  const rate = p.management_fee_value;
                  const plan = booking
                    ? rentalMonthPlan(booking, month, rate, p.management_fee_type)
                    : null;
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link
                          className="fa-debt-link finance-object-list-link"
                          to="/finance/objects/$id"
                          params={{ id: p.id }}
                        >
                          {p.first_photo_path && photos.data?.[p.first_photo_path] ? (
                            <img
                              className="finance-object-thumbnail"
                              src={photos.data[p.first_photo_path]}
                              alt=""
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <span className="finance-object-thumbnail finance-object-no-photo">
                              <ImageIcon size={22} />
                            </span>
                          )}
                          <span>
                            {financePropertyLabel(p)}
                            {booking && (
                              <small className="finance-object-rent-dates">
                                {booking.start_date > financeToday()
                                  ? "Аренда с " + booking.start_date
                                  : "Сдан до " + booking.end_date}
                              </small>
                            )}
                            {conflict && <small className="fa-negative">Проверьте договоры</small>}
                          </span>
                          {p.status === "archived" && <small> · Архив</small>}
                        </Link>
                      </td>
                      <td>
                        {groups.data?.find(
                          (g) =>
                            g.id ===
                            assignments.data?.find((a) => a.property_id === p.id)
                              ?.classification_id,
                        )?.name ?? "Без классификации"}
                      </td>
                      <td>{plan?.rent != null ? formatAdeskMoney(plan.rent) : "—"}</td>
                      <td>
                        {plan?.fee != null ? (
                          <>
                            {rate}
                            {p.management_fee_type === "amount" ? " ₽" : "%"}
                            <small className="finance-object-rent-dates">
                              {formatAdeskMoney(plan.fee)} / мес
                            </small>
                          </>
                        ) : (
                          "Не задана"
                        )}
                      </td>
                      <td>{formatAdeskMoney(s.income)}</td>
                      <td>{formatAdeskMoney(s.expense)}</td>
                      <td className={s.net < 0 ? "fa-negative" : "fa-positive"}>
                        {formatAdeskMoney(s.net)}
                      </td>
                      <td>{formatAdeskMoney(s.actualBalance)}</td>
                      <td>{formatAdeskMoney(s.forecastBalance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rows.length && <p className="fa-empty">Нет объектов по выбранным фильтрам.</p>}
        </section>
      )}
    </div>
  );
}
