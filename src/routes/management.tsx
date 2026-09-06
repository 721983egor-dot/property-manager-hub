import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { SiteLeadForm } from "@/components/site/SiteLeadForm";
import { SITE_PHONE_DISPLAY, SITE_PHONE_TEL } from "@/lib/site";
import mgmtHero from "@/assets/site/mgmt_p2.jpg";

export const Route = createFileRoute("/management")({
  head: () => ({
    meta: [
      { title: "Управление недвижимостью в Сочи — Резиденция & Море" },
      {
        name: "description",
        content:
          "Доверительное управление недвижимостью в Сочи: поиск и проверка арендаторов, фотосессия и размещение, сопровождение сделки и проживания. Доход от аренды без забот.",
      },
      { property: "og:title", content: "Управление недвижимостью в Сочи — Резиденция & Море" },
      {
        property: "og:description",
        content: "Доверьте нам свою недвижимость и получайте доход от аренды без забот.",
      },
      { property: "og:url", content: "/management" },
    ],
    links: [{ rel: "canonical", href: "/management" }],
  }),
  component: ManagementPage,
});

const INCLUDED = [
  "Поиск и проверка арендаторов",
  "Профессиональная фотосессия и размещение",
  "Сопровождение заселения и проживания",
  "Контроль платежей и состояния объекта",
  "Коммуникация с арендатором на всём сроке",
  "Отчётность для собственника",
];

const STEPS = [
  {
    title: "Оставьте заявку",
    text: "Мы изучим объект и расскажем, какой доход он может приносить.",
  },
  {
    title: "Подпишите договор",
    text: "Чиним, убираем, фотографируем и размещаем объект — вы ничего не делаете.",
  },
  {
    title: "Получайте доход",
    text: "Мы находим арендаторов и полностью обслуживаем объект.",
  },
];

function ManagementPage() {
  return (
    <div className="font-site">
      <section className="relative flex min-h-[56vh] items-center overflow-hidden bg-site-navy">
        <img
          src={mgmtHero}
          alt="Терраса объекта под управлением с видом на море"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-site-navy/90 via-site-navy/60 to-site-navy/25" />
        <div className="relative mx-auto w-full max-w-[1280px] px-5 py-20 md:px-6">
          <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
            <span className="h-px w-10 bg-site-gold" />
            Услуга для собственников
          </p>
          <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-tight text-white md:text-5xl">
            Управление вашей недвижимостью
          </h1>
          <p className="mt-5 max-w-xl leading-relaxed text-white/80">
            Вы владеете — мы управляем. Доверьте нам свою недвижимость и
            получайте доход от аренды без забот. Всё остальное — наша работа.
          </p>
          <a
            href="#lead"
            className="mt-8 inline-block rounded-md bg-site-gold px-7 py-3.5 text-sm font-semibold text-site-navy transition-colors hover:bg-site-gold/85"
          >
            Оставить заявку
          </a>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
            <span className="h-px w-10 bg-site-gold" />
            Что входит
          </p>
          <h2 className="mt-4 max-w-xl text-3xl font-bold text-site-navy md:text-4xl">
            Что мы берём на себя
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INCLUDED.map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-xl border border-site-line bg-white p-5"
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-site-gold-soft">
                  <Check className="size-4 text-site-gold" />
                </span>
                <p className="text-sm font-medium leading-relaxed text-site-navy">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-site-navy-soft py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
            <span className="h-px w-10 bg-site-gold" />
            Как начать
          </p>
          <h2 className="mt-4 text-3xl font-bold text-site-navy md:text-4xl">
            3 шага до дохода
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="rounded-xl border border-site-line bg-white p-7">
                <span className="text-3xl font-bold text-site-gold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="mt-3 text-lg font-semibold text-site-navy">{step.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-site-muted">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="lead" className="bg-site-navy py-20">
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-5 md:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              Доверьте объект профессионалам
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-white/75">
              Оставьте заявку, и мы свяжемся с вами в ближайшее время. Подскажем
              по доходности, подготовке объекта и условиям управления.
            </p>
            <a
              href={SITE_PHONE_TEL}
              className="mt-6 inline-block text-lg font-bold text-white hover:text-site-gold"
            >
              {SITE_PHONE_DISPLAY}
            </a>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-2xl md:p-8">
            <p className="text-lg font-semibold text-site-navy">Оставить заявку</p>
            <div className="mt-4">
              <SiteLeadForm source="management" defaultTopic="management" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
