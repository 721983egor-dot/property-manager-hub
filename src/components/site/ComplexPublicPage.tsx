import { Link } from "@tanstack/react-router";

import { PropertyCard } from "@/components/site/PropertyCard";
import { infrastructureLabel, type Complex } from "@/lib/complexes";
import type { Property } from "@/lib/properties";
import { publicPhotoUrl } from "@/lib/seo";

type Props = {
  complex: Complex;
  properties: Property[];
  freeFromMap: Record<string, string | null>;
};

export function ComplexPublicPage({ complex, properties, freeFromMap }: Props) {
  const photos = [
    ...(complex.main_photo ? [{ path: complex.main_photo }] : []),
    ...(complex.photos ?? []).filter((p) => p.path !== complex.main_photo),
  ];
  const cover = photos[0]?.path ? publicPhotoUrl(photos[0].path) : null;
  const locationLines = (complex.location_description || "")
    .split(/\n{1,}/)
    .map((line) => line.trim())
    .filter(Boolean);
  const description = complex.description.trim();

  return (
    <div className="min-h-screen bg-background font-site">
      <div className="mx-auto max-w-[1280px] px-5 py-10 md:px-6 lg:px-8 lg:py-14">
        <p className="text-sm text-site-muted">
          <Link to="/" className="hover:text-site-gold">
            Главная
          </Link>
          <span className="px-2">/</span>
          <Link to="/rent" className="hover:text-site-gold">
            Долгосрочная аренда
          </Link>
          <span className="px-2">/</span>
          <span>ЖК {complex.name}</span>
        </p>

        <header className="mt-6 max-w-3xl">
          <h1 className="text-3xl font-bold leading-tight text-site-navy md:text-5xl">
            Снять квартиру в ЖК «{complex.name}», Сочи
          </h1>
          <p className="mt-4 text-base leading-relaxed text-site-muted md:text-lg">
            Долгосрочная аренда квартир и апартаментов в жилом комплексе {complex.name}. Актуальные
            объекты, прозрачные условия и сопровождение на весь срок аренды.
          </p>
        </header>

        {cover ? (
          <div className="mt-10 overflow-hidden rounded-3xl bg-site-navy-soft">
            <img
              src={cover}
              alt={`ЖК ${complex.name}, Сочи`}
              className="aspect-[21/9] w-full object-cover"
            />
          </div>
        ) : null}

        {description || locationLines.length > 0 || complex.infrastructure.length > 0 ? (
          <section className="mt-12 grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              {description ? (
                <>
                  <h2 className="border-b-2 border-site-gold pb-3 text-[26px] font-bold text-site-navy">
                    О комплексе
                  </h2>
                  <p className="mt-5 whitespace-pre-line text-[16px] leading-[1.8] text-site-muted">
                    {description}
                  </p>
                </>
              ) : null}
              {locationLines.length > 0 ? (
                <div className={description ? "mt-10" : ""}>
                  <h2 className="border-b-2 border-site-gold pb-3 text-[26px] font-bold text-site-navy">
                    Локация
                  </h2>
                  <ul className="mt-5 space-y-2 text-[16px] leading-[1.8] text-site-muted">
                    {locationLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            {complex.infrastructure.length > 0 ? (
              <div className="lg:col-span-5">
                <h2 className="border-b-2 border-site-gold pb-3 text-[26px] font-bold text-site-navy">
                  Инфраструктура
                </h2>
                <ul className="mt-5 grid gap-2.5">
                  {complex.infrastructure.map((item) => (
                    <li key={item} className="text-[16px] text-site-navy">
                      {infrastructureLabel(item)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="mt-14">
          <h2 className="border-b-2 border-site-gold pb-3 text-[26px] font-bold text-site-navy">
            Квартиры в ЖК «{complex.name}»
          </h2>
          {properties.length === 0 ? (
            <p className="mt-8 text-site-muted">
              Сейчас свободных объектов в этом комплексе нет — напишите нам, подберём похожие варианты
              в Сочи.
            </p>
          ) : (
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {properties.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  photoUrl={
                    property.photos[0]?.path ? publicPhotoUrl(property.photos[0].path) : undefined
                  }
                  freeFromIso={freeFromMap[property.id] ?? null}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
