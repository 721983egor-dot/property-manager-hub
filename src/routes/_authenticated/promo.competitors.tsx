import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminOnly } from "@/components/AdminOnly";
import { readRentOverview } from "@/lib/market/functions";
import {
  marketDate,
  marketComplexes,
  median,
  type MarketBuilding,
  type MarketGroup,
  type MarketPoint,
  type MarketProperty,
} from "@/lib/market/model";
import "./promo.competitors.css";

export const Route = createFileRoute("/_authenticated/promo/competitors")({
  validateSearch: (search: Record<string, unknown>) => ({
    house: typeof search["house"] === "string" ? search["house"] : undefined,
    property: typeof search["property"] === "string" ? search["property"] : undefined,
  }),
  component: () => (
    <AdminOnly>
      <Market />
    </AdminOnly>
  ),
});

type Overview = Awaited<ReturnType<typeof readRentOverview>>;
const integer = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("ru-RU", {
  style: "percent",
  signDisplay: "exceptZero",
  maximumFractionDigits: 1,
});
const monthName = new Intl.DateTimeFormat("ru-RU", {
  month: "short",
  year: "2-digit",
  timeZone: "Europe/Moscow",
});
const money = (price: number | null) => (price === null ? "—" : integer.format(price) + " ₽");
const day = (stamp: string | null) =>
  stamp ? new Date(stamp).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" }) : "—";
