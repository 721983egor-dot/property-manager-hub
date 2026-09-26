import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, Phone, Send } from "lucide-react";

import { SiteLeadForm } from "@/components/site/SiteLeadForm";
import {
  SITE_ORIGIN,
  SITE_PHONE_TEL,
  SITE_TELEGRAM,
  SITE_WHATSAPP,
} from "@/lib/site";
import heroImg from "@/assets/site/mgmt_hero.jpg";
import img3 from "@/assets/site/mgmt_p3.jpg";
import img4 from "@/assets/site/mgmt_p4.jpg";
import img5 from "@/assets/site/mgmt_p5.jpg";

export const Route = createFileRoute("/service")({
  head: () => {
    const url = `${SITE_ORIGIN}/service`;
    const image = `${SITE_ORIGIN}/og-cover.jpg`;
    return {
      meta: [
        {
          title:
            "Обслуживание домов и вилл в Сочи — Резиденция&Море",
        },
        {
          name: "description",
          content:
            "Сервис обслуживания частных домов и вилл в Сочи: территория, сад, бассейн, инженерия, клининг и контроль состояния объекта.",
        },
        {
          property: "og:title",
          content:
            "Обслуживание домов и вилл в Сочи — Резиденция&Море",
        },
        {
          property: "og:description",
          content:
            "Организуем регулярный уход за домом: бассейн, сад, территория, инженерия, клининг и осмотры.",
        },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: ServicePage,
});

const SERVICES = [
  {
    title: "Территория и сад",
    text: "Уход за газоном, растениями, дорожками и зонами отдыха. Держим участок в порядке в течение сезона.",
  },
  {
    title: "Бассейн",
    text: "Чистка, химия, оборудование и подготовка к сезону — без необходимости искать подрядчиков самостоятельно.",
  },
  {
    title: "Инженерные системы",
    text: "Контроль отопления, воды, электрики, кондиционеров и другого оборудования дома.",
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
      <section className="relative flex min-h-[75vh] items-center overflow-hidden bg-site-navy">
        <img
          src={heroImg}
          alt="Обслуживание домов и вилл в Сочи"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-site-navy/90 via-site-navy/60 to-site-navy/25" />
        <div className="relative mx-auto w-full max-w-[1280px] px-5 py-20 md:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
            · Территория · Бассейн · Инженерия · Клининг
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.1] text-white md:text-6xl">
            Обслуживание домов и вилл
          </h1>
          <p className="mt-6 max-w-2xl leading-relaxed text-white/80">
            Берём на себя регулярный уход за частным домом: сад и территория,
            бассейн, инженерные системы, клининг и контроль состояния — по
            согласованному перечню задач.
          </p>
          <a
            href="#lead"
            className="mt-9 inline-flex items-center rounded-md bg-site-gold px-7 py-3.5 text-sm font-semibold text-site-navy transition-colors hover:bg-site-gold/85"
          >
            Оставить заявку
          </a>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
            Что входит в сервис
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-site-muted">
            Частный дом требует постоянного внимания. Мы организуем работу
            подрядчиков и держим процессы в одной точке контакта.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-site-line bg-white p-6"
              >
                <p className="text-base font-semibold text-site-navy">
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-site-muted">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-site-navy-soft py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl">
              <img
                src={img3}
                alt="Дом с бассейном в Сочи"
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
                Для кого этот формат
              </h2>
              <p className="mt-4 leading-relaxed text-site-muted">
                Подходит собственникам, которым важно сохранить дом в порядке —
                без ежедневного контроля и поиска разных исполнителей.
              </p>
              <div className="mt-8 flex flex-col gap-5">
                {FOR_WHOM.map((item) => (
                  <div key={item.title}>
                    <p className="text-base font-semibold text-site-navy">
                      {item.title}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-site-muted">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
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

      <section className="bg-site-navy-soft py-20">
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-5 md:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
              Аренда и сервис — отдельно
            </h2>
            <p className="mt-4 leading-relaxed text-site-muted">
              Если объект сдаётся через нас, обслуживание можно подключить к
              управлению. Если дом не в аренде — работаем как отдельный сервис
              по содержанию.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/rent"
                className="inline-flex items-center rounded-md border border-site-line bg-white px-5 py-3 text-sm font-semibold text-site-navy transition-colors hover:border-site-gold"
              >
                Аренда объектов
              </Link>
              <Link
                to="/management"
                className="inline-flex items-center rounded-md bg-site-navy px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-site-navy/90"
              >
                Собственникам
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl">
            <img
              src={img5}
              alt="Территория частного дома"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      <section id="lead" className="relative overflow-hidden py-20">
        <img
          src={img4}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-site-navy/85" />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-10 px-5 md:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              Обсудим обслуживание вашего дома
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-white/75">
              Расскажите про объект и задачи — предложим формат работ, состав
              услуг и порядок взаимодействия.
            </p>
            <p className="mt-4 text-sm text-site-gold">
              Первичная консультация — бесплатно.
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
