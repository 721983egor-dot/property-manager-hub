import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, Phone, Send } from "lucide-react";

import { OwnerCabinetMock } from "@/components/site/OwnerCabinetMock";
import { PageHero, PageHeroCta } from "@/components/site/PageHero";
import { SiteLeadForm } from "@/components/site/SiteLeadForm";
import { jsonLdScript } from "@/lib/seo";
import {
  SITE_EMAIL,
  SITE_NAME,
  SITE_ORIGIN,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_TEL,
  SITE_TELEGRAM,
  SITE_WHATSAPP,
} from "@/lib/site";

export const Route = createFileRoute("/service")({
  head: () => {
    const url = `${SITE_ORIGIN}/service`;
    const image = `${SITE_ORIGIN}/og-cover.jpg`;
    const title = "Обслуживание домов и вилл в Сочи — Резиденция&Море";
    const description =
      "Сервис обслуживания частных домов и вилл в Сочи: территория, сад, бассейн, инженерия, клининг, показания счётчиков и контроль состояния. От 10 000 ₽ в месяц.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        {
          property: "og:description",
          content:
            "Регулярный уход за частным домом в Сочи: бассейн, сад, территория, инженерия, клининг и осмотры — по согласованному перечню.",
        },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "Service",
            name: "Обслуживание домов и вилл",
            serviceType: "Обслуживание частных домов и вилл",
            description,
            url,
            areaServed: {
              "@type": "City",
              name: "Сочи",
            },
            provider: {
              "@type": "LocalBusiness",
              name: SITE_NAME,
              url: SITE_ORIGIN,
              telephone: SITE_PHONE_DISPLAY,
              email: SITE_EMAIL,
              address: {
                "@type": "PostalAddress",
                addressLocality: "Сочи",
                streetAddress: "ул. Московская, д. 22, офис 72",
                addressCountry: "RU",
              },
            },
            offers: {
              "@type": "Offer",
              priceCurrency: "RUB",
              price: "10000",
              priceSpecification: {
                "@type": "UnitPriceSpecification",
                price: "10000",
                priceCurrency: "RUB",
                unitText: "MONTH",
              },
            },
            hasOfferCatalog: {
              "@type": "OfferCatalog",
              name: "Услуги обслуживания дома",
              itemListElement: [
                { "@type": "Offer", itemOffered: { "@type": "Service", name: "Территория и сад" } },
                { "@type": "Offer", itemOffered: { "@type": "Service", name: "Бассейн" } },
                { "@type": "Offer", itemOffered: { "@type": "Service", name: "Инженерные системы" } },
                { "@type": "Offer", itemOffered: { "@type": "Service", name: "Клининг" } },
                { "@type": "Offer", itemOffered: { "@type": "Service", name: "Мелкий ремонт" } },
                { "@type": "Offer", itemOffered: { "@type": "Service", name: "Контроль состояния" } },
              ],
            },
          }),
        },
      ],
    };
  },
  component: ServicePage,
});

const SERVICES = [
  {
    title: "Территория и сад",
    text: "Уход за газоном, растениями, дорожками и зонами отдыха. Чистка ливневок и поддержание участка в порядке в течение сезона.",
  },
  {
    title: "Бассейн",
    text: "Чистка чаши, химия, оборудование и подготовка к сезону — без необходимости искать подрядчиков самостоятельно.",
  },
  {
    title: "Инженерные системы",
    text: "Контроль состояния, протечек, кондиционеров и другого оборудования дома; передача показаний счётчиков; при необходимости — оплата коммунальных платежей.",
  },
  {
    title: "Клининг",
    text: "Регулярная уборка, химчистка текстиля и подготовка дома к приезду собственника или гостей.",
  },
  {
    title: "Мелкий ремонт",
    text: "Находим специалистов, согласуем работы и контролируем результат по согласованному перечню.",
  },
  {
    title: "Контроль состояния",
    text: "Осмотры, фиксация состояния и понятная обратная связь, если объект остаётся без постоянного присутствия.",
  },
];

const VISUAL_STRIP = [
  {
    src: "/service/pool-cleaning.png",
    alt: "Чистка бассейна частного дома в Сочи",
  },
  {
    src: "/service/house-interior-work.png",
    alt: "Работы внутри дома при обслуживании виллы",
  },
  {
    src: "/service/pool-area-wash.png",
    alt: "Мойка территории у бассейна на участке",
  },
  {
    src: "/service/interior-cleaning.png",
    alt: "Клининг интерьера частного дома",
  },
];

const FOR_WHOM = [
  {
    title: "Дом без постоянного проживания",
    text: "Когда вы в городе нечасто — нужен кто-то, кто следит за территорией, бассейном и инженерными системами.",
  },
  {
    title: "Вилла перед сезоном и после",
    text: "Подготовка к сезону, закрытие и регулярный уход, чтобы объект не терял вид и работоспособность.",
  },
  {
    title: "Объект на управлении или отдельно",
    text: "Можно подключить обслуживание вместе с арендой или как отдельный сервис — без обязательной сдачи.",
  },
];

const STEPS = [
  {
    title: "Знакомимся с объектом",
    text: "Смотрим дом, участок, бассейн, инженерию и ваши задачи — что важно поддерживать регулярно.",
  },
  {
    title: "Согласуем перечень работ",
    text: "Фиксируем услуги, периодичность, доступы и порядок согласования внеплановых задач.",
  },
  {
    title: "Запускаем обслуживание",
    text: "Берём объект в работу по графику и остаёмся на связи по текущим вопросам.",
  },
  {
    title: "Держим в порядке и сообщаем",
    text: "Выполняем согласованные работы, фиксируем состояние и информируем вас о важных моментах.",
  },
];

