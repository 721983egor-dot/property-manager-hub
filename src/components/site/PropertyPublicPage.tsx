import { useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Share2 } from "lucide-react";

import { YandexMap } from "@/components/YandexMap";

import {
  APPLIANCE_OPTIONS,
  BATHROOM_FEATURE_OPTIONS,
  DEFAULT_RENT_TERMS,
  OUTDOOR_OPTIONS,
  SUMMER_SEASON_LABEL,
  extraFeatureLabel,
  labelsFor,
  floorLabel,
  formatArea,
  formatMoney,
  roomsLabel,
  typeLabel,
  type Property,
} from "@/lib/properties";
import { infrastructureLabel, type Complex } from "@/lib/complexes";

/**
 * Публичная страница объекта — точный макет сайта Residence More.
 * Палитра: глубокий синий + латунь + зелёный статус. Шрифт: DM Sans.
 *
 * Компонент не обращается к базе напрямую — он полностью управляется props,
 * поэтому его можно переиспользовать и для реальной публичной страницы
 * (RM OS database → public API → Residence More frontend).
 */
export type PublicPropertyView = Pick<
  Property,
  | "title"
  | "outdoor_spaces"
  | "appliances"
  | "bathroom_features"
  | "type"
  | "complex_name"
  | "address"
  | "latitude"
  | "longitude"
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
  | "rent_terms"
  | "extra_features"
  | "photos"
>;

export type PublicComplexView = Pick<
  Complex,
  "name" | "description" | "location_description" | "infrastructure" | "photos" | "main_photo"
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

/**
 * Вспомогательные функции форматирования адреса.
 * Адрес хранится строкой через запятую; страна и регион отбрасываются.
 */
function addressParts(address: string): string[] {
  return address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^россия/i.test(p) && !/\b(край|область|обл\.)\b/i.test(p));
}

/** Короткий адрес для верхней части страницы: улица и номер дома. */
function shortAddress(address: string): string {
  const parts = addressParts(address);
  if (parts.length === 0) return address;
  if (parts.length <= 2) return parts.join(", ");
  return parts.slice(-2).join(", ");
}

/** Полный адрес для блока с картой: город, улица и номер дома. */
function mapAddress(address: string): string {
  const parts = addressParts(address);
  if (parts.length === 0) return address;
  if (parts.length <= 3) return parts.join(", ");
  return parts.slice(-3).join(", ");
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[15px] leading-relaxed text-site-muted">
      <span className="mt-[8px] size-1.5 shrink-0 bg-site-gold" />
      <span>{children}</span>
    </li>
  );
}

