import { Link } from "@tanstack/react-router";
import { formatArea, formatMoney, roomsLabel, type Property } from "@/lib/properties";

type Props = {
  property: Property;
  complexName?: string | null;
  photoUrl?: string;
};

export function PropertyCard({ property, complexName, photoUrl }: Props) {
  const isFree = property.status === "free";

  return (
    <Link
      to="/rent/$id"
      params={{ id: property.id }}
      className="group flex flex-col overflow-hidden rounded-xl border border-site-line bg-white transition-all duration-300 hover:border-site-gold"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-site-navy-soft">
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
        <span
          className={`absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
            isFree
              ? "bg-site-green/10 text-site-green"
              : "bg-site-navy-soft text-site-muted"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              isFree ? "bg-site-green" : "bg-site-muted"
            }`}
          />
          {isFree ? "Свободен сейчас" : "Занят"}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold leading-snug text-site-navy transition-colors group-hover:text-site-gold">
          {property.title}
        </h3>

        {complexName ? (
          <p className="mt-1.5 text-sm font-medium text-site-navy/80">{complexName}</p>
        ) : null}

        <p className="mt-1 truncate text-sm text-site-muted">{property.address || "Адрес не указан"}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-site-navy">
          <span className="font-medium">{roomsLabel(property.rooms)}</span>
          <span className="text-site-line">·</span>
          <span className="font-medium">{formatArea(property.area)}</span>
        </div>

        <div className="mt-auto flex items-end justify-between gap-4 pt-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-site-muted">в месяц</p>
            <p className="mt-0.5 text-xl font-bold text-site-navy">
              {formatMoney(property.price_month)}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-site-navy px-5 py-2.5 text-sm font-semibold text-site-navy-foreground transition-colors group-hover:bg-site-navy/90">
            Подробнее
          </span>
        </div>
      </div>
    </Link>
  );
}
