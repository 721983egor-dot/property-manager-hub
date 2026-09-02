import { useState } from "react";
import { MapPin, Share2 } from "lucide-react";

import {
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

  return (
    <div className="bg-background text-site-navy">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-10 lg:px-6 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14">
          {/* Галерея */}
          <div>
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
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  {photos.map((p, i) => (
                    <button
                      key={p.path}
                      type="button"
                      aria-label={`Фото ${i + 1}`}
                      onClick={() => setActive(i)}
                      className={
                        "size-2 rounded-full transition-colors " +
                        (i === active ? "bg-site-navy" : "bg-site-line")
                      }
                    />
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
                  {photos.slice(0, 12).map((p, i) => (
                    <button
                      key={p.path}
                      type="button"
                      onClick={() => setActive(i)}
                      className={
                        "aspect-[4/3] overflow-hidden rounded-lg border transition-colors " +
                        (i === active ? "border-site-gold" : "border-site-line")
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
              </>
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
              <button
                type="button"
                className="h-14 flex-1 rounded-xl bg-site-navy px-8 text-base font-medium text-site-navy-foreground transition-opacity hover:opacity-90"
              >
                Связаться
              </button>
              <button
                type="button"
                aria-label="Поделиться"
                className="grid size-14 shrink-0 place-items-center rounded-xl bg-site-navy text-site-navy-foreground transition-opacity hover:opacity-90"
              >
                <Share2 className="size-5" />
              </button>
            </div>
          </div>
        </div>

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
      </div>
    </div>
  );
}
