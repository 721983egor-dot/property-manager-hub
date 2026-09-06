import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { SITE_PHONE_DISPLAY, SITE_PHONE_TEL } from "@/lib/site";
import aboutHero from "@/assets/site/about_hero.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "О компании — Резиденция & Море" },
      {
        name: "description",
        content:
          "Резиденция & Море — агентство недвижимости в Сочи. Долгосрочная аренда и управление объектами: прозрачность, ответственность и сопровождение на всём сроке аренды.",
      },
      { property: "og:title", content: "О компании — Резиденция & Море" },
      {
        property: "og:description",
        content: "Агентство недвижимости в Сочи: аренда и управление объектами.",
      },
      { property: "og:url", content: "/about" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
  component: AboutPage,
});

const STATS = [
  { value: "500+", label: "объектов в управлении" },
  { value: "98%", label: "довольных собственников" },
  { value: "7+", label: "лет опыта" },
];

const PRINCIPLES = [
  {
    title: "Прозрачность",
    text: "Собственник понимает, что происходит с объектом: какие платежи поступают, какие задачи решаются и какие вопросы возникают в процессе аренды.",
  },
  {
    title: "Ответственность",
    text: "Мы не исчезаем после заселения арендатора, а сопровождаем объект на протяжении срока аренды и остаёмся точкой контакта по текущим вопросам.",
  },
  {
    title: "Качество объектов",
    text: "Мы работаем с недвижимостью, которую можно достойно представить рынку и качественно сопровождать: квартирами, апартаментами, домами и виллами в хорошем состоянии.",
  },
  {
    title: "Спокойствие собственника",
    text: "Наша цель — чтобы собственник получал доход от объекта без ежедневного участия в операционных вопросах аренды и обслуживания.",
  },
];

function AboutPage() {
  return (
    <div className="font-site">
      <section className="relative flex min-h-[52vh] items-center overflow-hidden bg-site-navy">
        <img
          src={aboutHero}
          alt="Вилла на побережье Сочи"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-site-navy/90 via-site-navy/60 to-site-navy/25" />
        <div className="relative mx-auto w-full max-w-[1280px] px-5 py-20 md:px-6">
          <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
            <span className="h-px w-10 bg-site-gold" />
            О нас
          </p>
          <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-tight text-white md:text-5xl">
            О компании
          </h1>
          <p className="mt-5 max-w-xl leading-relaxed text-white/80">
            «Резиденция & Море» — агентство недвижимости в Сочи. Помогаем
            арендаторам находить жильё у моря, а собственникам — получать доход
            от объектов без операционных забот.
          </p>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <div className="grid gap-8 sm:grid-cols-3">
            {STATS.map((s) => (
              <div key={s.label} className="border-l-2 border-site-gold pl-5">
                <p className="text-4xl font-bold text-site-navy">{s.value}</p>
                <p className="mt-1 text-sm text-site-muted">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-site-navy-soft py-20">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
            <span className="h-px w-10 bg-site-gold" />
            Принципы
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-bold text-site-navy md:text-4xl">
            Наши принципы работы
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-site-muted">
            Мы строим управление недвижимостью так, чтобы собственник понимал,
            что происходит с объектом, а арендатор получал нормальное
            сопровождение на протяжении срока проживания.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <div
                key={p.title}
                className="rounded-xl border border-site-line bg-white p-7 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.25)]"
              >
                <span className="text-3xl font-bold text-site-gold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="mt-3 text-lg font-semibold text-site-navy">{p.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-site-muted">{p.text}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-12 max-w-2xl text-center text-sm leading-relaxed text-site-muted">
            Мы берём в работу не просто объект, а ответственность за его
            аренду, состояние и коммуникацию между сторонами.
          </p>
        </div>
      </section>

      <section className="bg-site-navy py-16">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-6 px-5 md:px-6">
          <div>
            <h2 className="text-2xl font-bold text-white md:text-3xl">
              Хотите сдать или снять недвижимость?
            </h2>
            <p className="mt-2 text-sm text-white/70">
              Позвоните нам — {SITE_PHONE_DISPLAY} — или оставьте заявку на сайте.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={SITE_PHONE_TEL}
              className="rounded-md border border-white/40 px-6 py-3 text-sm font-semibold text-white hover:border-site-gold hover:text-site-gold"
            >
              Позвонить
            </a>
            <Link
              to="/contacts"
              className="inline-flex items-center gap-2 rounded-md bg-site-gold px-6 py-3 text-sm font-semibold text-site-navy hover:bg-site-gold/85"
            >
              Оставить заявку
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
