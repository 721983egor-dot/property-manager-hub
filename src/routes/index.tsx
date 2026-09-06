import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { addDays } from "date-fns";
import { ArrowRight, MessageCircle, Phone, Send } from "lucide-react";

import {
  fetchPublishedProperties,
  publicStatusView,
  signedUrls,
} from "@/lib/properties";
import { fetchCurrentBookingsForProperties } from "@/lib/bookings";
import { parseISODate, toISODate } from "@/lib/rentals";
import {
  SITE_ADDRESS,
  SITE_EMAIL,
  SITE_HOURS,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_TEL,
  SITE_TELEGRAM,
  SITE_WHATSAPP,
} from "@/lib/site";
import { PropertyCard } from "@/components/site/PropertyCard";
import { SiteLeadForm } from "@/components/site/SiteLeadForm";
import heroImg from "@/assets/site/home_hero.jpg";
import aboutImg from "@/assets/site/mgmt_p2.jpg";
import selectionImg from "@/assets/site/home_selection.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title:
          "Резиденция&Море - Аренда премиум апартаментов и домов в г. Сочи",
      },
      {
        name: "description",
        content:
          "Резиденция&Море — сервис управления жилой недвижимостью. Сдаём в аренду апартаменты, дома и виллы бизнес и премиум-класса для жизни, отдыха и длительного проживания в Сочи.",
      },
      {
        property: "og:title",
        content:
          "Резиденция&Море - Аренда премиум апартаментов и домов в г. Сочи",
      },
      {
        property: "og:description",
        content:
          "Апартаменты, дома премиум и бизнес класса в Сочи. Только реальные объекты, прозрачные условия, сервис и обслуживание.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "RealEstateAgent",
          name: "Резиденция&Море",
          telephone: "+7 938 442-08-09",
          email: "residence.more@yandex.ru",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Сочи",
            streetAddress: "ул. Московская, д. 22, офис 72",
            addressCountry: "RU",
          },
        }),
      },
    ],
  }),
  component: HomePage,
});

const ADVANTAGES = [
  "Только реальные объекты",
  "Прозрачные условия",
  "Сервис и обслуживание",
];

const SERVICE = [
  {
    title: "Надежная аренда",
    text: "Только актуальные предложения на сайте и комфортная аренда на понятных условиях",
  },
  {
    title: "Сервис на весь срок",
    text: "Если что-то сломалось, нужен клининг, химчистка или бытовая помощь — по всем вопросам к нам",
  },
  {
    title: "Поддержка",
    text: "Подскажем по объекту, правилам проживания, коммуникации с собственником и другим вопросам",
  },
];

const STEPS = [
  {
    title: "Выберите объект или напишите нам",
    text: "Посмотрите подходящие варианты на сайте или напишите нам — мы поможем с подбором под ваш запрос.",
  },
  {
    title: "Согласуем просмотр",
    text: "Подберём удобное время для просмотра и заранее ответим на вопросы по объекту.",
  },
  {
    title: "Покажем объект",
    text: "Организуем просмотр. Если вы без автомобиля — поможем с трансфером до объекта.",
  },
  {
    title: "Подготовим договор",
    text: "Согласуем условия аренды, платежи и сроки, подготовим договор и документы для подписания.",
  },
  {
    title: "Передадим ключи",
    text: "Поможем с заселением и останемся на связи на весь срок аренды.",
  },
];

