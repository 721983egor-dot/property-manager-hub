import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  Check,
  ClipboardList,
  HeartHandshake,
  MapPin,
  MessageCircle,
  Minus,
  Phone,
  Send,
  Sofa,
  Wrench,
} from "lucide-react";

import { PageHero } from "@/components/site/PageHero";
import { SiteLeadForm } from "@/components/site/SiteLeadForm";
import {
  SITE_ORIGIN,
  SITE_PHONE_TEL,
  SITE_TELEGRAM,
  SITE_WHATSAPP,
} from "@/lib/site";

export const Route = createFileRoute("/about")({
  head: () => {
    const url = `${SITE_ORIGIN}/about`;
    const image = `${SITE_ORIGIN}/og-cover.jpg`;
    return {
      meta: [
        { title: "О компании — Резиденция&Море" },
        {
          name: "description",
          content:
            "«Резиденция & Море» — аренда и сервис обслуживания домов в Сочи. Помогаем сдавать недвижимость и держать частный дом в порядке.",
        },
        {
          property: "og:title",
          content: "О компании — Резиденция&Море",
        },
        {
          property: "og:description",
          content:
            "Аренда квартир, апартаментов, домов и вилл — и отдельный сервис обслуживания частных домов в Сочи.",
        },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: AboutPage,
});

const REALTOR = [
  "поиск арендатора;",
  "показы и переговоры;",
  "согласование условий;",
  "получение разовой комиссии;",
  "дальнейшее сопровождение — на собственнике.",
];

const US = [
  "подготовка объекта к аренде;",
  "поиск и отбор арендатора;",
  "показы, договор и заселение;",
  "контроль оплат и коммунальных расходов;",
  "коммуникация с арендатором;",
  "бытовые и технические заявки;",
  "при необходимости — обслуживание дома и территории.",
];

const DIRECTIONS = [
  {
    icon: Building2,
    title: "Аренда",
    text: "Подбор и сопровождение среднесрочной и долгосрочной аренды квартир, апартаментов, домов и вилл.",
    to: "/rent" as const,
    cta: "Смотреть объекты",
  },
  {
    icon: Wrench,
    title: "Сервис",
    text: "Обслуживание частных домов и вилл: территория, бассейн, инженерия, клининг и контроль состояния — отдельно от аренды или вместе с ней.",
    to: "/service" as const,
    cta: "Перейти в Сервис",
  },
];

const PRINCIPLES = [
  {
    title: "Прозрачность",
    text: "Собственник понимает, что происходит с объектом: платежи, задачи по аренде и состояние дома при обслуживании.",
  },
  {
    title: "Ответственность",
    text: "Не исчезаем после заселения и не оставляем дом без присмотра: остаёмся точкой контакта по текущим вопросам.",
  },
  {
    title: "Два формата работы",
    text: "Можно подключить управление арендой, сервис обслуживания дома — или оба направления, если так удобнее.",
  },
  {
    title: "Спокойствие собственника",
    text: "Цель — доход и порядок без ежедневного участия в операционке аренды и содержания объекта.",
  },
];

function AboutPage() {
  return (
    <div className="font-site">
      <PageHero
        eyebrow="Аренда · Сервис · Управление · Сочи"
        title="Аренда и обслуживание недвижимости в Сочи"
        description="Помогаем собственникам сдавать квартиры, апартаменты, дома и виллы — и отдельно организуем сервис обслуживания частных домов, чтобы объект оставался в порядке."
      />

      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-5 md:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
              Не только аренда — ещё и сервис для дома
            </h2>
            <div className="mt-6 flex flex-col gap-4 leading-relaxed text-site-muted">
              <p>
                «Резиденция & Море» — компания по управлению жилой недвижимостью
                в Сочи. Мы работаем с квартирами, апартаментами, домами и виллами
                для качественной среднесрочной и долгосрочной аренды.
              </p>
              <p>
                Параллельно развиваем направление{" "}
                <Link
                  to="/service"
                  className="font-medium text-site-navy underline-offset-2 hover:underline"
                >
                  Сервис
                </Link>
                : регулярный уход за частным домом — территория, бассейн,
                инженерия, клининг и контроль состояния. Его можно подключить
                вместе с арендой или отдельно, если дом не сдаётся.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-site-gold">
              Наши принципы работы
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {PRINCIPLES.map((item, i) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-site-line bg-white p-5 shadow-sm"
                >
                  <span className="text-2xl font-bold text-site-gold">
                    {i + 1}
                  </span>
                  <p className="mt-3 font-semibold text-site-navy">
                    {item.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-site-muted">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-site-navy-soft py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
              Два направления
            </h2>
            <p className="mt-4 leading-relaxed text-site-muted">
              Выберите формат под задачу — или объедините оба.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {DIRECTIONS.map((item) => (
              <div
                key={item.title}
                className="flex flex-col rounded-2xl border border-site-line bg-white p-6 md:p-8"
              >
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-site-navy-soft text-site-gold">
                  <item.icon className="size-5" />
                </span>
                <p className="mt-4 text-lg font-semibold text-site-navy">
                  {item.title}
                </p>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-site-muted">
                  {item.text}
                </p>
                <Link
                  to={item.to}
                  className="mt-6 inline-flex w-fit items-center rounded-md bg-site-navy px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-site-navy/90"
                >
                  {item.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
              Чем отличаемся от риэлтора
            </h2>
            <p className="mt-4 leading-relaxed text-site-muted">
              Не просто находим арендатора — сопровождаем объект и при
              необходимости обслуживаем дом.
            </p>
          </div>

          <div className="mt-12 grid items-stretch gap-5 lg:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-site-line bg-white p-6 md:p-8">
              <p className="text-lg font-semibold text-site-navy">Риэлтор</p>
              <p className="mt-2 text-sm leading-relaxed text-site-muted">
                Помогает найти арендатора и согласовать сделку. Дальнейшие
                вопросы по объекту обычно остаются на собственнике.
              </p>
              <ul className="mt-6 flex flex-col gap-3 text-sm text-site-muted">
                {REALTOR.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-site-navy-soft text-site-muted">
                      <Minus className="size-3" />
                    </span>
                    <span className="leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col rounded-2xl border-2 border-site-gold bg-white p-6 shadow-[0_12px_40px_-24px_rgba(199,158,80,0.35)] md:p-8">
              <p className="text-lg font-semibold text-site-navy">
                Резиденция & Море
              </p>
              <p className="mt-2 text-sm leading-relaxed text-site-muted">
                Берём полный цикл аренды и можем организовать обслуживание дома:
                территория, бассейн, инженерия, клининг и контроль состояния.
              </p>
              <ul className="mt-6 flex flex-col gap-3 text-sm text-site-navy">
                {US.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-site-gold/15 text-site-gold">
                      <Check className="size-3.5" />
                    </span>
                    <span className="leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-site-navy-soft py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
              Почему мы так работаем
            </h2>
            <p className="mt-4 leading-relaxed text-site-muted">
              В Сочи много собственников, которые не могут ежедневно заниматься
              недвижимостью и домом. Строим работу так, чтобы это не требовало
              постоянного участия.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-site-line bg-white p-6">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-site-navy-soft text-site-gold shadow-sm">
                <MapPin className="size-5" />
              </span>
              <p className="mt-4 font-semibold text-site-navy">
                Собственники не всегда в Сочи
              </p>
              <p className="mt-2 text-sm leading-relaxed text-site-muted">
                Многие живут в других городах и не могут лично контролировать
                объект, проводить показы и решать текущие вопросы.
              </p>
            </div>

            <div className="rounded-2xl border border-site-line bg-white p-6">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-site-navy-soft text-site-gold shadow-sm">
                <ClipboardList className="size-5" />
              </span>
              <p className="mt-4 font-semibold text-site-navy">
                Объект требует внимания
              </p>
              <p className="mt-2 text-sm leading-relaxed text-site-muted">
                Арендаторы, показы, договоры, оплаты, бытовые заявки — и отдельно
                уход за домом, территорией и инженерией.
              </p>
            </div>

            <div className="rounded-2xl border border-site-line bg-white p-6">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-site-navy-soft text-site-gold shadow-sm">
                <HeartHandshake className="size-5" />
              </span>
              <p className="mt-4 font-semibold text-site-navy">
                Берём операционку на себя
              </p>
              <p className="mt-2 text-sm leading-relaxed text-site-muted">
                Запускаем аренду, ведём коммуникацию, контролируем платежи и
                организуем обслуживание по согласованному перечню.
              </p>
            </div>

            <div className="rounded-2xl border border-site-line bg-white p-6">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-site-navy-soft text-site-gold shadow-sm">
                <Sofa className="size-5" />
              </span>
              <p className="mt-4 font-semibold text-site-navy">
                Понятный сервис
              </p>
              <p className="mt-2 text-sm leading-relaxed text-site-muted">
                Арендатор получает быструю связь, собственник — порядок в доме и
                одну точку контакта по аренде и содержанию.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-site-navy py-16">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-5 md:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              Выберите удобный способ связи
            </h2>
            <p className="mt-4 text-white/75">
              Напишите нам в удобный мессенджер или позвоните.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-white/85">
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
              Остались вопросы?
            </p>
            <p className="mt-1 text-sm text-site-muted">
              Заполните форму, и мы свяжемся с вами в ближайшее время.
            </p>
            <div className="mt-4">
              <SiteLeadForm source="about" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
