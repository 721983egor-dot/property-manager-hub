import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Check,
  ClipboardList,
  FileCheck2,
  HeartHandshake,
  MapPin,
  MessageCircle,
  Minus,
  Phone,
  Send,
  ShieldCheck,
  Sofa,
} from "lucide-react";

import { SiteLeadForm } from "@/components/site/SiteLeadForm";
import { SITE_PHONE_TEL, SITE_TELEGRAM, SITE_WHATSAPP } from "@/lib/site";
import heroImg from "@/assets/site/about_hero.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "О компании — Резиденция&Море" },
      {
        name: "description",
        content:
          "«Резиденция & Море» — сервис управления жилой недвижимостью в Сочи. Помогаем собственникам сдавать квартиры, апартаменты, дома и виллы, а арендаторам — находить комфортное жильё.",
      },
      {
        property: "og:title",
        content: "О компании — Резиденция&Море",
      },
      {
        property: "og:description",
        content:
          "Управляем недвижимостью в Сочи системно и прозрачно: поиск арендатора, показы, договор, контроль оплат и сопровождение.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "/about" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
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
  "бытовые и технические заявки.",
];

const PRINCIPLES = [
  {
    icon: FileCheck2,
    title: "Прозрачность",
    text: "Собственник понимает, что происходит с объектом: какие платежи поступают, какие задачи решаются и какие вопросы возникают в процессе аренды.",
  },
  {
    icon: ShieldCheck,
    title: "Ответственность",
    text: "Мы не исчезаем после заселения арендатора, а сопровождаем объект на протяжении срока аренды и остаёмся точкой контакта по текущим вопросам.",
  },
  {
    icon: Building2,
    title: "Качество объектов",
    text: "Мы работаем с недвижимостью, которую можно достойно представить рынку и качественно сопровождать: квартирами, апартаментами, домами и виллами в хорошем состоянии.",
  },
  {
    icon: Sofa,
    title: "Спокойствие собственника",
    text: "Наша цель — чтобы собственник получал доход от объекта без ежедневного участия в операционных вопросах аренды и обслуживания.",
  },
];

function AboutPage() {
  return (
    <div className="font-site">
      <section className="relative flex min-h-[70vh] items-center overflow-hidden bg-site-navy">
        <img
          src={heroImg}
          alt="Недвижимость в Сочи"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-site-navy/90 via-site-navy/60 to-site-navy/25" />
        <div className="relative mx-auto w-full max-w-[1280px] px-5 py-20 md:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
            · Собственникам · Арендаторам · Управление · Сопровождение
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.1] text-white md:text-6xl">
            Управляем недвижимостью в Сочи системно и прозрачно
          </h1>
          <p className="mt-6 max-w-2xl leading-relaxed text-white/80">
            Помогаем собственникам сдавать квартиры, апартаменты, дома и виллы в
            среднесрочную и долгосрочную аренду, а арендаторам — находить
            комфортное жильё для жизни в Сочи.
          </p>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-5 md:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
              Мы не просто сдаём недвижимость — мы управляем объектом
            </h2>
            <div className="mt-6 flex flex-col gap-4 leading-relaxed text-site-muted">
              <p>
                «Резиденция & Море» — сервис управления жилой недвижимостью в
                Сочи. Мы работаем с квартирами, апартаментами, домами и виллами,
                которые подходят для качественной среднесрочной и долгосрочной
                аренды.
              </p>
              <p>
                Наша задача — снять с собственника операционные вопросы: поиск
                арендатора, показы, договор, контроль платежей, коммуникацию,
                бытовые заявки и организацию обслуживания объекта.
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
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-site-gold">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <item.icon className="size-5 text-site-gold" />
                  </div>
                  <p className="mt-3 font-semibold text-site-navy">
                    {item.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-site-muted">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-sm leading-relaxed text-site-muted">
              Мы берём в работу не просто объект, а ответственность за его
              аренду, состояние и коммуникацию между сторонами.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-site-navy-soft py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
              Чем отличаемся от риэлтора
            </h2>
            <p className="mt-4 leading-relaxed text-site-muted">
              Не просто находим арендатора — управляем объектом после
              заселения
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

            <div className="flex flex-col rounded-2xl border-2 border-site-gold bg-white p-6 md:p-8 shadow-[0_12px_40px_-24px_rgba(199,158,80,0.35)]">
              <p className="text-lg font-semibold text-site-navy">
                Резиденция & Море
              </p>
              <p className="mt-2 text-sm leading-relaxed text-site-muted">
                Берём на себя полный цикл: готовим объект, ищем арендатора,
                оформляем договор, контролируем оплаты и сопровождаем аренду.
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

          <p className="mt-10 text-center leading-relaxed text-site-navy">
            Мы не просто приводим арендатора — берём на себя управление объектом
            на весь срок аренды.
          </p>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
              Почему мы так работаем
            </h2>
            <p className="mt-4 leading-relaxed text-site-muted">
              В Сочи много собственников, которые не могут ежедневно заниматься
              своей недвижимостью. Мы строим работу так, чтобы это не требовало
              их постоянного участия.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-site-line bg-site-navy-soft p-6">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white text-site-gold shadow-sm">
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

            <div className="rounded-2xl border border-site-line bg-site-navy-soft p-6">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white text-site-gold shadow-sm">
                <ClipboardList className="size-5" />
              </span>
              <p className="mt-4 font-semibold text-site-navy">
                Объект требует внимания
              </p>
              <p className="mt-2 text-sm leading-relaxed text-site-muted">
                Арендаторы, показы, договоры, оплаты, бытовые заявки,
                обслуживание и контроль состояния — всё это нужно вести.
              </p>
            </div>

            <div className="rounded-2xl border border-site-line bg-site-navy-soft p-6">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white text-site-gold shadow-sm">
                <HeartHandshake className="size-5" />
              </span>
              <p className="mt-4 font-semibold text-site-navy">
                Берём операционку на себя
              </p>
              <p className="mt-2 text-sm leading-relaxed text-site-muted">
                Запускаем аренду, ведём коммуникацию, контролируем платежи и
                текущие вопросы по объекту.
              </p>
            </div>

            <div className="rounded-2xl border border-site-line bg-site-navy-soft p-6">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white text-site-gold shadow-sm">
                <Sofa className="size-5" />
              </span>
              <p className="mt-4 font-semibold text-site-navy">
                Сервис для арендатора
              </p>
              <p className="mt-2 text-sm leading-relaxed text-site-muted">
                Арендатор получает понятные условия, быструю связь и помощь на
                протяжении всего срока проживания.
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
              Напишите нам в удобный мессендже или позвоните
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
            <p className="text-lg font-semibold text-site-navy">Остались вопросы?</p>
            <p className="mt-1 text-sm text-site-muted">
              Заполните форму и мы свяжемся с вами в ближайшее время
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
