import { Link } from "@tanstack/react-router";
import { MapPin, Phone, Send, MessageCircle } from "lucide-react";

import {
  SITE_ADDRESS,
  SITE_HOURS_HEADER,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_TEL,
  SITE_REQUISITES,
  SITE_TELEGRAM,
  SITE_VK,
  SITE_WHATSAPP,
} from "@/lib/site";
import logo from "@/assets/site/logo.png";

const SECTIONS = [
  { to: "/", label: "Главная" },
  { to: "/rent", label: "Долгосрочная аренда" },
  { to: "/management", label: "Собственникам" },
  { to: "/about", label: "О нас" },
] as const;

/** Подвал публичного сайта. */
export function SiteFooter() {
  return (
    <footer className="bg-site-navy font-site text-site-navy-foreground">
      <div className="mx-auto max-w-[1280px] px-5 py-14 md:px-6">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <img src={logo} alt="Резиденция&Море" className="h-10 w-auto" />
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
              <a
                href={SITE_VK}
                target="_blank"
                rel="noreferrer"
                aria-label="ВКонтакте"
                className="flex size-9 items-center justify-center rounded-full border border-white/20 text-xs font-semibold text-white/80 transition-colors hover:border-site-gold hover:text-site-gold"
              >
                VK
              </a>
            </div>
          </div>

          <div>
            <nav className="flex flex-col gap-2.5">
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
              Остались вопросы?
            </p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-white/75">
              <p>Готовы помочь в любое время</p>
              <a
                href={SITE_PHONE_TEL}
                className="flex items-center gap-2.5 font-semibold text-white hover:text-site-gold"
              >
                <Phone className="size-4 text-site-gold" />
                {SITE_PHONE_DISPLAY}
              </a>
              <p className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-site-gold" />
                {SITE_ADDRESS}
              </p>
              <p>{SITE_HOURS_HEADER}</p>
            </div>
          </div>

          <div>
            <div className="flex flex-col gap-2.5 text-sm text-white/75">
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
          © {new Date().getFullYear()} Все права защищены
        </div>
      </div>
    </footer>
  );
}
