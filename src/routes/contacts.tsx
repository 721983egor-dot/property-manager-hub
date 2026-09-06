import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, MessageCircle, Phone, Send } from "lucide-react";

import { SiteLeadForm } from "@/components/site/SiteLeadForm";
import {
  SITE_ADDRESS,
  SITE_EMAIL,
  SITE_HOURS,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_TEL,
  SITE_TELEGRAM,
  SITE_VK,
  SITE_WHATSAPP,
} from "@/lib/site";

export const Route = createFileRoute("/contacts")({
  head: () => ({
    meta: [
      { title: "Контакты — Резиденция&Море" },
      {
        name: "description",
        content:
          "Остались вопросы? Вы можете связаться с нами напрямую по номеру телефона / почте, либо оставить заявку на звонок. г. Сочи ул. Московская, д. 22, офис 72.",
      },
      { property: "og:title", content: "Контакты — Резиденция&Море" },
      {
        property: "og:description",
        content:
          "Телефон +7 (938)-442-08-09, residence.more@yandex.ru, г. Сочи ул. Московская, д. 22, офис 72.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
          <h1 className="text-4xl font-bold text-white md:text-5xl">Контакты</h1>
          <p className="mt-4 max-w-xl leading-relaxed text-white/75">
            Остались вопросы? Вы можете связаться с нами напрямую по номеру
            телефона / почте, либо оставить заявку на звонок.
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
              href={`mailto:${SITE_EMAIL}`}
              className="flex items-center gap-4 rounded-xl border border-site-line p-5 transition-colors hover:border-site-gold"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-site-gold-soft">
                <Mail className="size-5 text-site-gold" />
              </span>
              <span>
                <span className="block text-xs text-site-muted">E-mail</span>
                <span className="block text-lg font-bold text-site-navy">
                  {SITE_EMAIL}
                </span>
              </span>
            </a>
            <div className="flex items-center gap-4 rounded-xl border border-site-line p-5">
              <span className="flex size-11 items-center justify-center rounded-full bg-site-gold-soft">
                <MapPin className="size-5 text-site-gold" />
              </span>
              <span>
                <span className="block text-xs text-site-muted">Адрес</span>
                <span className="block text-base font-semibold text-site-navy">
                  {SITE_ADDRESS}
                </span>
                <span className="block text-sm text-site-muted">{SITE_HOURS}</span>
              </span>
            </div>
            <div className="rounded-xl border border-site-line p-5">
              <p className="text-xs text-site-muted">Social media</p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <a
                  href={SITE_TELEGRAM}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-site-line px-4 py-2 font-medium text-site-navy hover:border-site-gold hover:text-site-gold"
                >
                  <Send className="size-4" /> Telegram
                </a>
                <a
                  href={SITE_WHATSAPP}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-site-line px-4 py-2 font-medium text-site-navy hover:border-site-gold hover:text-site-gold"
                >
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
                <a
                  href={SITE_VK}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-site-line px-4 py-2 font-medium text-site-navy hover:border-site-gold hover:text-site-gold"
                >
                  VK
                </a>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-site-line bg-white p-6 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.3)] md:p-8">
            <p className="text-xl font-bold text-site-navy">Остались вопросы?</p>
            <p className="mt-1 text-sm text-site-muted">
              Заполните форму и мы свяжемся с вами в ближайшее время
            </p>
            <div className="mt-5">
              <SiteLeadForm source="contacts" buttonLabel="Оставить заявку" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
