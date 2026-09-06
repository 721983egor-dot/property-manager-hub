import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { addDays } from "date-fns";
import { ArrowRight, Building2, Check, Handshake, KeyRound, Wallet } from "lucide-react";

import {
  fetchPublishedProperties,
  publicStatusView,
  signedUrls,
} from "@/lib/properties";
import { fetchCurrentBookingsForProperties } from "@/lib/bookings";
import { parseISODate, toISODate } from "@/lib/rentals";
import { SITE_EMAIL, SITE_PHONE_DISPLAY, SITE_PHONE_TEL, SITE_TELEGRAM, SITE_WHATSAPP } from "@/lib/site";
import { PropertyCard } from "@/components/site/PropertyCard";
import { SiteLeadForm } from "@/components/site/SiteLeadForm";
import heroImg from "@/assets/site/home_alt.jpg";
import mgmtImg from "@/assets/site/mgmt_p2.jpg";
import selectionImg from "@/assets/site/home_hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Резиденция & Море — аренда недвижимости в Сочи" },
      {
        name: "description",
        content:
          "Агентство недвижимости в Сочи: долгосрочная аренда квартир, домов и вилл, управление объектами и персональный подбор жилья. Работаем без агентов-посредников.",
      },
      { property: "og:title", content: "Резиденция & Море — аренда недвижимости в Сочи" },
      {
        property: "og:description",
        content:
          "Долгосрочная аренда и управление недвижимостью в Сочи. Проверенные квартиры, дома и виллы.",
      },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "RealEstateAgent",
          name: "Резиденция & Море",
          telephone: "+7 938 500-00-24",
          email: "info@residence-more.ru",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Сочи",
            streetAddress: "ул. Войкова 1/1, офис 110",
            addressCountry: "RU",
          },
        }),
      },
    ],
  }),
  component: HomePage,
});

const STEPS = [
  {
    icon: Building2,
    title: "Выбираете объект",
    text: "Смотрите актуальные варианты в каталоге и оставляете заявку на просмотр.",
  },
  {
    icon: Handshake,
    title: "Персональный менеджер",
    text: "Менеджер связывается с вами, уточняет пожелания и организует показ.",
  },
  {
    icon: KeyRound,
    title: "Оформляете аренду",
    text: "Договор, депозит, акт приёма-передачи — берём все вопросы на себя.",
  },
  {
    icon: Wallet,
    title: "Комфортное проживание",
    text: "Остаёмся на связи весь срок аренды: оплата, бытовые вопросы, поддержка.",
  },
];

const MGMT_POINTS = [
  "Поиск и проверка арендаторов",
  "Профессиональная фотосессия и размещение",
  "Полное сопровождение сделки и проживания",
];

