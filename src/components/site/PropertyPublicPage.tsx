import { useState } from "react";
import { Check, MapPin, Share2 } from "lucide-react";

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
 * Публичная страница объекта в стиле сайта Residence More.
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

function GoldDot() {
  return <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-site-gold" />;
}

export function PropertyPublicPage({ property, complex, photoUrls }: Props) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const photos = property.photos ?? [];
  const current = photos[Math.min(active, Math.max(photos.length - 1, 0))];

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

  const shareButton = (
    <button
      type="button"
      onClick={copyLink}
      aria-label="Поделиться"
      title={copied ? "Ссылка скопирована" : "Поделиться"}
      className="grid size-13 h-13 w-13 shrink-0 place-items-center rounded-xl border border-site-navy/15 bg-background text-site-navy transition-colors hover:border-site-gold hover:text-site-gold"
    >
      {copied ? <Check className="size-5 text-site-green" /> : <Share2 className="size-5" />}
    </button>
  );

  const contactButton = (
    <button
      type="button"
      className="h-13 flex-1 rounded-xl bg-site-navy px-6 text-[15px] font-medium whitespace-nowrap text-site-navy-foreground transition-opacity hover:opacity-90"
    >
      Связаться
    </button>
  );

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

  return (
    <div className="bg-background text-site-navy">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-8 lg:px-8 lg:py-12">
        {/* Верхний блок: галерея + информация */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
          {/* Галерея: большое фото + ряд миниатюр снизу */}
          <div className="min-w-0">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted">
              {current && photoUrls[current.path] ? (
                <img
                  src={photoUrls[current.path]}
                  alt={`${property.title} — фото ${active + 1}`}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-sm text-site-muted">
                  Фотографии не загружены
                </div>
              )}
            </div>

            {photos.length > 1 ? (
              <div className="mt-3 grid grid-cols-5 gap-3">
                {photos.slice(0, 5).map((p, i) => (
                  <button
                    key={p.path}
                    type="button"
                    aria-label={`Фото ${i + 1}`}
                    onClick={() => setActive(i)}
                    className={
                      "aspect-[4/3] overflow-hidden rounded-lg transition-all " +
                      (i === active
                        ? "ring-2 ring-site-gold ring-offset-2 ring-offset-background"
                        : "opacity-70 hover:opacity-100")
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

          {/* Информация */}
          <div className="min-w-0">
            <p
              className={
                "inline-flex items-center gap-2 text-sm font-semibold " +
                (property.status === "free" ? "text-site-green" : "text-site-muted")
              }
            >
              <span
                className={
                  "size-2 rounded-full " +
                  (property.status === "free" ? "bg-site-green" : "bg-site-muted")
                }
              />
              {STATUS_TEXT[property.status] ?? ""}
            </p>

            <h1 className="mt-3 text-[32px] font-bold leading-[1.15] tracking-tight lg:text-4xl">
              {property.title}
            </h1>

            {property.address ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-site-line pb-5">
                <span className="text-sm text-site-muted">{property.address}</span>
                <a
                  href={yandexMapsUrl(property.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-site-gold underline decoration-site-gold/40 underline-offset-4 hover:decoration-site-gold"
                >
                  Карта
                </a>
              </div>
            ) : null}

            {specs.length > 0 ? (
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-b border-site-line pb-6 sm:grid-cols-3">
                {specs.map((s) => (
                  <div key={s.label} className="min-w-0">
                    <dt className="text-[13px] font-semibold">{s.label}</dt>
                    <dd className="mt-1 truncate text-[13px] text-site-muted">{s.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {property.price_month != null ? (
              <p className="mt-6 whitespace-nowrap text-[32px] font-bold leading-none tracking-tight lg:text-[36px]">
                {formatMoney(property.price_month)}{" "}
                <span className="text-lg font-medium text-site-muted">/ мес</span>
              </p>
            ) : null}

            <div className="mt-6 flex items-center gap-3">
              {contactButton}
              {shareButton}
            </div>
          </div>
        </div>

        {/* Условия аренды */}
        {hasRentTerms ? (
          <section className="mt-12 overflow-hidden rounded-2xl border border-site-line">
            <div className="grid gap-8 p-7 md:grid-cols-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-0 lg:p-0">
              <div className="min-w-0 lg:p-9">
                <h2 className="text-xl font-bold tracking-tight">Условия аренды</h2>
                <ul className="mt-5 space-y-3.5 text-sm leading-relaxed">
                  <li className="flex items-start gap-3">
                    <GoldDot />
                    <span>
                      {property.utilities_month != null
                        ? `Коммунальные платежи оплачиваются отдельно — примерно ${formatMoney(property.utilities_month)} в месяц`
                        : "Коммунальные платежи оплачиваются отдельно"}
                    </span>
                  </li>
                  {property.deposit != null ? (
                    <li className="flex items-start gap-3">
                      <GoldDot />
                      <span>
                        Страховой депозит вносится при заселении и возвращается сразу при выезде,
                        при условии что имущество целое
                      </span>
                    </li>
                  ) : null}
                  <li className="flex items-start gap-3">
                    <GoldDot />
                    <span>Проживание с домашними животными обсуждается индивидуально</span>
                  </li>
                </ul>
              </div>

              <div className="min-w-0 lg:border-l lg:border-site-line lg:p-9">
                <p className="text-sm text-site-muted">Стоимость при долгосрочной аренде:</p>
                <dl className="mt-4 space-y-3.5 text-sm">
                  {seasonRows.map((r) => (
                    <div key={r.label} className="flex items-baseline justify-between gap-4">
                      <dt className="flex items-start gap-3 capitalize">
                        <GoldDot />
                        <span>{r.label}</span>
                      </dt>
                      <dd className="whitespace-nowrap font-semibold">
                        {formatMoney(r.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <dl className="mt-5 space-y-2 border-t border-site-line pt-4 text-sm">
                  {property.deposit != null ? (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-site-muted">Страховой депозит</dt>
                      <dd className="whitespace-nowrap font-semibold">
                        {formatMoney(property.deposit)}
                      </dd>
                    </div>
                  ) : null}
                  {property.commission != null ? (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-site-muted">Комиссия</dt>
                      <dd className="whitespace-nowrap font-semibold">
                        {formatMoney(property.commission)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div className="flex min-w-0 flex-col justify-center border-t border-site-line pt-7 md:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:p-9 lg:pt-9">
                {property.price_month != null ? (
                  <p className="whitespace-nowrap text-[26px] font-bold leading-none tracking-tight">
                    {formatMoney(property.price_month)}{" "}
                    <span className="text-base font-medium text-site-muted">/ мес</span>
                  </p>
                ) : null}
                <div className="mt-5 flex items-center gap-3">
                  {contactButton}
                  {shareButton}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* Дополнительно */}
        {features.length > 0 ? (
          <section className="mt-12 border-t border-site-line pt-10">
            <h2 className="text-xl font-bold tracking-tight">Дополнительно</h2>
            <ul className="mt-6 grid gap-x-10 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <GoldDot />
                  {f}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Описание */}
        {paragraphs.length > 0 ? (
          <section className="mt-12 border-t border-site-line pt-10">
            <h2 className="text-xl font-bold tracking-tight">Описание</h2>
            <div className="mt-6 max-w-[70ch] space-y-4 text-[15px] leading-relaxed text-site-muted">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        ) : null}

        {/* Локация */}
        {property.location_description || property.address ? (
          <section className="mt-12 border-t border-site-line pt-10">
            <h2 className="text-xl font-bold tracking-tight">Локация</h2>
            {property.location_description ? (
              <p className="mt-6 max-w-[70ch] text-[15px] leading-relaxed text-site-muted">
                {property.location_description}
              </p>
            ) : null}
            <div className="mt-6 grid aspect-[16/7] w-full place-items-center rounded-2xl border border-site-line bg-muted text-sm text-site-muted">
              <span className="flex items-center gap-2">
                <MapPin className="size-4" />
                Карта появится после подключения Яндекс.Карт
                {property.address ? ` — ${property.address}` : ""}
              </span>
            </div>
          </section>
        ) : null}

        {/* Жилой комплекс */}
        {complex ? (
          <section className="mt-12 border-t border-site-line pt-10">
            <h2 className="text-xl font-bold tracking-tight lg:text-2xl">
              ЖК «{complex.name}»
            </h2>

            <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-12">
              {complexPhotos.length > 0 ? (
                <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                  {photoUrls[complexPhotos[0]!.path] ? (
                    <img
                      src={photoUrls[complexPhotos[0]!.path]}
                      alt={`${complex.name} — главное фото`}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : null}
                </div>
              ) : null}

              <div>
                <h3 className="text-base font-semibold">О комплексе</h3>
                {complex.description ? (
                  <p className="mt-4 max-w-[60ch] whitespace-pre-line text-[15px] leading-relaxed text-site-muted">
                    {complex.description}
                  </p>
                ) : null}
              </div>
            </div>

            {complexPhotos.length > 1 ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {complexPhotos.slice(1, 4).map((p, i) => (
                  <div key={p.path} className="aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                    {photoUrls[p.path] ? (
                      <img
                        src={photoUrls[p.path]}
                        alt={`${complex.name} — фото ${i + 2}`}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {complex.infrastructure.length > 0 ? (
              <>
                <h3 className="mt-10 text-base font-semibold">Для вас доступно</h3>
                <ul className="mt-5 grid gap-x-10 gap-y-3.5 sm:grid-cols-2">
                  {complex.infrastructure.map((i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <GoldDot />
                      {infrastructureLabel(i)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
