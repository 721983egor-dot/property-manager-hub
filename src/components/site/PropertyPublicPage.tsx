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
      className="grid size-14 shrink-0 place-items-center rounded-xl border border-site-navy/15 bg-background text-site-navy transition-colors hover:border-site-gold hover:text-site-gold"
    >
      {copied ? <Check className="size-5 text-site-green" /> : <Share2 className="size-5" />}
    </button>
  );

  const contactButton = (
    <button
      type="button"
      className="h-14 flex-1 rounded-xl bg-site-navy px-8 text-base font-medium text-site-navy-foreground transition-opacity hover:opacity-90"
    >
      Связаться
    </button>
  );

  return (
    <div className="bg-background text-site-navy">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-10 lg:px-6 lg:py-14">
        {/* Верхний блок: галерея + информация */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14">
          {/* Галерея: большое фото + колонка миниатюр */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="aspect-[4/3] min-w-0 flex-1 overflow-hidden rounded-2xl bg-muted">
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
              <div className="grid shrink-0 grid-cols-4 gap-3 sm:w-28 sm:grid-cols-1 sm:content-start lg:w-32">
                {photos.slice(0, 8).map((p, i) => (
                  <button
                    key={p.path}
                    type="button"
                    aria-label={`Фото ${i + 1}`}
                    onClick={() => setActive(i)}
                    className={
                      "aspect-[4/3] overflow-hidden rounded-xl border transition-colors " +
                      (i === active
                        ? "border-site-gold ring-1 ring-site-gold"
                        : "border-transparent opacity-80 hover:opacity-100")
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
          <div>
            <p
              className={
                "text-sm font-semibold " +
                (property.status === "free" ? "text-site-green" : "text-site-muted")
              }
            >
              {STATUS_TEXT[property.status] ?? ""}
            </p>

            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
              {property.title}
            </h1>

            {property.address ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 border-b border-site-line pb-5 text-site-muted">
                <span className="text-sm">{property.address}</span>
                <a
                  href={yandexMapsUrl(property.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-site-gold underline underline-offset-4"
                >
                  Карта
                </a>
              </div>
            ) : null}

            {specs.length > 0 ? (
              <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 border-b border-site-line pb-6 sm:grid-cols-3">
                {specs.map((s) => (
                  <div key={s.label}>
                    <dt className="text-sm font-semibold">{s.label}</dt>
                    <dd className="mt-1 text-sm text-site-muted">{s.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {property.price_month != null ? (
              <p className="mt-7 text-3xl font-bold tracking-tight lg:text-4xl">
                {formatMoney(property.price_month)} / мес
              </p>
            ) : null}

            <div className="mt-7 flex items-center gap-3">
              {contactButton}
              {shareButton}
            </div>
          </div>
        </div>

        {/* Условия аренды */}
        {hasRentTerms ? (
          <section className="mt-14 rounded-2xl border border-site-line">
            <div className="grid gap-10 p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)] lg:p-10">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Условия аренды</h2>
                <ul className="mt-6 space-y-3 text-sm">
                  {property.utilities_month != null ? (
                    <li className="flex items-start gap-3">
                      <span className="mt-1.5 size-2 shrink-0 bg-site-gold" />
                      Коммунальные платежи оплачиваются отдельно — примерно{" "}
                      {formatMoney(property.utilities_month)} в месяц
                    </li>
                  ) : (
                    <li className="flex items-start gap-3">
                      <span className="mt-1.5 size-2 shrink-0 bg-site-gold" />
                      Коммунальные платежи оплачиваются отдельно
                    </li>
                  )}
                  {property.deposit != null ? (
                    <li className="flex items-start gap-3">
                      <span className="mt-1.5 size-2 shrink-0 bg-site-gold" />
                      Страховой депозит вносится при заселении и возвращается сразу при выезде,
                      при условии что имущество целое
                    </li>
                  ) : null}
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 size-2 shrink-0 bg-site-gold" />
                    Проживание с домашними животными обсуждается индивидуально
                  </li>
                </ul>
              </div>

              <div className="lg:border-l lg:border-site-line lg:pl-10">
                <p className="text-sm text-site-muted">Стоимость при долгосрочной аренде:</p>
                <ul className="mt-5 space-y-4 text-sm">
                  {property.seasonal_pricing && property.summer_price_month != null ? (
                    <>
                      <li className="flex items-start gap-3">
                        <span className="mt-1.5 size-2 shrink-0 bg-site-gold" />
                        <span className="capitalize">{SUMMER_SEASON_LABEL}:</span>{" "}
                        <strong className="font-semibold">
                          {formatMoney(property.summer_price_month)} в месяц
                        </strong>
                      </li>
                      {property.price_month != null ? (
                        <li className="flex items-start gap-3">
                          <span className="mt-1.5 size-2 shrink-0 bg-site-gold" />
                          Октябрь — май:{" "}
                          <strong className="font-semibold">
                            {formatMoney(property.price_month)} в месяц
                          </strong>
                        </li>
                      ) : null}
                    </>
                  ) : property.price_month != null ? (
                    <li className="flex items-start gap-3">
                      <span className="mt-1.5 size-2 shrink-0 bg-site-gold" />
                      <strong className="font-semibold">
                        {formatMoney(property.price_month)} в месяц
                      </strong>
                    </li>
                  ) : null}
                </ul>
                <dl className="mt-6 space-y-2 text-sm">
                  {property.deposit != null ? (
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <dt className="text-site-muted">Страховой депозит</dt>
                      <dd className="font-semibold">{formatMoney(property.deposit)}</dd>
                    </div>
                  ) : null}
                  {property.commission != null ? (
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <dt className="text-site-muted">Комиссия</dt>
                      <dd className="font-semibold">{formatMoney(property.commission)}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div className="flex flex-col justify-center lg:border-l lg:border-site-line lg:pl-10">
                {property.price_month != null ? (
                  <p className="text-2xl font-bold tracking-tight lg:text-3xl">
                    {formatMoney(property.price_month)} / мес
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
          <section className="mt-14 border-t border-site-line pt-10">
            <h2 className="text-2xl font-bold tracking-tight">Дополнительно</h2>
            <ul className="mt-6 grid gap-x-10 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 bg-site-gold" />
                  {f}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Описание */}
        {paragraphs.length > 0 ? (
          <section className="mt-14 border-t border-site-line pt-10">
            <h2 className="text-2xl font-bold tracking-tight">Описание</h2>
            <div className="mt-6 max-w-[70ch] space-y-4 text-base leading-relaxed text-site-muted">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        ) : null}

        {/* Локация */}
        {property.location_description || property.address ? (
          <section className="mt-14 border-t border-site-line pt-10">
            <h2 className="text-2xl font-bold tracking-tight">Локация</h2>
            {property.location_description ? (
              <p className="mt-6 max-w-[70ch] text-base leading-relaxed text-site-muted">
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
          <section className="mt-14 border-t border-site-line pt-10">
            <h2 className="text-2xl font-bold tracking-tight lg:text-3xl">
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
                  <p className="mt-4 max-w-[60ch] whitespace-pre-line text-base leading-relaxed text-site-muted">
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
                <ul className="mt-5 grid gap-x-10 gap-y-3 sm:grid-cols-2">
                  {complex.infrastructure.map((i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="mt-1.5 size-2 shrink-0 bg-site-gold" />
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
