import { Link } from "@tanstack/react-router";
import { Mail, MapPin, Phone, Send, MessageCircle } from "lucide-react";

import {
  SITE_ADDRESS,
  SITE_EMAIL,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_TEL,
  SITE_REQUISITES,
  SITE_TELEGRAM,
  SITE_WHATSAPP,
} from "@/lib/site";
import logo from "@/assets/site/logo.png";

const SECTIONS = [
  { to: "/", label: "Главная" },
  { to: "/rent", label: "Объекты" },
  { to: "/about", label: "О компании" },
  { to: "/management", label: "Управление недвижимостью" },
  { to: "/contacts", label: "Контакты" },
] as const;

/** Подвал публичного сайта. */
export function SiteFooter() {
  return (
    <footer className="bg-site-navy font-site text-site-navy-foreground">
      <div className="mx-auto max-w-[1280px] px-5 py-14 md:px-6">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <img src={logo} alt="Резиденция & Море" className="h-10 w-auto" />
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Агентство недвижимости в Сочи. Долгосрочная аренда, управление
              объектами и персональный подбор жилья.
            </p>
            <div className="mt-5 flex gap-3">
              <a
                href={SITE_TELEGRAM}
                target="_blank"
                rel="noreferrer"
                aria-label="Telegram"
                className="flex size-9 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors hover:border-site-gold hover:text-site-gold"
              >
                <Send className="size-4" />
              </a>
              <a
                href={SITE_WHATSAPP}
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp"
                className="flex size-9 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors hover:border-site-gold hover:text-site-gold"
              >
                <MessageCircle className="size-4" />
              </a>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-site-gold">
              Разделы
            </p>
            <nav className="mt-4 flex flex-col gap-2.5">
              {SECTIONS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="text-sm text-white/75 transition-colors hover:text-site-gold"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-site-gold">
              Контакты
            </p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-white/75">
              <a
                href={SITE_PHONE_TEL}
                className="flex items-center gap-2.5 font-semibold text-white hover:text-site-gold"
              >
                <Phone className="size-4 text-site-gold" />
                {SITE_PHONE_DISPLAY}
              </a>
              <a
                href={`mailto:${SITE_EMAIL}`}
                className="flex items-center gap-2.5 hover:text-site-gold"
              >
                <Mail className="size-4 text-site-gold" />
                {SITE_EMAIL}
              </a>
              <p className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-site-gold" />
                {SITE_ADDRESS}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-site-gold">
              Информация
            </p>
            <div className="mt-4 flex flex-col gap-2.5 text-sm text-white/75">
              <Link to="/privacy" className="transition-colors hover:text-site-gold">
                Политика конфиденциальности
              </Link>
              <p className="text-xs leading-relaxed text-white/50">
                {SITE_REQUISITES}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-xs text-white/50">
          © {new Date().getFullYear()} Резиденция & Море. Все права защищены.
        </div>
      </div>
    </footer>
  );
}
