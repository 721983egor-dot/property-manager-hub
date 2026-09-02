import { useState } from "react";
import { ArrowUpRight, Check, MapPin, Share2 } from "lucide-react";

import {
  SUMMER_SEASON_LABEL,
  extraFeatureLabel,
  floorLabel,
  formatArea,
  formatMoney,
  roomsLabel,
  typeLabel,
  yandexMapsUrl,
  type Property,
} from "@/lib/properties";
import { infrastructureLabel, type Complex } from "@/lib/complexes";

/**
 * Публичная страница объекта — журнальная (editorial) подача.
 * Палитра: глубокий синий + латунь. Шрифты: Space Grotesk + DM Sans.
 *
 * Компонент не обращается к базе напрямую — он полностью управляется props,
 * поэтому его можно переиспользовать и для реальной публичной страницы
 * (RM OS database → public API → Residence More frontend).
 */
export type PublicPropertyView = Pick<
  Property,
  | "title"
  | "type"
  | "complex_name"
  | "address"
  | "floor"
  | "total_floors"
  | "rooms"
  | "area"
  | "bathrooms"
  | "status"
  | "price_month"
  | "seasonal_pricing"
  | "summer_price_month"
  | "deposit"
  | "commission"
  | "utilities_month"
  | "description"
  | "location_description"
  | "extra_features"
  | "photos"
>;

export type PublicComplexView = Pick<
  Complex,
  "name" | "description" | "infrastructure" | "photos" | "main_photo"
>;

type Props = {
  property: PublicPropertyView;
  /** Данные связанного жилого комплекса (по complex_id). */
  complex?: PublicComplexView | null;
  /** path фотографии → готовый URL картинки (объект + комплекс) */
  photoUrls: Record<string, string>;
};

const STATUS_TEXT: Record<string, string> = {
  free: "Свободен сейчас",
  rented: "Сдан",
  booked: "Забронирован",
  archived: "Не публикуется",
};

