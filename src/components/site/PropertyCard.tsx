import { Link } from "@tanstack/react-router";
import {
  formatArea,
  formatLandArea,
  formatMoney,
  highlightLabel,
  isHouseType,
  publicStatusView,
  shortAddress,
  STATUS_TONE_CLASS,
  type Property,
} from "@/lib/properties";

type Props = {
  property: Property;
  photoUrl?: string | undefined;
  /** Первый свободный день (ISO) — для объектов на управлении. */
  freeFromIso?: string | null;
};

function bedroomsLabel(rooms: number) {
  if (rooms === 0) return "Студия";
  if (rooms === 1) return "1 спальня";
  if (rooms >= 2 && rooms <= 4) return `${rooms} спальни`;
  return `${rooms} спален`;
}

export function PropertyCard(props: Props) {
  const { property, photoUrl } = props;
  const statusView = publicStatusView(property, props.freeFromIso);
  const isHouse = isHouseType(property.type);
  const highlights = (property.card_highlights ?? []).slice(0, 3).map(highlightLabel);


  const specs = (
    isHouse
      ? [
          formatArea(property.area),
          property.land_area != null ? `участок ${formatLandArea(property.land_area)}` : null,
          bedroomsLabel(property.rooms),
        ]
      : [
          formatArea(property.area),
          bedroomsLabel(property.rooms),
          property.floor != null ? `${property.floor} этаж` : null,
        ]
  ).filter((v): v is string => Boolean(v) && v !== "—");

  return (
    <Link
      to="/rent/$id"
      params={{ id: property.id }}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white transition-shadow duration-300 hover:shadow-[0_18px_50px_-30px_rgba(14,27,44,0.45)]"
    >
      <div className="aspect-[4/3] overflow-hidden bg-site-navy-soft">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={property.title}
            loading="lazy"
            className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="grid size-full place-items-center text-sm text-site-muted">
            Фото не загружено
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col px-6 py-7">
        <h3 className="min-h-[3.5rem] text-xl font-bold leading-snug text-site-navy line-clamp-2">
          {property.title}
        </h3>

        {statusView ? (
          <p className={`mt-3 text-base font-bold ${STATUS_TONE_CLASS[statusView.tone]}`}>
            {statusView.text}
          </p>
        ) : null}

        <div className="mt-5 h-px w-2/3 bg-site-gold/40" />

        <p className="mt-5 truncate text-base text-site-muted">
          {property.complex_id
            ? property.complex_name
            : shortAddress(property.address) || "\u00A0"}
        </p>

        <div className="mt-3 flex h-[30px] flex-wrap content-start gap-1.5 overflow-hidden">
          {highlights.map((h) => (
            <span
              key={h}
              className="whitespace-nowrap rounded-md border border-site-gold/50 bg-site-gold/10 px-2.5 py-1 text-xs font-medium text-site-navy"
            >
              {h}
            </span>
          ))}
        </div>

        <div className="mt-2 flex h-[30px] flex-wrap content-start gap-1.5 overflow-hidden">
          {specs.map((s) => (
            <span
              key={s}
              className="whitespace-nowrap rounded-md border border-site-line bg-site-navy-soft px-2.5 py-1 text-xs font-medium text-site-muted"
            >
              {s}
            </span>
          ))}
        </div>

        <div className="mt-6 h-px w-2/3 bg-site-gold/40" />

        <div className="mt-6 flex items-center justify-between gap-4">
          <span className="inline-flex items-center justify-center rounded-lg bg-site-navy px-6 py-3 text-sm font-semibold text-site-navy-foreground transition-colors group-hover:bg-site-navy/90">
            Подробнее
          </span>
          <p className="whitespace-nowrap text-xl font-bold text-site-navy">
            {formatMoney(property.price_month)} / мес
          </p>
        </div>
      </div>
    </Link>
  );
}