/** Заголовок секции с золотой линией на всю ширину — как на сайте. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b-2 border-site-gold pb-3">
      <h2 className="font-body text-[26px] font-bold tracking-tight text-site-navy">
        {children}
      </h2>
    </div>
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

  // Характеристики, выбранные галочками в карточке объекта.
  const outdoor = labelsFor(OUTDOOR_OPTIONS, property.outdoor_spaces);
  const appliances = labelsFor(APPLIANCE_OPTIONS, property.appliances);
  const bathroomsFeats = labelsFor(BATHROOM_FEATURE_OPTIONS, property.bathroom_features);
  const hasCharacteristics =
    outdoor.length > 0 || appliances.length > 0 || bathroomsFeats.length > 0;
  const paragraphs = (property.description || "").split(/\n{1,}/).filter((p) => p.trim());
  const locationLines = (complex?.location_description || property.location_description || "")
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

  const rentTermsLines = (property.rent_terms?.trim() ? property.rent_terms : DEFAULT_RENT_TERMS)
    .split(/\n+/)
    .filter((l) => l.trim());

  const hasRentTerms =
    property.price_month != null ||
    property.deposit != null ||
    property.commission != null ||
    property.utilities_month != null ||
    rentTermsLines.length > 0;

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
        "h-14 w-[240px] max-w-full shrink-0 rounded-2xl bg-site-navy px-10 text-[16px] font-semibold whitespace-nowrap text-site-navy-foreground transition-colors hover:bg-site-navy/90 " +
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
      className="grid size-14 shrink-0 place-items-center rounded-2xl bg-site-navy text-site-navy-foreground transition-colors hover:bg-site-navy/90"
    >
      {copied ? <Check className="size-5 text-site-green" /> : <Share2 className="size-5" />}
    </button>
  );

  const arrowButton = (
    onClick: () => void,
    side: "left" | "right",
    label: string,
  ) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={
        "absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-background/85 text-site-navy shadow-sm backdrop-blur-sm transition-colors hover:bg-background " +
        (side === "left" ? "left-4" : "right-4")
      }
    >
      {side === "left" ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </button>
  );

  return (
    <div className="bg-background font-body text-site-navy antialiased">
      <div className="mx-auto w-full max-w-[1170px] px-5 pb-24 pt-8 lg:px-8">
        {/* ===== Хлебные крошки ===== */}
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-site-muted">
          <span className="transition-colors hover:text-site-navy">Главная</span>
          <span className="text-site-gold">→</span>
          <span className="transition-colors hover:text-site-navy">Долгосрочная аренда</span>
          <span className="text-site-gold">→</span>
          <span className="font-semibold text-site-navy">{property.title}</span>
        </nav>

        {/* ===== Верхний блок: галерея + информация ===== */}
        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Галерея */}
          <div className="lg:col-span-7">
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-site-navy-soft">
              {current && photoUrls[current.path] ? (
                <img
                  src={photoUrls[current.path]}
                  alt={`${property.title} — фото ${safeActive + 1}`}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-base text-site-muted">
                  Фотографии не загружены
                </div>
              )}
              {photos.length > 1 ? (
                <>
                  {arrowButton(prev, "left", "Предыдущее фото")}
                  {arrowButton(next, "right", "Следующее фото")}
                </>
              ) : null}
            </div>
            {/* Точки */}
            {photos.length > 1 ? (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {photos.map((p, i) => (
                  <button
                    key={p.path}
                    type="button"
                    aria-label={`Фото ${i + 1}`}
                    onClick={() => setActive(i)}
                    className={
                      "size-2 rounded-full transition-colors " +
                      (i === safeActive ? "bg-site-gold" : "bg-site-navy/20 hover:bg-site-navy/40")
                    }
                  />
                ))}
              </div>
            ) : null}
          </div>

          {/* Информация */}
          <div className="flex min-w-0 flex-col lg:col-span-5">
            <p
              className={
                "text-[15px] font-semibold " +
                (property.status === "free" ? "text-site-green" : "text-site-muted")
              }
            >
              {STATUS_TEXT[property.status] ?? ""}
            </p>

            <h1 className="mt-2 font-body text-[32px] font-bold leading-[1.15] tracking-tight lg:text-[36px]">
              {property.title}
            </h1>

            {property.address ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-site-muted">
                <span>{shortAddress(property.address)}</span>
                <a
                  href="#location-map"
                  className="inline-flex items-center gap-1 font-medium text-site-gold underline decoration-site-gold/60 underline-offset-4 transition-colors hover:text-site-navy"
                >
                  Карта
                </a>
              </div>
            ) : null}

            {/* Характеристики */}
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
                        <dt className="text-[14px] font-semibold text-site-navy">{s.label}</dt>
                        <dd className="mt-1 truncate text-[15px] text-site-muted">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                ))}
              {/* Золотая линия под характеристиками */}
              <div className="border-t-2 border-site-gold" />
            </div>

            {property.price_month != null ? (
              <p className="mt-6 whitespace-nowrap font-body text-[30px] font-bold tracking-tight">
                {formatMoney(property.price_month)}
                <span className="ml-2 text-[20px] font-semibold text-site-navy">/ мес</span>
              </p>
            ) : null}

            <div className="mt-6 flex items-center gap-3">
              {contactButton()}
              {shareButton}
            </div>
          </div>
        </div>

        {/* ===== Характеристики ===== */}
        {hasCharacteristics ? (
          <section className="mt-16">
            <SectionTitle>Характеристики</SectionTitle>
            <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {outdoor.length > 0 ? (
                <div>
                  <h3 className="text-[16px] font-semibold text-site-navy">
                    Балкон / терраса / лоджия
                  </h3>
                  <ul className="mt-3 space-y-2.5">
                    {outdoor.map((f) => (
                      <Bullet key={f}>{f}</Bullet>
                    ))}
                  </ul>
                </div>
              ) : null}
              {appliances.length > 0 ? (
                <div>
                  <h3 className="text-[16px] font-semibold text-site-navy">Техника</h3>
                  <ul className="mt-3 space-y-2.5">
                    {appliances.map((f) => (
                      <Bullet key={f}>{f}</Bullet>
                    ))}
                  </ul>
                </div>
              ) : null}
              {bathroomsFeats.length > 0 ? (
                <div>
                  <h3 className="text-[16px] font-semibold text-site-navy">
                    Ванна / душевая / джакузи
                  </h3>
                  <ul className="mt-3 space-y-2.5">
                    {bathroomsFeats.map((f) => (
                      <Bullet key={f}>{f}</Bullet>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* ===== Дополнительно ===== */}
        {features.length > 0 ? (
          <section className="mt-16">
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
            <div className="mt-5 max-w-[90ch] space-y-4 text-[16px] leading-[1.8] text-site-muted">
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

            {property.address ? (
              <div
                id="location-map"
                className="mt-7 scroll-mt-24 overflow-hidden rounded-2xl border border-site-line"
              >
                <ClientOnly
                  fallback={<div className="aspect-[21/9] w-full bg-site-navy-soft" />}
                >
                  <YandexMap
                    lat={property.latitude}
                    lon={property.longitude}
                    address={property.address}
                    caption={property.address}
                    className="aspect-[21/9] w-full"
                  />
                </ClientOnly>
              </div>
            ) : null}

            {property.address ? (
              <p className="mt-5 text-[14px] text-site-muted">
                {shortAddress(property.address)}
              </p>
            ) : null}
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
                    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-site-navy-soft">
                      <img
                        src={photoUrls[complexPhotos[safeComplexActive]!.path]}
                        alt={`${complex.name} — фото ${safeComplexActive + 1}`}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                      {complexPhotos.length > 1 ? (
                        <>
                          {arrowButton(prevComplex, "left", "Предыдущее фото комплекса")}
                          {arrowButton(nextComplex, "right", "Следующее фото комплекса")}
                        </>
                      ) : null}
                    </div>
                    {complexPhotos.length > 1 ? (
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
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
                  <div className="flex aspect-[4/3] items-center justify-center rounded-3xl bg-site-navy-soft text-sm text-site-muted">
                    Фотографии комплекса не загружены
                  </div>
                )}
              </div>

              {/* О комплексе */}
              <div className="flex min-w-0 flex-col lg:col-span-5">
                <h3 className="text-[16px] font-semibold text-site-navy">О комплексе</h3>
                {complex.description ? (
                  <p className="mt-3 whitespace-pre-line text-[16px] leading-[1.8] text-site-muted">
                    {complex.description}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Для вас доступно */}
            {complex.infrastructure.length > 0 ? (
              <div className="mt-10">
                <h3 className="text-[16px] font-semibold text-site-navy">Для вас доступно</h3>
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
          <section className="mt-14">
            <SectionTitle>Условия аренды</SectionTitle>
            <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2">
              {/* Левая колонка: примечания */}
              <ul className="space-y-2.5">
                {rentTermsLines.map((l, i) => (
                  <Bullet key={i}>{l}</Bullet>
                ))}
                {property.utilities_month != null ? (
                  <Bullet>
                    Коммунальные платежи ориентировочно ≈ {formatMoney(property.utilities_month)} в
                    месяц
                  </Bullet>
                ) : null}
              </ul>

              {/* Правая колонка: финансовые условия в один ряд */}
              <div className="divide-y divide-site-line border-y border-site-line">
                <div className="flex items-baseline justify-between gap-6 py-4">
                  <span className="text-[15px] text-site-muted">Стоимость</span>
                  <div className="text-right">
                    {seasonRows.length > 0 ? (
                      <ul className="space-y-1">
                        {seasonRows.map((r) => (
                          <li key={r.label} className="text-[15px] whitespace-nowrap">
                            <span className="capitalize text-site-muted">{r.label}</span>
                            <span className="ml-3 font-semibold text-site-navy">
                              {formatMoney(r.value)} / мес
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="whitespace-nowrap text-[17px] font-semibold text-site-navy">
                        {formatMoney(property.price_month)} / мес
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-6 py-4">
                  <span className="text-[15px] text-site-muted">Страховой депозит</span>
                  <span className="whitespace-nowrap text-[17px] font-semibold text-site-navy">
                    {formatMoney(property.deposit)}
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-6 py-4">
                  <span className="text-[15px] text-site-muted">Комиссия</span>
                  <span className="whitespace-nowrap text-[17px] font-semibold text-site-navy">
                    {formatMoney(property.commission)}
                  </span>
                </div>
              </div>
            </div>

            {/* Итоговая строка: кнопки + цена */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-5">
              <div className="flex items-center gap-3">
                {contactButton()}
                {shareButton}
              </div>
              {property.price_month != null ? (
                <p className="whitespace-nowrap font-body text-[28px] font-bold tracking-tight">
                  {formatMoney(property.price_month)}
                  <span className="ml-2 text-[17px] font-normal text-site-muted">/ мес</span>
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