function HomePage() {
  const { data: allProperties = [] } = useQuery({
    queryKey: ["published-properties"],
    queryFn: fetchPublishedProperties,
  });

  const todayIso = useMemo(() => toISODate(new Date()), []);
  const propertyIds = useMemo(() => allProperties.map((p) => p.id), [allProperties]);

  const { data: bookingsMap = {} } = useQuery({
    queryKey: ["current-bookings", propertyIds.join("|"), todayIso],
    queryFn: () => fetchCurrentBookingsForProperties(propertyIds, todayIso),
    enabled: propertyIds.length > 0,
  });

  const popular = useMemo(() => {
    const freeFrom: Record<string, string> = {};
    for (const [pid, b] of Object.entries(bookingsMap)) {
      freeFrom[pid] = toISODate(addDays(parseISODate(b.end_date), 1));
    }
    return allProperties
      .filter((p) => {
        const view = publicStatusView(p, freeFrom[p.id] ?? null);
        return view && (view.tone === "green" || view.tone === "gold");
      })
      .slice(0, 6)
      .map((p) => ({ property: p, freeFromIso: freeFrom[p.id] ?? null }));
  }, [allProperties, bookingsMap]);

  const photoPaths = popular
    .map((p) => p.property.photos[0]?.path)
    .filter((path): path is string => Boolean(path));

  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", photoPaths.slice().sort().join("|")],
    queryFn: () => signedUrls(photoPaths),
    enabled: photoPaths.length > 0,
  });

  return (
    <div className="font-site">
      {/* Первый экран */}
      <section className="relative flex min-h-[88vh] items-center overflow-hidden bg-site-navy">
        <img
          src={heroImg}
          alt="Вилла с видом на море в Сочи"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-site-navy/90 via-site-navy/55 to-site-navy/20" />
        <div className="relative mx-auto w-full max-w-[1280px] px-5 py-24 md:px-6">
          <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
            <span className="h-px w-10 bg-site-gold" />
            Агентство недвижимости · Сочи
          </p>
          <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-[1.1] text-white md:text-6xl">
            Аренда доходной недвижимости в Сочи
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/80 md:text-lg">
            Квартиры, дома и виллы для долгосрочной аренды и отдыха у моря.
            Быстро, безопасно и без лишних посредников.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/rent"
              className="inline-flex items-center gap-2 rounded-md bg-site-gold px-7 py-3.5 text-sm font-semibold text-site-navy transition-colors hover:bg-site-gold/85"
            >
              Смотреть объекты
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="#lead"
              className="inline-flex items-center rounded-md border border-white/40 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:border-site-gold hover:text-site-gold"
            >
              Обсудить объект
            </a>
          </div>
        </div>
      </section>

      {/* Как это работает */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
            <span className="h-px w-10 bg-site-gold" />
            Как это работает
          </p>
          <h2 className="mt-4 max-w-xl text-3xl font-bold text-site-navy md:text-4xl">
            4 шага до ключей
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="rounded-xl border border-site-line bg-white p-6 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.25)]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold text-site-gold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <step.icon className="size-6 text-site-gold" />
                </div>
                <p className="mt-4 text-base font-semibold text-site-navy">{step.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-site-muted">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Популярные объекты */}
      <section className="bg-site-navy-soft py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
                <span className="h-px w-10 bg-site-gold" />
                Каталог
              </p>
              <h2 className="mt-4 text-3xl font-bold text-site-navy md:text-4xl">
                Свободные объекты
              </h2>
            </div>
            <Link
              to="/rent"
              className="inline-flex items-center gap-2 text-sm font-semibold text-site-navy hover:text-site-gold"
            >
              Смотреть все объекты
              <ArrowRight className="size-4" />
            </Link>
          </div>
          {popular.length === 0 ? (
            <p className="mt-10 text-sm text-site-muted">
              Сейчас все объекты заняты — оставьте заявку, и мы подберём вариант под вас.
            </p>
          ) : (
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {popular.map(({ property, freeFromIso }) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  freeFromIso={freeFromIso}
                  photoUrl={
                    property.photos[0]?.path
                      ? urls[property.photos[0].path]
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Управление недвижимостью */}
      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-5 md:px-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl">
            <img
              src={mgmtImg}
              alt="Терраса объекта под управлением"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <div>
            <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
              <span className="h-px w-10 bg-site-gold" />
              Собственникам
            </p>
            <h2 className="mt-4 text-3xl font-bold text-site-navy md:text-4xl">
              Управление вашей недвижимостью
            </h2>
            <p className="mt-5 leading-relaxed text-site-muted">
              Вы владеете — мы управляем. Доверьте нам свою недвижимость и
              получайте доход от аренды без забот. Всё остальное — наша работа.
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              {MGMT_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-site-navy">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-site-gold-soft">
                    <Check className="size-3.5 text-site-gold" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <Link
              to="/management"
              className="mt-8 inline-flex items-center gap-2 rounded-md bg-site-navy px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-site-navy/90"
            >
              Подробнее об управлении
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Персональный подбор + заявка */}
      <section id="lead" className="relative overflow-hidden py-20">
        <img
          src={selectionImg}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-site-navy/85" />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-10 px-5 md:px-6 lg:grid-cols-2">
          <div>
            <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
              <span className="h-px w-10 bg-site-gold" />
              Персональный подбор
            </p>
            <h2 className="mt-4 text-3xl font-bold text-white md:text-4xl">
              Не нашли подходящий вариант?
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-white/75">
              Оставьте заявку — мы перезвоним и подберём варианты специально под
              вас. В базе всегда есть объекты, которые ещё не опубликованы.
            </p>
            <div className="mt-8 flex flex-col gap-3 text-sm text-white/85">
              <a href={SITE_PHONE_TEL} className="text-lg font-bold text-white hover:text-site-gold">
                {SITE_PHONE_DISPLAY}
              </a>
              <div className="flex gap-4">
                <a href={SITE_TELEGRAM} target="_blank" rel="noreferrer" className="font-medium hover:text-site-gold">
                  Telegram
                </a>
                <a href={SITE_WHATSAPP} target="_blank" rel="noreferrer" className="font-medium hover:text-site-gold">
                  WhatsApp
                </a>
                <a href={`mailto:${SITE_EMAIL}`} className="font-medium hover:text-site-gold">
                  {SITE_EMAIL}
                </a>
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-2xl md:p-8">
            <p className="text-lg font-semibold text-site-navy">Оставить заявку</p>
            <div className="mt-4">
              <SiteLeadForm source="home-selection" defaultTopic="selection" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