function ServicePage() {
  return (
    <div className="font-site">
      <PageHero
        eyebrow="Территория · Бассейн · Инженерия · Клининг"
        title="Обслуживание домов и вилл"
        description="Регулярный уход за частным домом: сад, бассейн, инженерия и клининг — по согласованному перечню."
        cta={<PageHeroCta href="#lead">Оставить заявку</PageHeroCta>}
      />

      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
            Что входит в сервис
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-site-muted">
            Частный дом требует постоянного внимания и обслуживания. Мы
            организуем уход, работы по поддержанию дома, территории и контроль
            состояния.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {VISUAL_STRIP.map((item) => (
              <div
                key={item.alt}
                className="aspect-[16/10] overflow-hidden rounded-xl bg-site-navy-soft"
              >
                <img
                  src={item.src}
                  alt={item.alt}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>

          <ul className="mt-10 grid gap-5 md:grid-cols-2">
            {SERVICES.map((item) => (
              <li
                key={item.title}
                className="border-l-2 border-site-gold/70 pl-5"
              >
                <h3 className="text-base font-semibold text-site-navy">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-site-muted">
                  {item.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-site-navy-soft py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
            Для кого этот формат
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-site-muted">
            Подходит собственникам, которым важно сохранить дом в порядке —
            без ежедневного контроля и поиска разных исполнителей.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {FOR_WHOM.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-site-line bg-white p-6"
              >
                <h3 className="text-base font-semibold text-site-navy">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-site-muted">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
            Как мы работаем
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-site-muted">
            Сначала разбираем объект и задачи, затем согласуем перечень и
            запускаем регулярное обслуживание.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="rounded-xl border border-site-line bg-white p-6"
              >
                <span className="text-3xl font-bold text-site-gold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 text-base font-semibold text-site-navy">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-site-muted">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-site-navy-soft py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
              Выберите направление
            </h2>
            <p className="mt-4 leading-relaxed text-site-muted">
              Сервис и аренда — два отдельных формата. Можно подключить один
              или оба.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <div className="flex flex-col rounded-2xl border-2 border-site-gold bg-white p-6 shadow-[0_12px_40px_-24px_rgba(199,158,80,0.35)] md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-site-gold">
                Сервис
              </p>
              <p className="mt-3 text-xl font-semibold text-site-navy">
                Обслуживание дома
              </p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-site-muted">
                Уход за территорией, бассейном, инженерией и клининг — по
                согласованному перечню, даже если дом не сдаётся в аренду.
              </p>
              <a
                href="#lead"
                className="mt-6 inline-flex w-fit items-center rounded-md bg-site-navy px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-site-navy/90"
              >
                Оставить заявку
              </a>
            </div>
            <div className="flex flex-col rounded-2xl border border-site-line bg-white p-6 md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-site-gold">
                Аренда
              </p>
              <p className="mt-3 text-xl font-semibold text-site-navy">
                Сдача объекта
              </p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-site-muted">
                Подбор арендатора, договор, заселение и сопровождение на весь
                срок — отдельно от сервиса обслуживания дома.
              </p>
              <Link
                to="/management"
                className="mt-6 inline-flex w-fit items-center rounded-md border border-site-line bg-white px-5 py-3 text-sm font-semibold text-site-navy transition-colors hover:border-site-gold"
              >
                Подробнее
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
                С нами удобно и безопасно
              </h2>
              <p className="mt-4 max-w-lg leading-relaxed text-site-muted">
                С нами удобно и безопасно, особенно это актуально для
                собственников, не проживающих постоянно в Сочи: у вас есть
                надёжный партнёр, который оказывает весь комплекс услуг. Вы
                сразу получаете информацию по состоянию дома и территории, по
                всем выполненным и запланированным работам.
              </p>
              <p className="mt-8 text-3xl font-bold tracking-tight text-site-navy md:text-4xl">
                от{" "}
                <span className="text-site-gold">10&nbsp;000&nbsp;₽</span> в
                месяц
              </p>
              <a
                href="#lead"
                className="mt-8 inline-flex items-center rounded-md bg-site-navy px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-site-navy/90"
              >
                Оставить заявку
              </a>
            </div>
            <OwnerCabinetMock />
          </div>
        </div>
      </section>

      <section id="lead" className="relative overflow-hidden bg-site-navy py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_0%,color-mix(in_oklch,var(--site-gold)_18%,transparent),transparent_50%)]"
        />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-10 px-5 md:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              Свяжитесь с нами или оставьте заявку
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-white/75">
              Расскажите про объект и задачи — предложим формат работ, состав
              услуг и порядок взаимодействия.
            </p>
            <p className="mt-4 text-sm text-site-gold">
              Выезд на объект и оценка стоимости бесплатно
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/85">
              <a
                href={SITE_TELEGRAM}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-white/30 px-4 py-2 font-medium hover:border-site-gold hover:text-site-gold"
              >
                <Send className="size-4" /> Telegram
              </a>
              <a
                href={SITE_WHATSAPP}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-white/30 px-4 py-2 font-medium hover:border-site-gold hover:text-site-gold"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
              <a
                href={SITE_PHONE_TEL}
                className="inline-flex items-center gap-2 rounded-md border border-white/30 px-4 py-2 font-medium hover:border-site-gold hover:text-site-gold"
              >
                <Phone className="size-4" /> Позвонить
              </a>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-2xl md:p-8">
            <p className="text-lg font-semibold text-site-navy">
              Заявка на обслуживание дома
            </p>
            <p className="mt-1 text-sm text-site-muted">
              Заполните форму — свяжемся и уточним детали по объекту.
            </p>
            <div className="mt-4">
              <SiteLeadForm
                source="service"
                defaultTopic="Сервис / обслуживание дома"
                buttonLabel="Оставить заявку"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
