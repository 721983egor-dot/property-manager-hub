import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FinanceObjectFlowSelector } from "./FinanceObjectFlowSelector";
import PaymentAccountsChart from "./PaymentAccountsChart";
import { useFinanceObjectFlow } from "@/hooks/use-finance-object-flow";
import { financeOverview, readOverviewOpenings } from "@/lib/finance-overview-model";
import { fetchFinanceCatalog } from "@/lib/finance-articles";
import {
  formatAdeskMoney as money,
  formatFinanceDate,
  rentalPaymentLabel,
  financePropertyLabel,
  type Payment,
} from "@/lib/finance";
import { objectFlowLabels } from "@/lib/finance-object-flow";
import type { FinanceObjectAssignment } from "@/lib/finance-objects";
import type { OwnerSettlement } from "@/lib/finance-owner-settlements";

export function FinanceOverview({
  payments,
  settings,
  settlements,
  month,
  today,
  propertyId,
  onOpen,
  onClients,
  onOwners,
}: {
  payments: Payment[];
  settings: FinanceObjectAssignment[];
  settlements: OwnerSettlement[];
  month: string;
  today: string;
  propertyId: string;
  onOpen: (payment: Payment) => void;
  onClients: () => void;
  onOwners: () => void;
}) {
  const [flow, setFlow] = useFinanceObjectFlow("company", "rm-os-finance-overview-flow");
  const [openings, setOpenings] = useState(() =>
    readOverviewOpenings(null, month, today, propertyId),
  );
  useEffect(() => {
    const update = () => {
      try {
        setOpenings(readOverviewOpenings(window.localStorage, month, today, propertyId));
      } catch {
        setOpenings(readOverviewOpenings(null, month, today, propertyId));
      }
    };
    update();
    window.addEventListener("focus", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("storage", update);
    };
  }, [month, today, propertyId]);
  const {
    data: catalog,
    isPending,
    error,
  } = useQuery({ queryKey: ["finance-catalog"], queryFn: fetchFinanceCatalog });
  const overview = useMemo(
    () =>
      financeOverview(
        payments,
        catalog ?? { categories: [], articles: [] },
        settings,
        settlements,
        month,
        today,
        propertyId === "all" ? null : propertyId,
        openings,
      ),
    [payments, catalog, settings, settlements, month, today, propertyId, openings],
  );
  if (isPending) return <p className="fw-loading">Загрузка обзора…</p>;
  if (error)
    return (
      <p role="alert" className="fw-error">
        Не удалось загрузить статьи для расчёта обзора: {error.message}
      </p>
    );
  const chart = overview.flows[flow];
  return (
    <div className="fw-overview">
      <div className="fw-result-caption">
        Результат компании за выбранный месяц{" "}
        <small>По проведённым операциям · без денег собственников и депозитов</small>
      </div>
      <div className="fw-metrics fw-overview-metrics">
        <OverviewMetric
          label="Выручка компании"
          amount={overview.income}
          note="Комиссия и собственные услуги"
          positive
        />
        <OverviewMetric
          label="Расходы компании"
          amount={overview.expense}
          note="Ваши операционные расходы"
        />
        <OverviewMetric
          label="Результат компании"
          amount={overview.profit}
          note="Выручка минус внесённые расходы"
          highlight
          positive={overview.profit >= 0}
        />
      </div>
      <div className="fw-balance-caption">
        Остатки на {formatFinanceDate(today)} · по внесённым операциям и начальным остаткам этого
        браузера
      </div>
      <section className="fw-reserves" aria-label="Распределение денег на сегодня">
        <div>
          <label>Всего на счетах и в кассе</label>
          <strong>{money(overview.bank)}</strong>
        </div>
        <span aria-hidden="true">−</span>
        <button onClick={onOwners}>
          <label>Деньги собственников</label>
          <strong className="fw-owner-color">{money(overview.ownerReserve)}</strong>
          <small>К перечислению · не выручка</small>
        </button>
        <span aria-hidden="true">−</span>
        <div>
          <label>Страховые депозиты</label>
          <strong>{money(overview.deposits)}</strong>
          <small>К возврату · не выручка</small>
        </div>
        {Math.abs(overview.unallocatedBalance) >= 0.01 && (
          <>
            <span aria-hidden="true">−</span>
            <div>
              <label>Нераспределённый остаток</label>
              <strong>{money(overview.unallocatedBalance)}</strong>
              <small>Требуется сверка</small>
            </div>
          </>
        )}
        <span aria-hidden="true">=</span>
        <div className="fw-own-cash">
          <label>Деньги компании</label>
          <strong className={overview.available >= 0 ? "fw-positive" : "fw-negative"}>
            {money(overview.available)}
          </strong>
          <small>До будущих расходов и налогов</small>
        </div>
      </section>
      {Math.abs(overview.unallocatedBalance) >= 0.01 && (
        <div className="fw-notice">
          Остатки требуют сверки: {money(overview.unallocatedBalance)} не распределено между
          компанией, собственниками и депозитами. В эту разницу могут входить общие начальные
          остатки, аренда без комиссии и исключённые статьи. Она не прибавляется к деньгам компании.
          Уточните состав остатка в настройках потоков календаря.
        </div>
      )}
      {overview.unallocatedRent > 0 && (
        <div className="fw-notice">
          Полученных арендных платежей без распределения: {overview.unallocatedRent}. Укажите
          договор и комиссию — пока эти деньги не считаются выручкой компании.{" "}
          <button className="fw-link" onClick={onClients}>
            Открыть клиентов →
          </button>
        </div>
      )}
      <section className="fw-overview-chart" aria-label={`График: ${objectFlowLabels[flow]}`}>
        <div className="fw-overview-chart-head">
          <div>
            <h2>
              {flow === "company"
                ? "Деньги компании"
                : flow === "owner"
                  ? "Деньги собственников у компании"
                  : "Все деньги на счетах"}
            </h2>
            <p>Остаток с учётом предыдущих периодов</p>
          </div>
          <FinanceObjectFlowSelector value={flow} onChange={setFlow} label="Поток денег обзора" />
        </div>
        <p className="fw-chart-total">
          На конец выбранного месяца: <b>{money(chart.forecastBalance)}</b>
        </p>
        <PaymentAccountsChart
          title=""
          ledger={chart.calendar.ledger}
          chart={chart.calendar.chart}
          today={today}
          color={flow === "company" ? "#20866e" : flow === "owner" ? "#9467c5" : "#347fe0"}
        />
      </section>
      <div className="fw-forecast-strip">
        <div>
          <label>Ожидается выручки компании в выбранном месяце</label>
          <strong className="fw-positive">{money(overview.expectedIncome)}</strong>
        </div>
        <div>
          <label>Плановые расходы компании</label>
          <strong>{money(overview.expectedExpense)}</strong>
        </div>
        <div>
          <label>Деньги компании на конец месяца</label>
          <strong
            className={overview.flows.company.forecastBalance < 0 ? "fw-negative" : "fw-positive"}
          >
            {money(overview.flows.company.forecastBalance)}
          </strong>
        </div>
        <p>
          Прогноз учитывает непроведённые суммы операций. Факт показан сплошной линией, прогноз —
          пунктиром.
        </p>
      </div>
      <section className="fw-panel fw-upcoming">
        <div className="fw-panel-head">
          <div>
            <h2>Ближайшие платежи</h2>
            <p>
              Просрочки и следующие 7 дней · {formatFinanceDate(today)} —{" "}
              {formatFinanceDate(overview.weekEnd)}
            </p>
          </div>
          <span className={overview.overdueCount ? "fw-negative" : ""}>
            Просроченных: {overview.overdueCount}
          </span>
        </div>
        {overview.upcoming.length === 0 ? (
          <p className="py-5">Просрочек и плановых платежей на ближайшие 7 дней нет.</p>
        ) : (
          overview.upcoming.slice(0, 6).map(({ payment: p, remaining, forecastOnly, overdue }) => (
            <button className="fw-upcoming-row" key={p.id} onClick={() => onOpen(p)}>
              <span className={overdue ? "fw-negative" : ""}>
                {formatFinanceDate(p.planned_date)}
                <small>
                  {overdue ? "Просрочено" : forecastOnly ? "Прогноз" : "Плановый платёж"}
                </small>
              </span>
              <span
                className={`fw-direction ${p.direction === "in" ? "incoming" : p.kind === "owner_payout" ? "owner" : "outgoing"}`}
              >
                {p.direction === "in" ? "↙" : "↗"}
              </span>
              <span className="fw-upcoming-description">
                <b>{rentalPaymentLabel(p)}</b>
                <small>
                  {p.property ? financePropertyLabel(p.property) : "Без объекта"} ·{" "}
                  {p.client?.full_name || p.counterparty_name || p.comment || "Операция"}
                </small>
              </span>
              <span className="fw-badge">
                {p.kind === "owner_payout"
                  ? "Собственник"
                  : p.kind === "rent_in" || ["rent", "utilities"].includes(p.rental_component ?? "")
                    ? "Клиент"
                    : ["deposit_in", "deposit_out"].includes(p.kind)
                      ? "Депозит"
                      : "Компания"}
              </span>
              <strong className={p.direction === "in" ? "fw-positive" : ""}>
                {p.direction === "in" ? "+" : "−"}
                {money(remaining)}
              </strong>
              <span className="fw-upcoming-open">Открыть →</span>
            </button>
          ))
        )}
        <div className="fw-upcoming-footer">
          <Link to="/finance/calendar">Все движения и календарь →</Link>
          <button className="fw-link" onClick={onOwners}>
            Расчёты с собственниками →
          </button>
        </div>
      </section>
    </div>
  );
}
function OverviewMetric({
  label,
  amount,
  note,
  positive,
  highlight,
}: {
  label: string;
  amount: number;
  note: string;
  positive?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`fw-metric ${highlight ? "fw-metric-highlight" : ""}`}>
      <label>{label}</label>
      <strong className={amount < 0 ? "fw-negative" : positive ? "fw-positive" : ""}>
        {money(amount)}
      </strong>
      <small>{note}</small>
    </div>
  );
}