const ABOUT_TEXT = [
  "Резиденция&Море - сервис управления жилой недвижимостью.",
  "Мы сдаем в аренду апартаменты, дома и виллы бизнес и премиум-класса для жизни, отдыха и длительного проживания в Сочи.",
  "Наша задача — не просто показать объект, а провести клиента через весь процесс аренды: от подбора и просмотра до договора, заселения и сопровождения на протяжении всего срока проживания.",
  "Мы работаем с актуальными объектами, проверенными собственниками и понятными условиями аренды.",
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
          alt="Апартаменты и дома премиум класса в Сочи"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-site-navy/90 via-site-navy/55 to-site-navy/20" />
        <div className="relative mx-auto w-full max-w-[1280px] px-5 py-24 md:px-6">
          <h1 className="max-w-2xl text-5xl font-bold leading-[1.05] text-white md:text-7xl">
            Аренда в <span className="text-site-gold">Сочи</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/80 md:text-lg">
            Апартаменты, дома премиум и бизнес класса
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/rent"
              className="inline-flex items-center gap-2 rounded-md bg-site-gold px-7 py-3.5 text-sm font-semibold text-site-navy transition-colors hover:bg-site-gold/85"
            >
              Выбрать объекты
              <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="mt-12 flex flex-col gap-4 border-l-2 border-site-gold/60 pl-5">
            {ADVANTAGES.map((item) => (
              <p
                key={item}
                className="text-base font-medium text-white/85 md:text-lg"
              >
                {item}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* Популярные объекты */}
      <section className="bg-site-navy-soft py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
              Популярные объекты
            </h2>
            <Link
              to="/rent"
              className="inline-flex items-center gap-2 text-sm font-semibold text-site-navy hover:text-site-gold"
            >
              Смотреть все →
            </Link>
          </div>
          {popular.length > 0 && (
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

      {/* Персональный подбор */}
      <section id="lead" className="relative overflow-hidden py-20">
        <img
          src={selectionImg}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-site-navy/85 via-site-navy/55 to-site-navy/30" />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-10 px-5 md:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              Персональный подбор недвижимости
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-white/75">
              Подберём апартаменты, дом или виллу с учётом района, бюджета и
              ваших пожеланий.
            </p>
            <div className="mt-8 flex flex-col gap-3 text-sm text-white/85">
              <p className="font-semibold text-white">
                Напишите в удобный мессенджер
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href={SITE_TELEGRAM}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-white/30 px-4 py-2 font-medium transition-colors hover:border-site-gold hover:text-site-gold"
                >
                  <Send className="size-4" /> Telegram
                </a>
                <a
                  href={SITE_WHATSAPP}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-white/30 px-4 py-2 font-medium transition-colors hover:border-site-gold hover:text-site-gold"
                >
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
                <a
                  href={SITE_PHONE_TEL}
                  className="inline-flex items-center gap-2 rounded-md border border-white/30 px-4 py-2 font-medium transition-colors hover:border-site-gold hover:text-site-gold"
                >
                  <Phone className="size-4" /> Позвонить
                </a>
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-2xl md:p-8">
            <p className="text-lg font-semibold text-site-navy">Остались вопросы?</p>
            <p className="mt-1 text-sm text-site-muted">
              Заполните форму и мы свяжемся с вами в ближайшее время
            </p>
            <div className="mt-4">
              <SiteLeadForm source="home-selection" />
            </div>
          </div>
        </div>
      </section>

      {/* Сервис и сопровождение */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <h2 className="max-w-2xl text-3xl font-bold text-site-navy md:text-4xl">
            Сервис и сопровождение на весь срок аренды
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-site-muted">
            Мы не просто подбираем объект — остаёмся на связи после заселения и
            помогаем решать бытовые и организационные вопросы.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {SERVICE.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-site-line bg-white p-6 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.25)]"
              >
                <p className="text-lg font-semibold text-site-navy">{item.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-site-muted">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Как у нас арендовать */}
      <section className="bg-site-navy-soft py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
            Как у нас арендовать?
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-site-muted">
            Простой процесс от выбора объекта до заселения и сопровождения на
            весь срок аренды.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="rounded-xl border border-site-line bg-white p-6"
              >
                <span className="text-3xl font-bold text-site-gold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="mt-4 text-base font-semibold text-site-navy">
                  {step.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-site-muted">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* О компании */}
      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-5 md:px-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl">
            <img
              src={aboutImg}
              alt="Апартаменты Резиденция&Море в Сочи"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
              О компании
            </h2>
            <div className="mt-5 flex flex-col gap-4 leading-relaxed text-site-muted">
              {ABOUT_TEXT.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <Link
              to="/about"
              className="mt-8 inline-flex items-center gap-2 rounded-md bg-site-navy px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-site-navy/90"
            >
              О нас
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Контакты */}
      <section className="bg-site-navy py-16">
        <div className="mx-auto grid max-w-[1280px] gap-8 px-5 md:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-white md:text-4xl">Контакты</h2>
            <p className="mt-5 max-w-md leading-relaxed text-white/75">
              Остались вопросы? Вы можете связаться с нами напрямую по номеру
              телефона / почте, либо оставить заявку на звонок.
            </p>
          </div>
          <div className="grid gap-6 text-sm text-white/80 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-site-gold">Телефон</p>
              <a
                href={SITE_PHONE_TEL}
                className="mt-2 block text-lg font-bold text-white hover:text-site-gold"
              >
                {SITE_PHONE_DISPLAY}
              </a>
              <p className="mt-4 text-xs uppercase tracking-wider text-site-gold">
                E-mail
              </p>
              <a
                href={`mailto:${SITE_EMAIL}`}
                className="mt-2 block hover:text-site-gold"
              >
                {SITE_EMAIL}
              </a>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-site-gold">Адрес</p>
              <p className="mt-2">{SITE_ADDRESS}</p>
              <p className="mt-2">{SITE_HOURS}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
