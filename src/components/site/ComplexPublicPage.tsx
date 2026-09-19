import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Share2 } from "lucide-react";

import { ContactMenu } from "@/components/site/ContactMenu";
import { PropertyCard } from "@/components/site/PropertyCard";
import { infrastructureLabel, type Complex } from "@/lib/complexes";
import type { Property } from "@/lib/properties";
import { publicPhotoUrl } from "@/lib/seo";

type Props = {
  complex: Complex;
  properties: Property[];
  freeFromMap: Record<string, string | null>;
  nextStartMap?: Record<string, string | null>;
};

function objectsWord(count: number) {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return "объектов";
  if (n1 === 1) return "объект";
  if (n1 >= 2 && n1 <= 4) return "объекта";
  return "объектов";
}

function objectsCountLabel(count: number) {
  return `${count} ${objectsWord(count)} в аренду`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b-2 border-site-gold pb-3">
      <h2 className="text-[26px] font-bold tracking-tight text-site-navy">{children}</h2>
    </div>
  );
}

export function ComplexPublicPage({ complex, properties, freeFromMap, nextStartMap = {} }: Props) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const photos = [
    ...(complex.main_photo ? [{ path: complex.main_photo }] : []),
    ...(complex.photos ?? []).filter((p) => p.path !== complex.main_photo),
  ];
  const safeActive = photos.length ? Math.min(active, photos.length - 1) : 0;
  const current = photos[safeActive];

  const locationLines = (complex.location_description || "")
    .split(/\n{1,}/)
    .map((line) => line.trim())
    .filter(Boolean);
  const description = complex.description.trim();

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function prev() {
    setActive((i) => (i - 1 + photos.length) % photos.length);
  }
  function next() {
    setActive((i) => (i + 1) % photos.length);
  }

  const shareButton = (
    <button
      type="button"
      onClick={copyLink}
      aria-label={copied ? "Ссылка скопирована" : "Поделиться"}
      title={copied ? "Ссылка скопирована" : "Поделиться"}
      className="absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-full bg-background/85 text-site-navy shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
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
    <div className="min-h-screen bg-background font-site">
      <div className="mx-auto w-full max-w-[1170px] px-5 pb-24 pt-8 lg:px-8">
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-site-muted">
          <Link to="/" className="transition-colors hover:text-site-navy">
            Главная
          </Link>
          <span className="text-site-gold">→</span>
          <Link to="/rent" className="transition-colors hover:text-site-navy">
            Долгосрочная аренда
          </Link>
          <span className="text-site-gold">→</span>
          <span className="font-semibold text-site-navy">ЖК {complex.name}</span>
        </nav>

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-site-navy-soft">
              {current?.path ? (
                <img
                  src={publicPhotoUrl(current.path)}
                  alt={`ЖК ${complex.name}, Сочи — фото ${safeActive + 1}`}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-base text-site-muted">
                  Фотографии не загружены
                </div>
              )}
              {shareButton}
              {photos.length > 1 ? (
                <>
                  {arrowButton(prev, "left", "Предыдущее фото")}
                  {arrowButton(next, "right", "Следующее фото")}
                </>
              ) : null}
            </div>
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

          <div className="flex min-w-0 flex-col lg:col-span-5">
            {properties.length > 0 ? (
              <p className="text-[15px] font-semibold text-site-green">
                {objectsCountLabel(properties.length)}
              </p>
            ) : (
              <p className="text-[15px] font-semibold text-site-muted">Сейчас свободных объектов нет</p>
            )}

            <h1 className="mt-1.5 text-[18px] font-bold leading-snug tracking-tight sm:text-[20px] lg:text-[22px]">
              Снять квартиру в ЖК «{complex.name}», Сочи
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-site-muted">
              Долгосрочная аренда квартир и апартаментов в жилом комплексе {complex.name}. Актуальные
              объекты, прозрачные условия и сопровождение на весь срок аренды.
            </p>

            <div className="mt-6">
              <dl className="grid grid-cols-2 gap-4 border-t border-site-line py-4 sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-[14px] font-semibold text-site-navy">Город</dt>
                  <dd className="mt-1 text-[15px] leading-snug text-site-muted">Сочи</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[14px] font-semibold text-site-navy">Комплекс</dt>
                  <dd className="mt-1 line-clamp-2 text-[15px] leading-snug text-site-muted">
                    {complex.name}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[14px] font-semibold text-site-navy">В аренде</dt>
                  <dd className="mt-1 text-[15px] leading-snug text-site-muted">
                    {properties.length > 0
                      ? `${properties.length} ${objectsWord(properties.length)}`
                      : "нет свободных"}
                  </dd>
                </div>
              </dl>
              {complex.infrastructure.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 border-t border-site-line py-4">
                  {complex.infrastructure.map((item) => (
                    <span
                      key={item}
                      className="whitespace-nowrap rounded-md border border-site-gold/50 bg-site-gold/10 px-2.5 py-1 text-xs font-medium text-site-navy"
                    >
                      {infrastructureLabel(item)}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="border-t-2 border-site-gold" />
            </div>

            <div className="mt-6">
              <ContactMenu>
                <button
                  type="button"
                  className="h-14 w-[240px] max-w-full shrink-0 cursor-pointer rounded-2xl bg-site-navy px-10 text-[16px] font-semibold whitespace-nowrap text-site-navy-foreground transition-colors hover:bg-site-navy/90"
                >
                  Связаться
                </button>
              </ContactMenu>
            </div>
          </div>
        </div>

        {description ? (
          <section className="mt-14">
            <SectionTitle>О комплексе</SectionTitle>
            <p className="mt-5 max-w-[90ch] whitespace-pre-line text-[16px] leading-[1.8] text-site-muted">
              {description}
            </p>
          </section>
        ) : null}

        {locationLines.length > 0 ? (
          <section className="mt-14">
            <SectionTitle>Локация</SectionTitle>
            <ul className="mt-5 max-w-[90ch] space-y-2.5 text-[16px] leading-[1.8] text-site-muted">
              {locationLines.map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <span className="mt-[8px] size-1.5 shrink-0 bg-site-gold" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-14">
          <SectionTitle>Квартиры в ЖК «{complex.name}»</SectionTitle>
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
                  nextStartIso={nextStartMap[property.id] ?? null}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
