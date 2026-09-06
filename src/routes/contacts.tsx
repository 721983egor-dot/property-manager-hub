import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, MessageCircle, Phone, Send } from "lucide-react";

import { SiteLeadForm } from "@/components/site/SiteLeadForm";
import {
  SITE_ADDRESS,
  SITE_EMAIL,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_TEL,
  SITE_TELEGRAM,
  SITE_WHATSAPP,
} from "@/lib/site";

export const Route = createFileRoute("/contacts")({
  head: () => ({
    meta: [
      { title: "Контакты — Резиденция & Море" },
      {
        name: "description",
        content:
          "Контакты агентства «Резиденция & Море» в Сочи: телефон +7 938 500-00-24, Telegram, WhatsApp, офис в БЦ «Войковый», ул. Войкова 1/1.",
      },
      { property: "og:title", content: "Контакты — Резиденция & Море" },
      {
        property: "og:description",
        content: "Свяжитесь с нами: телефон, мессенджеры, офис в Сочи.",
      },
      { property: "og:url", content: "/contacts" },
    ],
    links: [{ rel: "canonical", href: "/contacts" }],
  }),
  component: ContactsPage,
});

function ContactsPage() {
  return (
    <div className="font-site">
      <section className="bg-site-navy py-16">
        <div className="mx-auto max-w-[1280px] px-5 md:px-6">
          <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-site-gold">
            <span className="h-px w-10 bg-site-gold" />
            Контакты
          </p>
          <h1 className="mt-4 text-4xl font-bold text-white md:text-5xl">
            Свяжитесь с нами
          </h1>
          <p className="mt-4 max-w-xl leading-relaxed text-white/75">
            Ответим на вопросы по аренде, управлению и сотрудничеству.
            Работаем ежедневно.
          </p>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-5 md:px-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <a
              href={SITE_PHONE_TEL}
              className="flex items-center gap-4 rounded-xl border border-site-line p-5 transition-colors hover:border-site-gold"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-site-gold-soft">
                <Phone className="size-5 text-site-gold" />
              </span>
              <span>
                <span className="block text-xs text-site-muted">Телефон</span>
                <span className="block text-lg font-bold text-site-navy">
                  {SITE_PHONE_DISPLAY}
                </span>
              </span>
            </a>
            <a
              href={SITE_TELEGRAM}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-4 rounded-xl border border-site-line p-5 transition-colors hover:border-site-gold"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-site-gold-soft">
                <Send className="size-5 text-site-gold" />
              </span>
              <span>
                <span className="block text-xs text-site-muted">Telegram</span>
                <span className="block text-lg font-bold text-site-navy">@ResidenceMore</span>
              </span>
            </a>
            <a
              href={SITE_WHATSAPP}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-4 rounded-xl border border-site-line p-5 transition-colors hover:border-site-gold"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-site-gold-soft">
                <MessageCircle className="size-5 text-site-gold" />
              </span>
              <span>
                <span className="block text-xs text-site-muted">WhatsApp</span>
                <span className="block text-lg font-bold text-site-navy">Написать в WhatsApp</span>
              </span>
            </a>
            <a
              href={`mailto:${SITE_EMAIL}`}
              className="flex items-center gap-4 rounded-xl border border-site-line p-5 transition-colors hover:border-site-gold"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-site-gold-soft">
                <Mail className="size-5 text-site-gold" />
              </span>
              <span>
                <span className="block text-xs text-site-muted">Почта</span>
                <span className="block text-lg font-bold text-site-navy">{SITE_EMAIL}</span>
              </span>
            </a>
            <div className="flex items-center gap-4 rounded-xl border border-site-line p-5">
              <span className="flex size-11 items-center justify-center rounded-full bg-site-gold-soft">
                <MapPin className="size-5 text-site-gold" />
              </span>
              <span>
                <span className="block text-xs text-site-muted">Офис</span>
                <span className="block text-base font-semibold text-site-navy">{SITE_ADDRESS}</span>
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-site-line bg-white p-6 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.3)] md:p-8">
            <p className="text-xl font-bold text-site-navy">Оставить заявку</p>
            <p className="mt-1 text-sm text-site-muted">
              Перезвоним в ближайшее рабочее время.
            </p>
            <div className="mt-5">
              <SiteLeadForm source="contacts" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