const number = (value: number | null) => (value === null ? "—" : String(value).replace(".", ","));
const colors = ["#258659", "#516ba1", "#b37b39", "#836ba8", "#367888", "#a65368"];

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rental-panel market-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function adjacent(a: MarketPoint | null, b: MarketPoint | null) {
  if (!a || !b) return false;
  const next = new Date(b.day.slice(0, 7) + "-01T00:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString().slice(0, 7) === a.day.slice(0, 7);
}

function movement(house: MarketBuilding) {
  const { latest, previousMonth } = house;
  if (!latest || !previousMonth || !adjacent(latest, previousMonth)) return null;
  if (JSON.stringify(latest.coveredHomes) !== JSON.stringify(previousMonth.coveredHomes))
    return null;
  const earlier = new Set(previousMonth.groupIds),
    later = new Set(latest.groupIds);
  return {
    difference:
      latest.median !== null && previousMonth.median
        ? latest.median / previousMonth.median - 1
        : null,
    appeared: latest.groupIds.filter((id) => !earlier.has(id)).length,
    disappeared: previousMonth.groupIds.filter((id) => !later.has(id)).length,
  };
}

function MarketChart({ houses }: { houses: MarketBuilding[] }) {
  const [picked, setPicked] = useState("");
  const available = houses.filter((house) => house.monthly.some((point) => point.median !== null));
  const selected = picked
    ? available.filter((house) => house.id === picked)
    : available.slice(0, colors.length);
  const knownMonths = selected
    .flatMap((house) => house.monthly.map((point) => point.day.slice(0, 7)))
    .sort();
  const first = knownMonths[0],
    last = knownMonths.at(-1);
  const rows: Record<string, string | number | null>[] = [];
  if (first && last) {
    const cursor = new Date(first + "-01T00:00:00Z");
    while (cursor.toISOString().slice(0, 7) <= last) {
      const month = cursor.toISOString().slice(0, 7);
      const row: Record<string, string | number | null> = { month: monthName.format(cursor) };
      selected.forEach((house, index) => {
        row["house" + index] =
          house.monthly.find((point) => point.day.startsWith(month))?.median ?? null;
      });
      rows.push(row);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return (
    <section className="rental-panel market-block">
      <div className="market-heading">
        <div>
          <h2>Медианные ставки по месяцам</h2>
          <p>Долгосрочная аренда · ₽/мес. · последний доступный срез месяца</p>
        </div>
        {available.length > 1 && (
          <label>
            На графике{" "}
            <select value={picked} onChange={(e) => setPicked(e.target.value)}>
              <option value="">Первые {colors.length} с данными</option>
              {available.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} · {h.address}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {rows.length > 0 ? (
        <>
          <div className="market-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 12, right: 24, bottom: 2, left: 10 }}>
                <CartesianGrid vertical={false} stroke="var(--rent-border)" />
                <XAxis dataKey="month" tick={{ fill: "var(--rent-muted)", fontSize: 11 }} />
                <YAxis
                  width={54}
                  tick={{ fill: "var(--rent-muted)", fontSize: 11 }}
                  tickFormatter={(value: number) => integer.format(value / 1000) + " тыс."}
                />
                <Tooltip formatter={(value) => (typeof value === "number" ? money(value) : "—")} />
                {selected.map((h, i) => (
                  <Line
                    key={h.id}
                    dataKey={"house" + i}
                    name={h.name}
                    type="linear"
                    stroke={colors[i]}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="market-legend">
            {selected.map((h, i) => (
              <span key={h.id}>
                <i style={{ background: colors[i] }} />
                {h.name}
              </span>
            ))}
          </div>
          {rows.length === 1 && (
            <p className="rental-muted">
              Пока есть данные только за один месяц. Динамика появится после следующего месячного
              среза.
            </p>
          )}
        </>
      ) : (
        <p className="rental-muted">Для выбранных домов пока нет срезов.</p>
      )}
    </section>
  );
}

function Market() {
  const search = Route.useSearch();
  const load = useServerFn(readRentOverview);
  const query = useQuery({
    queryKey: ["rental-market", search.house ?? null, search.property ?? null],
    queryFn: () => load({ data: search }),
  });
  if (!query.data)
    return (
      <p className="p-8">
        {query.isError
          ? "Не удалось загрузить аналитику. " + query.error.message
          : "Загружаем аналитику аренды…"}
      </p>
    );
  const { houses, detail, updatesConfigured } = query.data;
  return (
    <div className="rental-dashboard">
      <header className="rental-header">
        <div>
          <Link to="/promo" className="rental-back">
            <ArrowLeft size={14} /> Публикация и реклама
          </Link>
          <h1>Аналитика аренды</h1>
          <p>Рынок долгосрочной аренды по домам из каталога РМ ОС</p>
        </div>
        <span className="rental-date">
          <i /> Metrapi
        </span>
      </header>
      <nav className="market-tabs" aria-label="Раздел аналитики">
        <Link
          to="/promo/competitors"
          search={{ house: undefined, property: undefined }}
          className={!detail ? "current" : ""}
        >
          Обзор рынка
        </Link>
        {detail && <span className="current">Квартиры в доме</span>}
      </nav>
      {!updatesConfigured && (
        <p className="market-message">
          Для новых срезов нужен ключ Metrapi на сервере. Доступные срезы можно посмотреть ниже.
        </p>
      )}
      {(search.house || search.property) && !detail && (
        <p className="market-message">Дом не найден в каталоге. Выберите адрес из списка.</p>
      )}
      {detail ? (
        <House key={detail.house.id} detail={detail} propertyId={search.property} />
      ) : (
        <Portfolio houses={houses} />
      )}
    </div>
  );
}

function Portfolio({ houses }: { houses: MarketBuilding[] }) {
  const [search, setSearch] = useState("");
  const [published, setPublished] = useState(false);
  const needle = search.trim().toLocaleLowerCase("ru-RU");
  const matching = houses.filter(
    (house) =>
      !needle ||
      [house.name, house.address, ...house.propertyNames].some((value) =>
        value.toLocaleLowerCase("ru-RU").includes(needle),
      ),
  );
  const groups = marketComplexes(matching).filter((h) => !published || h.published > 0);
  const shown = groups.flatMap((h) => h.homes);
  const withData = groups.filter((h) => h.latest !== null);
  const month = marketDate(new Date()).slice(0, 7);
  const current = withData.filter((h) => h.latest?.day.startsWith(month));
  const comparable = current.flatMap((h) => {
    const change = movement(h);
    return change ? [change] : [];
  });
  return (
    <div className="market-stack">
      <section className="market-metrics" aria-label="Сводка рынка">
        <Metric
          label="Домов в выборке"
          value={shown.length}
          note={shown.filter((h) => h.published > 0).length + " с нашими публикациями"}
        />
        <Metric
          label="Активных предложений"
          value={
            current.length ? current.reduce((sum, h) => sum + (h.latest?.active ?? 0), 0) : "—"
          }
          note={"По " + current.length + " ЖК и домам со срезом текущего месяца"}
        />
        <Metric
          label="Появились в выдаче"
          value={comparable.length ? comparable.reduce((sum, c) => sum + c.appeared, 0) : "—"}
          note="По домам с двумя соседними месяцами"
        />
        <Metric
          label="Ушли из выдачи"
          value={comparable.length ? comparable.reduce((sum, c) => sum + c.disappeared, 0) : "—"}
          note="Причины снятия не подтверждены"
        />
      </section>
      <MarketChart key={String(published) + needle} houses={groups} />
      <section className="rental-panel market-table-panel">
        <header className="market-heading market-block">
          <div>
            <h2>ЖК и дома в каталоге</h2>
            <p>Откройте дом, чтобы увидеть все предложения, фильтры и цены.</p>
          </div>
          <div className="market-controls">
            <input
              type="search"
              aria-label="ЖК, адрес или объект"
              placeholder="ЖК, адрес или объект"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="market-check">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
              />{" "}
              С нашими публикациями
            </label>
          </div>
        </header>
        <div className="market-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>ЖК / дом</th>
                <th>Наших опубликовано</th>
                <th>На рынке</th>
                <th>Медиана, ₽/мес.</th>
                <th>К прошлому месяцу</th>
                <th>Появились / ушли</th>
                <th>Дней с публикации¹</th>
                <th>Последний срез</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((h) => {
                const change = movement(h);
                return (
                  <tr key={h.id}>
                    <td>
                      {h.homes.length > 1 ? (
                        <details className="market-houses">
                          <summary className="market-link">
                            {h.name} · {h.homes.length} адресов
                          </summary>
                          {h.homes.map((home) => (
                            <Link
                              key={home.id}
                              to="/promo/competitors"
                              search={{ house: home.id, property: undefined }}
                              className="market-link"
                            >
                              {home.address || home.name} →
                            </Link>
                          ))}
                        </details>
                      ) : (
                        <Link
                          to="/promo/competitors"
                          search={{ house: h.id, property: undefined }}
                          className="market-link"
                        >
                          {h.name} →
                        </Link>
                      )}
                      {h.homes.length === 1 && (
                        <small>{h.address || "Точный адрес не указан"}</small>
                      )}
                      {h.latest?.coveredHomes && h.latest.coveredHomes.length < h.homes.length && (
                        <small>
                          Срезы по {h.latest.coveredHomes.length} из {h.homes.length} адресов
                        </small>
                      )}
                    </td>
                    <td>{h.published}</td>
                    <td>{h.latest?.active ?? "—"}</td>
                    <td>{money(h.latest?.median ?? null)}</td>
                    <td>{change?.difference != null ? percent.format(change.difference) : "—"}</td>
                    <td>{change ? "+" + change.appeared + " / −" + change.disappeared : "—"}</td>
                    <td>{number(h.latest?.medianDays ?? null)}</td>
                    <td>
                      {h.latest
                        ? day(h.latest.checkedAt)
                        : h.unresolved
                          ? "Уточнить адрес"
                          : "Данные не загружены"}
                    </td>
                  </tr>
                );
              })}
              {!shown.length && (
                <tr>
                  <td colSpan={8}>Подходящих домов нет.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="market-footnote">
          ¹ Медиана возраста активных объявлений на дату среза. Повторные публикации сгруппированы
          по данным Metrapi.
        </p>
      </section>
    </div>
  );
}

type ListingRow = {
  id: string;
  name: string;
  area: number | null;
  floor: number | null;
  price: number | null;
  summer: number | null;
  source: string;
  category: string;
  own: boolean;
  photo?: string | undefined;
  competitor?: MarketGroup;
};
type SortKey = "area" | "floor" | "price" | "summer" | "unit" | "source" | "category";
function sortValue(row: ListingRow, key: SortKey) {
  if (key === "unit") return row.price && row.area ? row.price / row.area : null;
  return row[key];
}
function ownRow(p: MarketProperty): ListingRow {
  return {
    id: p.id,
    name: p.title,
    area: p.area,
    floor: p.floor,
    price: p.price_month,
    summer: p.summer_price_month,
    source: "РМ ОС",
    category: "",
    own: true,
  };
}

function exportMarketRows(rows: ListingRow[]) {
  const cells = [
    ["Объект", "Площадь", "Этаж", "Цена", "Летняя цена", "Площадка", "Ссылка"],
    ...rows.flatMap(
      (row) =>
        row.competitor?.offers.map((offer) => [
          row.name,
          row.area,
          row.floor,
          offer.price,
          offer.summerPrice ?? null,
          offer.source,
          offer.url,
        ]) ?? [[row.name, row.area, row.floor, row.price, row.summer, row.source, ""]],
    ),
  ];
  const csv = cells
    .map((line) =>
      line
        .map((cell) => {
          const value = String(cell ?? "");
          const safe = typeof cell === "string" && /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
          return '"' + safe.replaceAll('"', '""') + '"';
        })
        .join(";"),
    )
    .join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "rental-market.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function House({
  detail,
  propertyId,
}: {
  detail: NonNullable<Overview["detail"]>;
  propertyId?: string | undefined;
}) {
  const { house, snapshot, own } = detail;
  const [sort, setSort] = useState<{ key: SortKey; dir: number }>({ key: "price", dir: 1 });
  const [source, setSource] = useState("");
  const [areaFrom, setAreaFrom] = useState("");
  const [areaTo, setAreaTo] = useState("");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [floorFrom, setFloorFrom] = useState("");
  const [floorTo, setFloorTo] = useState("");
  const [season, setSeason] = useState("");
  const [expanded, setExpanded] = useState("");
  const sources = [
    ...new Set(snapshot?.listings.flatMap((g) => g.offers.map((o) => o.source)) ?? []),
  ].sort();
  const rows: ListingRow[] = [
    ...(snapshot?.listings ?? []).flatMap((group) => {
      if (group.possibleOwn && own.length) return [];
      const offers = group.offers
        .filter(
          (offer) => (!source || offer.source === source) && (!season || offer.category === season),
        )
        .sort((a, b) => a.price - b.price);
      const first = offers[0];
      return first
        ? [
            {
              id: group.id,
              name: group.layout,
              area: group.area,
              floor: group.floor,
              price: first.price,
              summer: first.summerPrice ?? null,
              source: [...new Set(offers.map((o) => o.source))].join(" / "),
              category: first.category,
              own: group.possibleOwn,
              photo: first.photos[0],
              competitor: { ...group, offers },
            },
          ]
        : [];
    }),
    ...(!source && !season ? own.map(ownRow) : []),
  ]
    .filter((row) => {
      const within = (v: number | null, from: string, to: string) =>
        (!from && !to) || (v !== null && (!from || v >= Number(from)) && (!to || v <= Number(to)));
      return (
        within(row.area, areaFrom, areaTo) &&
        within(row.price, priceFrom, priceTo) &&
        within(row.floor, floorFrom, floorTo)
      );
    })
    .sort((a, b) => {
      const x = sortValue(a, sort.key),
        y = sortValue(b, sort.key);
      if (x === null) return y === null ? 0 : 1;
      if (y === null) return -1;
      return (
        sort.dir *
        (typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "ru"))
      );
    });
  const competitors = rows.filter((r) => !r.own);
  const matchingMedian = median(competitors.flatMap((r) => (r.price === null ? [] : [r.price])));
  const prices = competitors.flatMap((r) => (r.price === null ? [] : [r.price]));
  const range = prices.length
    ? money(Math.min(...prices)) + " – " + money(Math.max(...prices))
    : "—";
  const filters = [
    ["Площадь, м²", areaFrom, setAreaFrom, areaTo, setAreaTo],
    ["Цена, ₽/мес.", priceFrom, setPriceFrom, priceTo, setPriceTo],
    ["Этаж", floorFrom, setFloorFrom, floorTo, setFloorTo],
  ] as const;
  const headers: [SortKey, string][] = [
    ["area", "Площадь"],
    ["floor", "Этаж"],
    ["price", "Цена, ₽/мес."],
    ["unit", "Цена за м²"],
    ["summer", "Летняя цена"],
    ["category", "Условия"],
    ["source", "Источник"],
  ];
  return (
    <div className="market-stack">
      <header className="rental-panel market-heading market-block">
        <div>
          <h2>{house.name}</h2>
          <p>{house.address || "Точный адрес не указан"}</p>
        </div>
        <span>{snapshot ? "Срез " + day(snapshot.checkedAt) : "Данные ещё не загружены"}</span>
      </header>
      <section className="market-metrics">
        <Metric
          label="Предложения в выборке"
          value={snapshot ? competitors.length : "—"}
          note="Кроме наших объектов"
        />
        <Metric
          label="Медиана выбранных предложений"
          value={money(matchingMedian)}
          note="На одну квартиру, ₽ в месяц"
        />
        <Metric label="Диапазон цен" value={range} note="С учётом выбранных фильтров" />
        <Metric
          label="Наших объектов в базе"
          value={own.length}
          note={house.published + " опубликовано"}
        />
      </section>
      <MarketChart houses={[house]} />
      <section className="rental-panel market-table-panel">
        <header className="market-heading market-block">
          <div>
            <h2>Все квартиры и предложения дома</h2>
            <p>
              {house.unresolved
                ? "Уточните адрес дома в каталоге."
                : "Сортировка по заголовкам столбцов."}
            </p>
          </div>
        </header>
        <div className="market-filters">
          <button
            type="button"
            className="market-export"
            disabled={!rows.length}
            onClick={() => exportMarketRows(rows)}
          >
            Экспорт CSV
          </button>
          {filters.map(([label, from, setFrom, to, setTo]) => (
            <fieldset key={label}>
              <legend>{label}</legend>
              <input
                type="number"
                aria-label={label + " от"}
                placeholder="От"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <input
                type="number"
                aria-label={label + " до"}
                placeholder="До"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </fieldset>
          ))}
          <label>
            Площадка
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Все</option>
              {sources.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Условия
            <select value={season} onChange={(e) => setSeason(e.target.value)}>
              <option value="">Любые</option>
              <option>Без повышения летом</option>
              <option>Сезонная</option>
              <option>Срок по карточке</option>
              <option>Длительная</option>
              <option>Проверить цену</option>
            </select>
          </label>
        </div>
        <div className="market-scroll">
          <table className="market-table market-listings">
            <thead>
              <tr>
                <th>Объект</th>
                {headers.map(([key, name]) => (
                  <th
                    key={key}
                    aria-sort={
                      sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setSort({ key, dir: sort.key === key ? -sort.dir : 1 })}
                    >
                      {name} <span>{sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : "↕"}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    className={row.own ? "rental-own-row" : undefined}
                    data-market-selected={row.id === propertyId ? "true" : undefined}
                  >
                    <td>
                      {row.competitor ? (
                        <button
                          type="button"
                          className="market-listing"
                          aria-expanded={expanded === row.id}
                          onClick={() => setExpanded(expanded === row.id ? "" : row.id)}
                        >
                          {row.photo && (
                            <img
                              src={row.photo}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <span>
                            {row.own && <small>Наш объект</small>}
                            {row.name}
                          </span>
                          <ChevronDown size={14} />
                        </button>
                      ) : (
                        <Link to="/objects/$id" params={{ id: row.id }} className="market-link">
                          <small>Наш объект{row.id === propertyId ? " · выбран" : ""}</small>
                          {row.name}
                        </Link>
                      )}
                    </td>
                    <td>{row.area === null ? "—" : number(row.area) + " м²"}</td>
                    <td>{number(row.floor)}</td>
                    <td className="rental-price">{money(row.price)}</td>
                    <td>{money(row.price && row.area ? row.price / row.area : null)}</td>
                    <td>{money(row.summer)}</td>
                    <td>{row.category || "—"}</td>
                    <td>{row.source}</td>
                  </tr>
                  {expanded === row.id && row.competitor && (
                    <tr>
                      <td colSpan={8}>
                        <div className="rental-offers">
                          {row.competitor.offers.map((offer) => (
                            <article key={offer.url} className="rental-offer">
                              <div className="rental-photos">
                                {offer.photos.map((photo, index) => (
                                  <a
                                    key={photo}
                                    href={photo}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={"Оригинал фото " + (index + 1)}
                                  >
                                    <img src={photo} alt="" referrerPolicy="no-referrer" />
                                  </a>
                                ))}
                              </div>
                              <div>
                                <a
                                  className="market-link"
                                  href={offer.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {offer.source} ↗
                                </a>{" "}
                                · {money(offer.price)}/мес. · {offer.terms}
                                <small>
                                  Опубликовано {day(offer.published)} · последнее подтверждение{" "}
                                  {day(offer.seen)}
                                </small>
                                {offer.history.map((event) => (
                                  <small key={event.at + event.new}>
                                    {day(event.at)} · {money(event.old)} → {money(event.new)}
                                  </small>
                                ))}
                              </div>
                            </article>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8}>
                    {snapshot
                      ? "По выбранным фильтрам предложений нет."
                      : "Ожидаем первый срез Metrapi."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="market-footnote">
          В расчёте одна ставка на группу дублей. Отметка «ушли из выдачи» сама по себе не
          подтверждает сдачу.
        </p>
      </section>
    </div>
  );
}
