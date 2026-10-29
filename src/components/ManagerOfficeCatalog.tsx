import {
  emptyManagerCatalogFilters,
  filterManagerCatalog,
  catalogComplexOptions,
  catalogFilterError,
  type ManagerCatalogFilters,
} from "@/lib/manager-catalog-filters";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Plus, ArrowRight, MapPin, Pencil } from "lucide-react";
import { toast } from "sonner";
import { OfficeTabs, useManagerCatalog, useManagerPhotos } from "./WorkingSelections";
import { saveManagerNoteFn } from "@/lib/working-selections.functions";
import {
  formatMoney,
  roomsLabel,
  yandexMapsUrl,
  floorLabel,
  labelsFor,
  APPLIANCE_OPTIONS,
  BATHROOM_FEATURE_OPTIONS,
  OUTDOOR_OPTIONS,
  extraFeatureLabel,
} from "@/lib/properties";
import { fetchStaffCurrentBooking, priceOn, shortName } from "@/lib/bookings";
import { formatDateRu, toISODate } from "@/lib/rentals";
import { BookingDialog } from "./BookingDialog";
import { PropertyVideoPlayer } from "./PropertyVideoPlayer";
import { storedVideoPath } from "@/lib/property-video";
import { signedUrls } from "@/lib/properties";
import type { ManagerProperty } from "@/lib/manager-property-view";
import "./manager-office.css";
const statuses: Record<string, string> = {
  free: "Свободен",
  soon_free: "Скоро свободен",
  rented: "Сдан",
  booked: "Забронирован",
  archived: "Архив",
};
const label = (p: ManagerProperty) => p.internal_name || p.title || `Объект №${p.ref_id}`;
export function ManagerOfficeCatalog() {
  const q = useManagerCatalog(),
    navigate = useNavigate();
  const [filters, setFilters] = useState(emptyManagerCatalogFilters);
  const [selected, setSelected] = useState<string[]>([]),
    [loaded, setLoaded] = useState(false);
  function filter<K extends keyof ManagerCatalogFilters>(key: K, value: ManagerCatalogFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  const amount = (value: string) => (value.trim() === "" ? undefined : Math.max(0, Number(value)));
  const actorId = q.data?.actor.id;
  useEffect(() => {
    if (!actorId) return;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(`office-catalog-selection-${actorId}`) || "[]",
      );
      if (Array.isArray(saved))
        setSelected(
          saved.filter(
            (id: unknown) => typeof id === "string" && q.data?.properties.some((p) => p.id === id),
          ),
        );
    } catch {
      /* A restricted browser can still keep the selection in memory. */
    }
    setLoaded(true);
  }, [actorId, q.data?.properties]);
  useEffect(() => {
    if (loaded && actorId)
      try {
        sessionStorage.setItem(`office-catalog-selection-${actorId}`, JSON.stringify(selected));
      } catch {
        /* A restricted browser can still keep the selection in memory. */
      }
  }, [selected, loaded, actorId]);
  const photos = useManagerPhotos(q.data?.properties ?? []);
  if (q.isPending) return <p className="p-6">Загрузка объектов…</p>;
  if (q.error || !q.data)
    return (
      <p role="alert" className="p-6">
        Не удалось загрузить каталог: {q.error?.message}
        <button onClick={() => void q.refetch()}>Повторить</button>
      </p>
    );
  const properties = filterManagerCatalog(q.data.properties, filters);
  const complexes = catalogComplexOptions(q.data.properties);
  const filterError = catalogFilterError(filters);
  const filtered = JSON.stringify(filters) !== JSON.stringify(emptyManagerCatalogFilters());
  const toggle = (id: string) =>
    setSelected((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  function prepare() {
    try {
      sessionStorage.setItem("office-selection-draft", JSON.stringify(selected));
      void navigate({ to: "/selections/$id", params: { id: "new" } });
    } catch {
      toast.error(
        "Браузер не разрешил сохранить выбор. Откройте «Подборки» и добавьте объекты там.",
      );
    }
  }
  return (
    <div className="office-workspace">
      <header>
        <div>
          <h1>Объекты</h1>
          <p>Подберите варианты клиенту и подготовьте рабочую подборку к показу</p>
        </div>
        <Link to="/selections" className="of-button">
          Все подборки →
        </Link>
      </header>
      <OfficeTabs active="objects" />
      <section className="of-filter-panel" aria-label="Фильтры объектов">
        <div className="of-catalog-filters">
          <label className="of-search-field">
            Поиск
            <div className="of-search">
              <Search size={18} />
              <input
                aria-label="Поиск объектов"
                placeholder="Название, комплекс или адрес"
                value={filters.search}
                onChange={(e) => filter("search", e.target.value)}
              />
            </div>
          </label>
          <label>
            Жилой комплекс
            <select
              aria-label="Жилой комплекс"
              value={filters.complex}
              onChange={(e) => filter("complex", e.target.value)}
            >
              <option value="all">Все комплексы</option>
              <option value="none">Без комплекса</option>
              {complexes.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Тип объекта
            <select
              aria-label="Тип объекта"
              value={filters.type}
              onChange={(e) => filter("type", e.target.value as ManagerCatalogFilters["type"])}
            >
              <option value="all">Дома и квартиры</option>
              <option value="apartment">Квартиры</option>
              <option value="house">Дома</option>
              <option value="townhouse">Таунхаусы</option>
            </select>
          </label>
          <label>
            Цена от, ₽ / месяц
            <input
              type="number"
              min="0"
              step="1000"
              aria-label="Цена от"
              placeholder="Без ограничения"
              value={filters.minPrice ?? ""}
              onChange={(e) => filter("minPrice", amount(e.target.value))}
            />
          </label>
          <label>
            Цена до, ₽ / месяц
            <input
              type="number"
              min="0"
              step="1000"
              aria-label="Цена до"
              placeholder="Без ограничения"
              value={filters.maxPrice ?? ""}
              onChange={(e) => filter("maxPrice", amount(e.target.value))}
            />
          </label>
          <label>
            Количество комнат
            <select
              aria-label="Количество комнат"
              value={filters.rooms}
              onChange={(e) => filter("rooms", e.target.value as ManagerCatalogFilters["rooms"])}
            >
              <option value="all">Любое</option>
              <option value="0">Студия</option>
              <option value="1">1 комната</option>
              <option value="2">2 комнаты</option>
              <option value="3">3 комнаты</option>
              <option value="4+">4 и больше</option>
            </select>
          </label>
          <label>
            Сортировка
            <select
              aria-label="Сортировка"
              value={filters.sort}
              onChange={(e) => filter("sort", e.target.value as ManagerCatalogFilters["sort"])}
            >
              <option value="name">По названию</option>
              <option value="price_asc">Сначала дешевле</option>
              <option value="price_desc">Сначала дороже</option>
              <option value="area_desc">Сначала просторнее</option>
            </select>
          </label>
        </div>
        <details className="of-more-filters">
          <summary>
            Ещё фильтры <span>Площадь, публикация, сезон</span>
          </summary>
          <div className="of-catalog-extra">
            <label>
              Площадь от, м²
              <input
                type="number"
                min="0"
                aria-label="Площадь от"
                value={filters.minArea ?? ""}
                placeholder="Любая"
                onChange={(e) => filter("minArea", amount(e.target.value))}
              />
            </label>
            <label>
              Площадь до, м²
              <input
                type="number"
                min="0"
                aria-label="Площадь до"
                value={filters.maxArea ?? ""}
                placeholder="Любая"
                onChange={(e) => filter("maxArea", amount(e.target.value))}
              />
            </label>
            <label>
              Публикация на сайте
              <select
                aria-label="Публикация на сайте"
                value={filters.published}
                onChange={(e) =>
                  filter("published", e.target.value as ManagerCatalogFilters["published"])
                }
              >
                <option value="all">Все объекты</option>
                <option value="yes">Опубликованы</option>
                <option value="no">Не опубликованы</option>
              </select>
            </label>
            <label>
              По какой цене искать
              <select
                aria-label="Сезон цены"
                value={filters.priceBasis}
                onChange={(e) =>
                  filter("priceBasis", e.target.value as ManagerCatalogFilters["priceBasis"])
                }
              >
                <option value="regular">Обычная цена</option>
                <option value="summer">Летняя цена</option>
              </select>
            </label>
          </div>
        </details>
        {filtered && (
          <button
            className="of-reset-filters"
            onClick={() => setFilters(emptyManagerCatalogFilters())}
          >
            Сбросить фильтры
          </button>
        )}
        {filterError && (
          <p className="of-error" role="alert">
            {filterError}
          </p>
        )}
      </section>
      <div className="of-filter-tabs">
        {[
          ["all", "Все объекты"],
          ["free", "Свободны"],
          ["soon_free", "Скоро свободны"],
          ["rented", "Сданы"],
          ["booked", "Забронированы"],
          ["archive", "Архив"],
        ].map(([key, title]) => (
          <button
            key={key}
            className={filters.status === key ? "active" : ""}
            aria-pressed={filters.status === key}
            onClick={() => filter("status", key as ManagerCatalogFilters["status"])}
          >
            {title}
          </button>
        ))}
      </div>
      <p className="of-subtle">
        Найдено: {properties.length} · Выбрано для показа: {selected.length}
        {filters.priceBasis === "summer" ? " · Поиск по летней цене" : ""}
      </p>
      <div className="of-catalog-table">
        <div className="of-catalog-head">
          <span></span>
          <span>Объект</span>
          <span>Условия аренды</span>
          <span>Доступность</span>
          <span></span>
        </div>
        {properties.map((p) => (
          <article
            className={"of-catalog-row " + (selected.includes(p.id) ? "selected" : "")}
            key={p.id}
          >
            <input
              type="checkbox"
              aria-label={`Выбрать ${label(p)}`}
              checked={selected.includes(p.id)}
              onChange={() => toggle(p.id)}
            />
            <div className="of-catalog-main">
              {photos.data?.[p.photos?.find((f) => !f.kind || f.kind === "photo")?.path ?? ""] ? (
                <img
                  src={
                    photos.data?.[p.photos?.find((f) => !f.kind || f.kind === "photo")?.path ?? ""]
                  }
                  alt={label(p)}
                />
              ) : (
                <div className="of-no-photo">Нет фото</div>
              )}
              <div>
                <Link to="/objects/$id" params={{ id: p.id }} className="of-object-name">
                  {label(p)}
                </Link>
                <p>
                  {p.area ? `${p.area} м² · ` : ""}
                  {roomsLabel(p.rooms)}
                  {p.floor ? ` · ${p.floor} этаж` : ""}
                </p>
                {p.address && (
                  <a
                    className="of-address"
                    href={yandexMapsUrl(p.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {p.address} ↗
                  </a>
                )}
                {q.data.notes.find((n) => n.property_id === p.id)?.note && (
                  <p className="of-catalog-note">
                    {q.data.notes.find((n) => n.property_id === p.id)?.note}
                  </p>
                )}
              </div>
            </div>
            <div className="of-cost">
              <strong>
                {formatMoney(p.price_month)}
                <small> / месяц</small>
              </strong>
              {p.seasonal_pricing && p.summer_price_month != null && (
                <p>Летом {formatMoney(p.summer_price_month)}</p>
              )}
              <small>Депозит {formatMoney(p.deposit)}</small>
            </div>
            <div className="of-availability">
              <span className={"of-status " + p.status}>{statuses[p.status] ?? p.status}</span>
              <small>{p.published ? "На сайте" : "Не опубликован на сайте"}</small>
            </div>
            <Link to="/objects/$id" params={{ id: p.id }} aria-label={`Открыть ${label(p)}`}>
              <ArrowRight size={17} />
            </Link>
          </article>
        ))}
        {!properties.length && (
          <div className="of-empty">
            {filterError || "По этим условиям объекты не найдены. Попробуйте изменить фильтры."}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="of-savebar">
          <span>
            Выбрано объектов: <b>{selected.length}</b>
            <button className="of-text" onClick={() => setSelected([])}>
              Сбросить
            </button>
          </span>
          <button className="of-primary" onClick={prepare} disabled={selected.length > 100}>
            Подготовить подборку →
          </button>
        </div>
      )}
    </div>
  );
}
export function ManagerOfficeObject({
  propertyId,
  onAdmin,
}: {
  propertyId: string;
  onAdmin?: (() => void) | undefined;
}) {
  const q = useManagerCatalog();
  if (q.isPending) return <p className="p-6">Загрузка объекта…</p>;
  if (q.error)
    return (
      <p className="p-6" role="alert">
        {q.error.message}
      </p>
    );
  const p = q.data?.properties.find((p) => p.id === propertyId);
  if (!p)
    return (
      <div className="office-workspace">
        <Link to="/objects">← Объекты</Link>
        <p>Объект не найден.</p>
        {onAdmin && <button onClick={onAdmin}>Открыть полную карточку</button>}
      </div>
    );
  return <OfficeProperty key={propertyId} property={p} workspace={q.data!} onAdmin={onAdmin} />;
}
function OfficeProperty({
  property: p,
  workspace,
  onAdmin,
}: {
  property: ManagerProperty;
  workspace: NonNullable<ReturnType<typeof useManagerCatalog>["data"]>;
  onAdmin?: (() => void) | undefined;
}) {
  const photos = useManagerPhotos([p], true),
    cache = useQueryClient(),
    saveNote = useServerFn(saveManagerNoteFn),
    navigate = useNavigate();
  const initial = workspace.notes.find((n) => n.property_id === p.id);
  const [note, setNote] = useState(initial?.note ?? ""),
    [version, setVersion] = useState(initial?.version ?? 0),
    [savedNote, setSavedNote] = useState(initial?.note ?? ""),
    [busy, setBusy] = useState(false),
    [bookingOpen, setBookingOpen] = useState(false),
    [activePhoto, setActivePhoto] = useState<string | null>(null);
  const today = toISODate(new Date());
  const booking = useQuery({
    queryKey: ["current-booking", p.id, today],
    queryFn: () => fetchStaffCurrentBooking(p.id, today),
  });
  const photoPaths =
    p.photos?.filter((f) => !f.kind || f.kind === "photo").map((f) => f.path) ?? [];
  const videoPath = storedVideoPath(p.video_file_path) || storedVideoPath(p.video_url);
  const video = useQuery({
    queryKey: ["office-video", videoPath],
    queryFn: () => signedUrls([videoPath!]),
    enabled: !!videoPath,
  });
  const commission =
    p.commission == null ? "Уточнить" : p.commission === 0 ? "Без комиссии" : `${p.commission}%`;
  const features = [
    ...labelsFor(APPLIANCE_OPTIONS, p.appliances),
    ...labelsFor(OUTDOOR_OPTIONS, p.outdoor_spaces),
    ...labelsFor(BATHROOM_FEATURE_OPTIONS, p.bathroom_features),
    ...(p.extra_features ?? []).map(extraFeatureLabel),
  ];
  const prepare = () => {
    try {
      sessionStorage.setItem("office-selection-draft", JSON.stringify([p.id]));
      void navigate({ to: "/selections/$id", params: { id: "new" } });
    } catch {
      toast.error("Не удалось подготовить подборку");
    }
  };
  async function save() {
    setBusy(true);
    try {
      const r = await saveNote({ data: { propertyId: p.id, expected: version, note } });
      setVersion(r.version);
      setSavedNote(note);
      await cache.invalidateQueries({ queryKey: ["manager-catalog"] });
      toast.success("Информация сохранена");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="office-workspace of-property-page">
      <Link className="of-back" to="/objects">
        ← Список объектов
      </Link>
      <header>
        <div>
          <h1>{label(p)}</h1>
          <p>
            №{p.ref_id} · <span className={"of-status " + p.status}>{statuses[p.status]}</span>
          </p>
          {p.address && (
            <a
              className="of-address of-property-address"
              href={yandexMapsUrl(p.address)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin size={14} />
              {p.address} ↗
            </a>
          )}
        </div>
        <div className="of-actions">
          <button className="of-primary" onClick={prepare}>
            <Plus size={15} />В подборку
          </button>
          {onAdmin && <button onClick={onAdmin}>Полная карточка</button>}
          {workspace.actor.role === "admin" && (
            <Link className="of-button" to="/objects/$id/edit" params={{ id: p.id }}>
              <Pencil size={14} />
              Редактировать
            </Link>
          )}
        </div>
      </header>
      {booking.isPending ? (
        <p>Проверяем текущую аренду…</p>
      ) : booking.error ? (
        <p role="alert">Не удалось загрузить аренду: {booking.error.message}</p>
      ) : (
        booking.data && (
          <section className="of-panel of-current-booking">
            <div className="of-section-head">
              <h2>Текущая аренда</h2>
              <button onClick={() => setBookingOpen(true)}>Открыть бронь →</button>
            </div>
            <div>
              <span>
                <small>Арендатор</small>
                <b>
                  {booking.data.client ? shortName(booking.data.client.full_name) : "Не указан"}
                </b>
              </span>
              <span>
                <small>Срок аренды</small>
                <b>
                  {formatDateRu(booking.data.start_date)} — {formatDateRu(booking.data.end_date)}
                </b>
              </span>
              <span>
                <small>Аренда / месяц</small>
                <b>{formatMoney(priceOn(booking.data, today))}</b>
              </span>
              <span>
                <small>Оплата</small>
                <b>{booking.data.payment_day} числа</b>
              </span>
            </div>
          </section>
        )
      )}
      <div className="of-property-top">
        <section className="of-panel of-payments">
          <h2>Условия аренды</h2>
          <dl>
            <div>
              <dt>{p.seasonal_pricing ? "С 1 октября по 31 мая" : "Аренда в месяц"}</dt>
              <dd>
                {formatMoney(p.price_month)}
                <small> / месяц</small>
              </dd>
            </div>
            {p.seasonal_pricing && (
              <div>
                <dt>С 1 июня по 30 сентября</dt>
                <dd>
                  {formatMoney(p.summer_price_month)}
                  <small> / месяц</small>
                </dd>
              </div>
            )}
            <div>
              <dt>Страховой депозит</dt>
              <dd>{formatMoney(p.deposit)}</dd>
            </div>
            <div>
              <dt>Комиссия с арендатора</dt>
              <dd>{commission}</dd>
            </div>
            <div>
              <dt>Коммунальные услуги</dt>
              <dd>
                {p.utilities_month != null
                  ? formatMoney(p.utilities_month) + " / месяц"
                  : "Уточнить условия"}
              </dd>
            </div>
            {p.rent_terms && (
              <div>
                <dt>Дополнительно</dt>
                <dd>{p.rent_terms}</dd>
              </div>
            )}
          </dl>
        </section>
        <section className="of-panel of-manager-info">
          <div className="of-section-head">
            <h2>Информация для менеджеров</h2>
          </div>
          <p>По показу, доступу и другим рабочим вопросам. Видна только сотрудникам.</p>
          <textarea
            rows={7}
            maxLength={5000}
            aria-label="Информация для менеджеров"
            placeholder="Например: показы по предварительной договорённости, звонить за день…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button disabled={busy || note === savedNote} onClick={() => void save()}>
            {busy ? "Сохраняем…" : "Сохранить информацию"}
          </button>
        </section>
      </div>
      <section className="of-panel">
        <h2>Основная информация</h2>
        <dl className="of-facts-grid">
          {[
            ["Площадь", p.area ? `${p.area} м²` : "—"],
            ["Комнаты", roomsLabel(p.rooms)],
            ["Этаж", floorLabel(p)],
            ["Санузлы", p.bathrooms ?? "—"],
            ["Комплекс", p.complex_name || "—"],
            ["Доступность", statuses[p.status] ?? "Уточнить"],
          ].map(([key, value]) => (
            <div key={String(key)}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {features.length > 0 && (
        <section className="of-panel">
          <h2>Характеристики</h2>
          <div className="of-feature-list">
            {features.map((feature, i) => (
              <span key={i}>{feature}</span>
            ))}
          </div>
        </section>
      )}
      <section className="of-panel">
        <h2>Описание</h2>
        <p className="of-description">{p.description || "Описание пока не заполнено"}</p>
        {p.location_description && <p className="of-description">{p.location_description}</p>}
      </section>
      <section className="of-panel">
        <h2>Фото и видео</h2>
        <div className="of-gallery">
          {photoPaths.map((path) => (
            <button key={path} onClick={() => setActivePhoto(photos.data?.[path] ?? null)}>
              {photos.data?.[path] && <img src={photos.data[path]} alt={label(p)} loading="lazy" />}
            </button>
          ))}
        </div>
        {!photoPaths.length && <p>Фотографии пока не добавлены</p>}
        <PropertyVideoPlayer
          videoUrl={p.video_vk_url || p.video_youtube_url || p.video_url}
          fileSrc={videoPath ? (video.data?.[videoPath] ?? null) : null}
          title={label(p)}
        />
      </section>
      {activePhoto && (
        <div
          className="of-lightbox"
          role="dialog"
          aria-label="Фотография объекта"
          onClick={() => setActivePhoto(null)}
        >
          <button aria-label="Закрыть фотографию" onClick={() => setActivePhoto(null)}>
            ×
          </button>
          <img src={activePhoto} alt={label(p)} />
        </div>
      )}
      {booking.data && (
        <BookingDialog
          open={bookingOpen}
          onOpenChange={setBookingOpen}
          booking={booking.data}
          initialMode="view"
        />
      )}
    </div>
  );
}
