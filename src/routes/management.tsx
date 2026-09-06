import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Phone, Send } from "lucide-react";

import { SiteLeadForm } from "@/components/site/SiteLeadForm";
import { SITE_PHONE_TEL, SITE_TELEGRAM, SITE_WHATSAPP } from "@/lib/site";
import heroImg from "@/assets/site/mgmt_hero.jpg";
import img3 from "@/assets/site/mgmt_p3.jpg";
import img4 from "@/assets/site/mgmt_p4.jpg";

export const Route = createFileRoute("/management")({
  head: () => ({
    meta: [
      { title: "Доходное управление апартаментами и домами в Сочи — Резиденция&Море" },
      {
        name: "description",
        content:
          "Помогаем сдавать квартиры, апартаменты, дома и виллы в среднесрочную и долгосрочную аренду. Берём на себя поиск арендаторов, показы, договор, контроль оплат и сопровождение объекта.",
      },
      {
        property: "og:title",
        content: "Доходное управление апартаментами и домами в Сочи — Резиденция&Море",
      },
      {
        property: "og:description",
        content:
          "Сервис управления жилой недвижимостью: поиск арендаторов, контроль оплат, обслуживание, страхование.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "/management" },
    ],
    links: [{ rel: "canonical", href: "/management" }],
  }),
  component: ManagementPage,
});

const OBJECT_TYPES = [
  {
    title: "Квартиры и апартаменты",
    text: "Подбираем арендаторов, организуем показы, готовим договор, контролируем оплату, коммунальные платежи и помогаем решать бытовые вопросы во время аренды.",
    points: [
      "Поиск арендатора",
      "Договор и заселение",
      "Контроль оплат",
      "Сопровождение аренды",
    ],
  },
  {
    title: "Дома и виллы",
    text: "Помимо аренды и сопровождения, можем организовать обслуживание территории, бассейна, инженерных систем, клининг, мелкий ремонт и контроль состояния объекта.",
    points: [
      "Уход за территорией",
      "Обслуживание бассейна",
      "Клининг и мелкий ремонт",
      "Контроль состояния объекта",
    ],
  },
];

const EXTRA = [
  {
    title: "Инженерные системы",
    text: "Контроль систем кондиционирования, отопления, воды, электрики и оборудования.",
  },
  {
    title: "Территория и участок",
    text: "Организуем уход за участком, газоном, растениями, придомовой территорией и зонами отдыха.",
  },
  {
    title: "Бассейн",
    text: "Обслуживание оборудования, чистка бассейнов, фонтанов и подготовку к сезону.",
  },
  {
    title: "Клининг и химчистка",
    text: "Уборка, химчистка мебели, текстиля и подготовка дома к проживанию.",
  },
  {
    title: "Мелкий ремонт",
    text: "Находим специалистов, согласуем работы и контролируем выполнение.",
  },
  {
    title: "Контроль состояния",
    text: "Проводим осмотры, фиксируем состояние и информируем собственника.",
  },
];

const STEPS = [
  {
    title: "Знакомимся с объектом",
    text: "Уточняем тип недвижимости, локацию, состояние, комплектацию и задачи собственника.",
  },
  {
    title: "Оцениваем формат",
    text: "Определяем подходящий срок аренды, рыночную ставку, требования к арендатору и возможные доработки.",
  },
  {
    title: "Согласуем условия",
    text: "Фиксируем обязанности, комиссию, порядок оплат, отчётность и дополнительные услуги по объекту.",
  },
  {
    title: "Готовим объект к запуску",
    text: "Организуем подготовку, фото, описание, размещение и обработку заявок.",
  },
  {
    title: "Заселяем арендатора",
    text: "Проводим показы, согласуем договор, платежи, депозит и передачу объекта.",
  },
  {
    title: "Сопровождаем аренду",
    text: "Контролируем оплаты, коммуникацию, бытовые и технические вопросы на протяжении срока аренды.",
  },
];

const TERMS = [
  {
    title: "Поиск арендатора",
    text: "Подбираем арендатора под объект и условия собственника: обрабатываем заявки, проводим показы, согласуем условия, готовим договор и сопровождаем заселение.",
    price: "",
  },
  {
    title: "Управление",
    text: "Берём на себя текущую коммуникацию с арендатором, контроль оплат, организационные вопросы, бытовые заявки и сопровождение аренды на протяжении всего срока.",
    price: "от 10% ежемесячно",
  },
  {
    title: "Обслуживание",
    text: "Организуем клининг, мелкий ремонт, обслуживание территории, бассейна, инженерных систем и другие задачи по согласованному перечню.",
    price: "индивидуально",
  },
];

function ManagementPage() {
  return (
    <div className="font-site">
      <section className="relative flex min-h-[75vh] items-center overflow-hidden bg-site-navy">
        <img
          src={heroImg}
          alt="Управление недвижимостью в Сочи"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-site-navy/90 via-site-navy/60 to-site-navy/25" />
        <div className="relative mx-auto w-full max-w-[1280px] px-5 py-20 md:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
            · Поиск арендаторов · Контроль оплат · Обслуживание · Страхование
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.1] text-white md:text-6xl">
            Сервис управления жилой недвижимостью
          </h1>
          <p className="mt-6 max-w-2xl leading-relaxed text-white/80">
            Помогаем сдавать квартиры, апартаменты, дома и виллы в среднесрочную
            и долгосрочную аренду. Берём на себя поиск арендаторов, показы,
            договор, контроль оплат и сопровождение объекта.
          </p>
          <a
            href="#lead"
            className="mt-9 inline-flex items-center rounded-md bg-site-gold px-7 py-3.5 text-sm font-semibold text-site-navy transition-colors hover:bg-site-gold/85"
          >
            Свяжитесь с нами
          </a>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
            С какими объектами работаем
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-site-muted">
            Управляем квартирами, апартаментами, домами и виллами в Сочи — с
            учётом особенностей каждого объекта.
          </p>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {OBJECT_TYPES.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-site-line bg-white p-7"
              >
                <p className="text-xl font-semibold text-site-navy">{item.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-site-muted">
                  {item.text}
                </p>
                <ul className="mt-5 flex flex-col gap-2 text-sm text-site-navy">
                  {item.points.map((p) => (
                    <li key={p} className="flex items-center gap-3">
                      <span className="h-px w-6 bg-site-gold" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-site-navy-soft py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
            Что входит в наши услуги?
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-site-muted">
            Берём на себя общение с арендаторами, бытовые и технические вопросы,
            контроль оплат и организацию обслуживания.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <div className="rounded-xl border border-site-line bg-white p-6 text-sm leading-relaxed text-site-muted">
              Проверяем готовность объекта к аренде, фиксируем состояние,
              комплектацию и запускаем объект в работу.
            </div>
            <div className="rounded-xl border border-site-line bg-white p-6 text-sm leading-relaxed text-site-muted">
              Контролируем арендные платежи, коммунальные расходы и
              задолженности, чтобы собственнику не приходилось отслеживать это
              самостоятельно.
            </div>
            <div className="rounded-xl border border-site-line bg-white p-6 text-sm leading-relaxed text-site-muted">
              Все текущие вопросы проходят через нас: бытовые просьбы,
              организационные моменты, технические заявки, клининг и мелкое
              обслуживание.
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
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
                Дополнительное обслуживание домов и вилл
              </h2>
              <p className="mt-4 leading-relaxed text-site-muted">
                Частный дом требует регулярного внимания: территория, бассейн,
                инженерия, клининг и мелкие технические вопросы. Мы организуем
                эти процессы по согласованному перечню задач.
              </p>
            </div>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {EXTRA.map((item) => (
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
          <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
            Как проходит передача объекта в управление?
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-site-muted">
            Сначала разбираем объект и задачи собственника, затем согласуем
            условия, запускаем аренду и берём объект на сопровождение.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <h2 className="text-3xl font-bold text-site-navy md:text-4xl">
            Условия сотрудничества
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-site-muted">
            Формат работы зависит от типа объекта, срока аренды и задачи
            собственника: от поиска арендатора до полного сопровождения аренды и
            обслуживания недвижимости.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {TERMS.map((item) => (
              <div
                key={item.title}
                className="flex flex-col rounded-2xl border border-site-line bg-white p-7"
              >
                <p className="text-xl font-semibold text-site-navy">{item.title}</p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-site-muted">
                  {item.text}
                </p>
                <p className="mt-5 text-sm font-semibold text-site-gold">
                  {item.price || "\u00A0"}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-3xl leading-relaxed text-site-muted">
            Перед запуском мы оцениваем состояние объекта, локацию, комплектацию
            и его арендный потенциал. Если объект требует подготовки, предложим
            доработки, которые помогут повысить ликвидность и качество аренды.
          </p>
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
              Узнайте, как может работать ваш объект
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-white/75">
              Приедем на объект, оценим состояние, локацию и арендный потенциал.
              Покажем, какой формат подойдёт лучше: среднесрочная аренда, долгий
              срок, управление или комплексное обслуживание
            </p>
            <p className="mt-4 text-sm text-site-gold">
              Консультация и оценка объекта — бесплатно.
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
              Заявка на доверительное управление недвижимостью
            </p>
            <p className="mt-1 text-sm text-site-muted">
              Заполните форму и мы свяжемся с вами для дальнейшего
              сотрудничества.
            </p>
            <div className="mt-4">
              <SiteLeadForm
                source="management"
                defaultTopic="Собственникам"
                buttonLabel="Начать сотрудничество"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