export function PropertyPublicPage({ property, complex, photoUrls }: Props) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const photos = property.photos ?? [];
  const safeActive = Math.min(active, Math.max(photos.length - 1, 0));
  const current = photos[safeActive];

  const complexPhotos = complex
    ? [
        ...(complex.main_photo ? [{ path: complex.main_photo }] : []),
        ...(complex.photos ?? []).filter((p) => p.path !== complex.main_photo),
      ]
    : [];

  const specs = [
    { label: "Тип", value: typeLabel(property.type) },
    { label: "Комплекс", value: complex?.name || property.complex_name || null },
    {
      label: "Этаж",
      value:
        property.floor == null && property.total_floors == null ? null : floorLabel(property),
    },
    { label: "Планировка", value: roomsLabel(property.rooms) },
    { label: "Площадь", value: property.area == null ? null : formatArea(property.area) },
    { label: "Санузлы", value: property.bathrooms ? String(property.bathrooms) : null },
  ].filter((s) => s.value);

  const features = (property.extra_features ?? []).map(extraFeatureLabel);
  const paragraphs = (property.description || "").split(/\n{1,}/).filter((p) => p.trim());

  const hasRentTerms =
    property.price_month != null ||
    property.deposit != null ||
    property.commission != null ||
    property.utilities_month != null;

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const seasonRows = [
    property.seasonal_pricing && property.summer_price_month != null
      ? { label: SUMMER_SEASON_LABEL, value: property.summer_price_month }
      : null,
    property.seasonal_pricing && property.summer_price_month != null
      ? { label: "Октябрь — май", value: property.price_month }
      : property.price_month != null
        ? { label: "Стоимость аренды", value: property.price_month }
        : null,
  ].filter((r): r is { label: string; value: number } => r != null && r.value != null);

  const contactButton = (className = "") => (
    <button
      type="button"
      className={
        "h-13 rounded-full bg-site-navy px-8 text-[11px] font-semibold uppercase tracking-[0.22em] whitespace-nowrap text-site-navy-foreground transition-colors hover:bg-site-navy/90 " +
        className
      }
    >
      Связаться
    </button>
  );

  const shareButton = (
    <button
      type="button"
      onClick={copyLink}
      aria-label="Поделиться"
      title={copied ? "Ссылка скопирована" : "Поделиться"}
      className="grid size-13 shrink-0 place-items-center rounded-full border border-site-navy/20 text-site-navy transition-colors hover:border-site-gold hover:text-site-gold"
    >
      {copied ? <Check className="size-4 text-site-green" /> : <Share2 className="size-4" />}
    </button>
  );

  // Миниатюры для правой колонки галереи (до 2) + счётчик остатка
  const sidePhotos = photos.slice(1, 3);
  const remaining = photos.length - 3;

  return (
    <div className="bg-background font-body text-site-navy antialiased">
      <div className="mx-auto w-full max-w-[1280px] px-5 pb-24 pt-8 lg:px-10 lg:pt-12">
        {/* ===== Шапка: статус, заголовок во всю ширину, адрес и цена ===== */}
        <header className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p
              className={
                "inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.25em] " +
                (property.status === "free" ? "text-site-green" : "text-site-muted")
              }
            >
              <span
                className={
                  "size-1.5 rounded-full " +
                  (property.status === "free" ? "bg-site-green" : "bg-site-muted")
                }
              />
              {STATUS_TEXT[property.status] ?? ""}
            </p>

            <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              {property.title}
            </h1>

            {property.address ? (
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-site-muted">
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-site-gold" />
                  {property.address}
                </span>
                <a
                  href={yandexMapsUrl(property.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-site-navy underline decoration-site-gold decoration-2 underline-offset-8 transition-colors hover:text-site-gold"
                >
                  Карта
                  <ArrowUpRight className="size-3" />
                </a>
              </div>
            ) : null}
          </div>

          {property.price_month != null ? (
            <div className="shrink-0 lg:pb-1 lg:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-site-muted">
                Стоимость аренды
              </p>
              <p className="mt-2 whitespace-nowrap font-display text-4xl font-semibold tracking-tight lg:text-5xl">
                {formatMoney(property.price_month)}
                <span className="ml-2 text-base font-normal tracking-normal text-site-muted">
                  / мес
                </span>
              </p>
            </div>
          ) : null}
        </header>

        {/* ===== Галерея-лента ===== */}
        <div className="mt-10 grid grid-cols-1 gap-3 lg:grid-cols-12 lg:grid-rows-2 lg:gap-4">
          <div className="relative aspect-[16/10] overflow-hidden rounded-sm bg-site-navy-soft lg:col-span-8 lg:row-span-2 lg:aspect-auto lg:h-[560px]">
            {current && photoUrls[current.path] ? (
              <img
                src={photoUrls[current.path]}
                alt={`${property.title} — фото ${safeActive + 1}`}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-site-muted">
                Фотографии не загружены
              </div>
            )}
            {photos.length > 0 ? (
              <span className="absolute bottom-4 left-4 rounded-full bg-site-navy/70 px-3 py-1 text-[11px] font-medium tracking-wider text-site-navy-foreground backdrop-blur-sm">
                {safeActive + 1} / {photos.length}
              </span>
            ) : null}
          </div>

          {sidePhotos.map((p, i) => {
            const index = i + 1;
            const isLast = i === sidePhotos.length - 1 && remaining > 0;
            return (
              <button
                key={p.path}
                type="button"
                aria-label={`Фото ${index + 1}`}
                onClick={() => setActive(index)}
                className={
                  "group relative col-span-1 hidden aspect-[16/10] overflow-hidden rounded-sm bg-site-navy-soft lg:col-span-4 lg:block lg:aspect-auto " +
                  (index === safeActive ? "ring-2 ring-site-gold ring-offset-2" : "")
                }
              >
                {photoUrls[p.path] ? (
                  <img
                    src={photoUrls[p.path]}
                    alt={`${property.title} — фото ${index + 1}`}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                ) : null}
                {isLast ? (
                  <span className="absolute inset-0 grid place-items-center bg-site-navy/60 text-[11px] font-semibold uppercase tracking-[0.25em] text-site-navy-foreground">
                    Ещё {remaining + 1} фото
                  </span>
                ) : null}
              </button>
            );
          })}

          {/* Мобильная лента миниатюр */}
          {photos.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {photos.map((p, i) => (
                <button
                  key={p.path}
                  type="button"
                  aria-label={`Фото ${i + 1}`}
                  onClick={() => setActive(i)}
                  className={
                    "h-16 w-24 shrink-0 overflow-hidden rounded-sm " +
                    (i === safeActive ? "ring-2 ring-site-gold" : "opacity-70")
                  }
                >
                  {photoUrls[p.path] ? (
                    <img
                      src={photoUrls[p.path]}
                      alt={`${property.title} — миниатюра ${i + 1}`}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* ===== Основная сетка: контент + колонка условий ===== */}
        <div className="mt-14 grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-16">
          {/* Левая колонка */}
          <div className="min-w-0 lg:col-span-7">
            {/* Характеристики */}
            {specs.length > 0 ? (
              <dl className="grid grid-cols-2 gap-x-8 gap-y-8 border-y border-site-line py-8 sm:grid-cols-3">
                {specs.map((s) => (
                  <div key={s.label} className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.25em] text-site-muted">
                      {s.label}
                    </dt>
                    <dd className="mt-2 font-display text-base font-medium">{s.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {/* Описание */}
            {paragraphs.length > 0 ? (
              <section className="mt-12">
                <h2 className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-site-navy">
                  Описание
                  <span className="h-px flex-1 bg-site-gold/50" />
                </h2>
                <div className="mt-6 max-w-[68ch] space-y-4 text-[15px] font-light leading-[1.85] text-site-muted">
                  {paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Дополнительно */}
            {features.length > 0 ? (
              <section className="mt-12">
                <h2 className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-site-navy">
                  Дополнительно
                  <span className="h-px flex-1 bg-site-gold/50" />
                </h2>
                <ul className="mt-6 flex flex-wrap gap-2.5">
                  {features.map((f) => (
                    <li
                      key={f}
                      className="rounded-full border border-site-line px-4 py-2 text-[12px] font-medium tracking-wide text-site-navy transition-colors hover:border-site-gold"
                    >
                      {f}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Локация */}
            {property.location_description || property.address ? (
              <section className="mt-12">
                <h2 className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-site-navy">
                  Локация
                  <span className="h-px flex-1 bg-site-gold/50" />
                </h2>
                {property.location_description ? (
                  <p className="mt-6 max-w-[68ch] text-[15px] font-light leading-[1.85] text-site-muted">
                    {property.location_description}
                  </p>
                ) : null}
                <div className="relative mt-7 grid aspect-[21/9] w-full place-items-center overflow-hidden rounded-sm border border-site-line bg-site-navy-soft">
                  <div
                    className="absolute inset-0 opacity-[0.35]"
                    style={{
                      backgroundImage:
                        "linear-gradient(to right, var(--site-line) 1px, transparent 1px), linear-gradient(to bottom, var(--site-line) 1px, transparent 1px)",
                      backgroundSize: "56px 56px",
                    }}
                  />
                  <div className="relative flex flex-col items-center gap-3 text-center">
                    <span className="relative grid size-12 place-items-center rounded-full bg-background shadow-sm">
                      <MapPin className="size-5 text-site-gold" />
                      <span className="absolute inset-0 animate-ping rounded-full bg-site-gold/20" />
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-site-muted">
                      Карта появится после подключения Яндекс.Карт
                    </span>
                    {property.address ? (
                      <span className="text-xs text-site-muted">{property.address}</span>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}
          </div>

          {/* Правая колонка: условия аренды */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-10">
              {hasRentTerms ? (
                <div className="rounded-sm bg-site-navy-soft p-8 lg:p-10">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-site-navy">
                    Условия аренды
                  </h2>

                  <dl className="mt-8 space-y-5">
                    {seasonRows.map((r) => (
                      <div
                        key={r.label}
                        className="flex items-baseline justify-between gap-4 border-b border-site-navy/10 pb-4"
                      >
                        <dt className="text-sm capitalize text-site-muted">{r.label}</dt>
                        <dd className="whitespace-nowrap font-display text-base font-semibold">
                          {formatMoney(r.value)}
                        </dd>
                      </div>
                    ))}
                    {property.deposit != null ? (
                      <div className="flex items-baseline justify-between gap-4 border-b border-site-navy/10 pb-4">
                        <dt className="text-sm text-site-muted">Страховой депозит</dt>
                        <dd className="whitespace-nowrap font-display text-base font-semibold">
                          {formatMoney(property.deposit)}
                        </dd>
                      </div>
                    ) : null}
                    {property.commission != null ? (
                      <div className="flex items-baseline justify-between gap-4 border-b border-site-navy/10 pb-4">
                        <dt className="text-sm text-site-muted">Комиссия</dt>
                        <dd className="whitespace-nowrap font-display text-base font-semibold">
                          {formatMoney(property.commission)}
                        </dd>
                      </div>
                    ) : null}
                    {property.utilities_month != null ? (
                      <div className="flex items-baseline justify-between gap-4 border-b border-site-navy/10 pb-4">
                        <dt className="text-sm text-site-muted">Коммунальные платежи</dt>
                        <dd className="whitespace-nowrap font-display text-base font-semibold">
                          ≈ {formatMoney(property.utilities_month)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  <p className="mt-6 text-[12px] font-light leading-relaxed text-site-muted">
                    Депозит возвращается при выезде при условии сохранности имущества. Проживание
                    с домашними животными обсуждается индивидуально.
                  </p>

                  <div className="mt-8 flex items-center gap-3">
                    {contactButton("flex-1")}
                    {shareButton}
                  </div>
                </div>
              ) : (
                <div className="rounded-sm bg-site-navy-soft p-8 lg:p-10">
                  <div className="flex items-center gap-3">
                    {contactButton("flex-1")}
                    {shareButton}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== Жилой комплекс: тёмная полоса ===== */}
        {complex ? (
          <section className="mt-20 overflow-hidden rounded-sm bg-site-navy text-site-navy-foreground">
            <div className="grid lg:grid-cols-2">
              <div className="p-8 sm:p-12 lg:p-16">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-site-gold">
                  Жилой комплекс
                </p>
                <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  {complex.name}
                </h2>
                {complex.description ? (
                  <p className="mt-6 max-w-[52ch] whitespace-pre-line text-[15px] font-light leading-[1.85] text-site-navy-foreground/70">
                    {complex.description}
                  </p>
                ) : null}

                {complex.infrastructure.length > 0 ? (
                  <>
                    <p className="mt-10 text-[10px] font-semibold uppercase tracking-[0.3em] text-site-gold">
                      Для вас доступно
                    </p>
                    <ul className="mt-5 grid gap-x-10 gap-y-3 sm:grid-cols-2">
                      {complex.infrastructure.map((i) => (
                        <li
                          key={i}
                          className="flex items-center gap-3 text-sm font-light text-site-navy-foreground/85"
                        >
                          <span className="size-1 shrink-0 rounded-full bg-site-gold" />
                          {infrastructureLabel(i)}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>

              {complexPhotos.length > 0 && photoUrls[complexPhotos[0]!.path] ? (
                <div className="relative min-h-[280px] lg:min-h-full">
                  <img
                    src={photoUrls[complexPhotos[0]!.path]}
                    alt={`${complex.name} — главное фото`}
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover"
                  />
                  {complexPhotos.length > 1 ? (
                    <div className="absolute bottom-4 left-4 flex gap-2">
                      {complexPhotos.slice(1, 4).map((p, i) =>
                        photoUrls[p.path] ? (
                          <img
                            key={p.path}
                            src={photoUrls[p.path]}
                            alt={`${complex.name} — фото ${i + 2}`}
                            loading="lazy"
                            className="h-16 w-24 rounded-sm object-cover ring-1 ring-white/30"
                          />
                        ) : null,
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
