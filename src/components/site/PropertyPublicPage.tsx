import { useState } from "react";
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, MapPin, Share2 } from "lucide-react";

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
 * Публичная страница объекта — макет сайта Residence More.
 * Палитра: глубокий синий + латунь + зелёный статус. Шрифты: Space Grotesk + DM Sans.
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

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px] leading-relaxed text-site-muted">
      <span className="mt-[7px] size-1 shrink-0 bg-site-gold" />
      <span>{children}</span>
    </li>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[22px] font-semibold tracking-tight text-site-navy">
      {children}
    </h2>
  );
}

export function PropertyPublicPage({ property, complex, photoUrls }: Props) {
  const [active, setActive] = useState(0);
  const [complexActive, setComplexActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const photos = property.photos ?? [];
  const safeActive = photos.length ? Math.min(active, photos.length - 1) : 0;
  const current = photos[safeActive];

  const complexPhotos = complex
    ? [
        ...(complex.main_photo ? [{ path: complex.main_photo }] : []),
        ...(complex.photos ?? []).filter((p) => p.path !== complex.main_photo),
      ]
    : [];
  const safeComplexActive = complexPhotos.length
    ? Math.min(complexActive, complexPhotos.length - 1)
    : 0;

  const specRow1 = [
    { label: "Тип", value: typeLabel(property.type) },
    { label: "Комплекс", value: complex?.name || property.complex_name || null },
    {
      label: "Этаж",
      value:
        property.floor == null && property.total_floors == null ? null : floorLabel(property),
    },
  ].filter((s) => s.value);

  const specRow2 = [
    { label: "Планировка", value: roomsLabel(property.rooms) },
    { label: "Площадь", value: property.area == null ? null : formatArea(property.area) },
    { label: "Санузлы", value: property.bathrooms ? String(property.bathrooms) : null },
  ].filter((s) => s.value);

  const features = (property.extra_features ?? []).map(extraFeatureLabel);
  const paragraphs = (property.description || "").split(/\n{1,}/).filter((p) => p.trim());
  const locationLines = (property.location_description || "")
    .split(/\n{1,}/)
    .filter((p) => p.trim());

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
      : null,
  ].filter((r): r is { label: string; value: number } => r != null && r.value != null);

  const hasRentTerms =
    property.price_month != null ||
    property.deposit != null ||
    property.commission != null ||
    property.utilities_month != null;

  function prev() {
    setActive((i) => (i - 1 + photos.length) % photos.length);
  }
  function next() {
    setActive((i) => (i + 1) % photos.length);
  }
  function prevComplex() {
    setComplexActive((i) => (i - 1 + complexPhotos.length) % complexPhotos.length);
  }
  function nextComplex() {
    setComplexActive((i) => (i + 1) % complexPhotos.length);
  }

  const contactButton = (className = "") => (
    <button
      type="button"
      className={
        "h-11 rounded-md bg-site-navy px-8 text-[12px] font-semibold whitespace-nowrap text-site-navy-foreground transition-colors hover:bg-site-navy/90 " +
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
      className="grid size-11 shrink-0 place-items-center rounded-md bg-site-navy text-site-navy-foreground transition-colors hover:bg-site-navy/90"
    >
      {copied ? <Check className="size-4 text-site-green" /> : <Share2 className="size-4" />}
    </button>
  );

  return (
    <div className="bg-background font-body text-site-navy antialiased">
      <div className="mx-auto w-full max-w-[1170px] px-5 pb-24 pt-6 lg:px-8">
        {/* ===== Хлебные крошки ===== */}
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-site-muted">
          <span className="transition-colors hover:text-site-navy">Главная</span>
          <span className="text-site-gold">→</span>
          <span className="transition-colors hover:text-site-navy">Долгосрочная аренда</span>
          <span className="text-site-gold">→</span>
          <span className="text-site-navy">{property.title}</span>
        </nav>

        {/* ===== Верхний блок: галерея + информация ===== */}
        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Галерея */}
          <div className="lg:col-span-7">
            <div className="relative aspect-[4/3] overflow-hidden bg-site-navy-soft">
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
              {photos.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={prev}
                    aria-label="Предыдущее фото"
                    className="absolute left-0 top-1/2 grid h-14 w-10 -translate-y-1/2 place-items-center bg-background/80 text-site-navy backdrop-blur-sm transition-colors hover:bg-background"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    aria-label="Следующее фото"
                    className="absolute right-0 top-1/2 grid h-14 w-10 -translate-y-1/2 place-items-center bg-background/80 text-site-navy backdrop-blur-sm transition-colors hover:bg-background"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              ) : null}
            </div>
            {/* Точки */}
            {photos.length > 1 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {photos.map((p, i) => (
                  <button
                    key={p.path}
                    type="button"
                    aria-label={`Фото ${i + 1}`}
                    onClick={() => setActive(i)}
                    className={
                      "size-1.5 rounded-full transition-colors " +
                      (i === safeActive ? "bg-site-gold" : "bg-site-navy/20 hover:bg-site-navy/40")
                    }
                  />
                ))}
              </div>
            ) : null}
          </div>

          {/* Информация */}
          <div className="min-w-0 lg:col-span-5">
            <p
              className={
                "text-[12px] font-medium " +
                (property.status === "free" ? "text-site-green" : "text-site-muted")
              }
            >
              {STATUS_TEXT[property.status] ?? ""}
            </p>

            <h1 className="mt-2 font-display text-[28px] font-semibold leading-[1.15] tracking-tight lg:text-[32px]">
              {property.title}
            </h1>

            {property.address ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-site-muted">
                <span>{property.address}</span>
                <a
                  href={yandexMapsUrl(property.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-site-gold transition-colors hover:text-site-navy"
                >
                  Карта
                  <ArrowUpRight className="size-3" />
                </a>
              </div>
            ) : null}

            {/* Характеристики таблицей */}
            <div className="mt-6">
              {[specRow1, specRow2]
                .filter((row) => row.length > 0)
                .map((row, ri) => (
                  <dl
                    key={ri}
                    className="grid grid-cols-3 gap-4 border-t border-site-line py-4"
                  >
                    {row.map((s) => (
                      <div key={s.label} className="min-w-0">
                        <dt className="text-[11px] font-semibold text-site-navy">{s.label}</dt>
                        <dd className="mt-1 truncate text-[13px] text-site-muted">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                ))}
            </div>

            {property.price_month != null ? (
              <p className="mt-6 whitespace-nowrap font-display text-[26px] font-semibold tracking-tight">
                {formatMoney(property.price_month)}
                <span className="ml-2 text-[15px] font-normal text-site-muted">/ мес</span>
              </p>
            ) : null}

            <div className="mt-5 flex items-center gap-3">
              {contactButton()}
              {shareButton}
            </div>
          </div>
        </div>

        {/* ===== Дополнительно ===== */}
        {features.length > 0 ? (
          <section className="mt-14">
            <SectionTitle>Дополнительно</SectionTitle>
            <ul className="mt-5 grid gap-x-10 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <Bullet key={f}>{f}</Bullet>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ===== Описание ===== */}
        {paragraphs.length > 0 ? (
          <section className="mt-14">
            <SectionTitle>Описание</SectionTitle>
            <div className="mt-5 max-w-[90ch] space-y-4 text-[13px] leading-[1.9] text-site-muted">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        ) : null}

        {/* ===== Локация ===== */}
        {locationLines.length > 0 || property.address ? (
          <section className="mt-14">
            <SectionTitle>Локация</SectionTitle>
            {locationLines.length > 0 ? (
              <ul className="mt-5 max-w-[90ch] space-y-2.5">
                {locationLines.map((l, i) => (
                  <Bullet key={i}>{l}</Bullet>
                ))}
              </ul>
            ) : null}

            {/* Mock-карта */}
            <div className="relative mt-7 grid aspect-[21/9] w-full place-items-center overflow-hidden border border-site-line bg-site-navy-soft">
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
                {property.address ? (
                  <a
                    href={yandexMapsUrl(property.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-sm bg-site-green/10 px-3 py-1.5 text-[12px] font-medium text-site-green transition-colors hover:bg-site-green/15"
                  >
                    <MapPin className="size-3.5" />
                    Открыть в Яндекс Картах
                  </a>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* ===== Жилой комплекс ===== */}
        {complex ? (
          <section className="mt-14">
            <SectionTitle>ЖК «{complex.name}»</SectionTitle>
            <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
              {/* Галерея комплекса */}
              <div className="lg:col-span-7">
                {complexPhotos.length > 0 && photoUrls[complexPhotos[safeComplexActive]!.path] ? (
                  <>
                    <div className="relative aspect-[4/3] overflow-hidden bg-site-navy-soft">
                      <img
                        src={photoUrls[complexPhotos[safeComplexActive]!.path]}
                        alt={`${complex.name} — фото ${safeComplexActive + 1}`}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                      {complexPhotos.length > 1 ? (
                        <>
                          <button
                            type="button"
                            onClick={prevComplex}
                            aria-label="Предыдущее фото комплекса"
                            className="absolute left-0 top-1/2 grid h-14 w-10 -translate-y-1/2 place-items-center bg-background/80 text-site-navy backdrop-blur-sm transition-colors hover:bg-background"
                          >
                            <ChevronLeft className="size-5" />
                          </button>
                          <button
                            type="button"
                            onClick={nextComplex}
                            aria-label="Следующее фото комплекса"
                            className="absolute right-0 top-1/2 grid h-14 w-10 -translate-y-1/2 place-items-center bg-background/80 text-site-navy backdrop-blur-sm transition-colors hover:bg-background"
                          >
                            <ChevronRight className="size-5" />
                          </button>
                        </>
                      ) : null}
                    </div>
                    {complexPhotos.length > 1 ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {complexPhotos.map((p, i) => (
                          <button
                            key={p.path}
                            type="button"
                            aria-label={`Фото комплекса ${i + 1}`}
                            onClick={() => setComplexActive(i)}
                            className={
                              "size-1.5 rounded-full transition-colors " +
                              (i === safeComplexActive
                                ? "bg-site-gold"
                                : "bg-site-navy/20 hover:bg-site-navy/40")
                            }
                          />
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-site-navy-soft text-sm text-site-muted">
                    Фотографии комплекса не загружены
                  </div>
                )}
              </div>

              {/* О комплексе */}
              <div className="min-w-0 lg:col-span-5">
                <h3 className="text-[13px] font-semibold text-site-navy">О комплексе</h3>
                {complex.description ? (
                  <p className="mt-3 whitespace-pre-line text-[13px] leading-[1.9] text-site-muted">
                    {complex.description}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Для вас доступно */}
            {complex.infrastructure.length > 0 ? (
              <div className="mt-10">
                <h3 className="text-[13px] font-semibold text-site-navy">Для вас доступно</h3>
                <ul className="mt-4 grid gap-x-10 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {complex.infrastructure.map((i) => (
                    <Bullet key={i}>{infrastructureLabel(i)}</Bullet>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* ===== Условия аренды ===== */}
        {hasRentTerms ? (
          <section className="mt-16 border-t border-site-line pt-10">
            <SectionTitle>Условия аренды</SectionTitle>
            <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2">
              {/* Левая колонка: примечания */}
              <ul className="space-y-2.5">
                {property.utilities_month != null ? (
                  <Bullet>
                    Коммунальные платежи оплачиваются отдельно, ориентировочно ≈{" "}
                    {formatMoney(property.utilities_month)} в месяц
                  </Bullet>
                ) : null}
                <Bullet>Проживание с домашними животными обсуждается индивидуально</Bullet>
                {property.deposit != null ? (
                  <Bullet>
                    Страховой депозит вносится при заселении и возвращается при выезде, при условии
                    сохранности имущества целое
                  </Bullet>
                ) : null}
                {property.commission != null ? (
                  <Bullet>Комиссия агентства — {formatMoney(property.commission)}</Bullet>
                ) : null}
              </ul>

              {/* Правая колонка: цены */}
              <div>
                {seasonRows.length > 0 ? (
                  <>
                    <p className="text-[13px] font-semibold text-site-navy">
                      Стоимость при долгосрочной аренде:
                    </p>
                    <ul className="mt-3 space-y-2">
                      {seasonRows.map((r) => (
                        <li key={r.label} className="flex items-baseline gap-2 text-[13px]">
                          <span className="mt-[7px] size-1 shrink-0 self-start bg-site-gold" />
                          <span className="capitalize text-site-muted">{r.label}</span>
                          <span className="whitespace-nowrap font-medium text-site-navy">
                            {formatMoney(r.value)} в месяц
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {property.deposit != null ? (
                  <p className="mt-4 text-right text-[13px] text-site-muted">
                    Страховой депозит{" "}
                    <span className="ml-2 whitespace-nowrap font-medium text-site-navy">
                      {formatMoney(property.deposit)}
                    </span>
                  </p>
                ) : null}
              </div>
            </div>

            {/* Итоговая строка: кнопки + цена */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-5">
              <div className="flex items-center gap-3">
                {contactButton()}
                {shareButton}
              </div>
              {property.price_month != null ? (
                <p className="whitespace-nowrap font-display text-[24px] font-semibold tracking-tight">
                  {formatMoney(property.price_month)}
                  <span className="ml-2 text-[15px] font-normal text-site-muted">/ мес</span>
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
