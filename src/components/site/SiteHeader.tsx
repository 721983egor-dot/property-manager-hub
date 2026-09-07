import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Phone, X } from "lucide-react";

import {
  SITE_ADDRESS_SHORT,
  SITE_HOURS_HEADER,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_TEL,
} from "@/lib/site";
import { ContactMenu } from "@/components/site/ContactMenu";
import logo from "@/assets/site/logo_navy.png";

const NAV = [
  { to: "/rent", label: "Объекты" },
  { to: "/about", label: "О нас" },
  { to: "/management", label: "Собственникам" },
] as const;

/** Шапка публичного сайта. */
export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 font-site shadow-[0_1px_0_0_var(--color-site-line)] backdrop-blur">
      {/* Верхняя контактная строка */}
      <div className="hidden border-b border-site-line lg:block">
        <div className="mx-auto flex h-9 max-w-[1280px] items-center justify-between px-6 text-xs text-site-muted">
          <p>{SITE_ADDRESS_SHORT}</p>
          <div className="flex items-center gap-4">
            <p>{SITE_HOURS_HEADER}</p>
            <a
              href={SITE_PHONE_TEL}
              className="flex items-center gap-1.5 font-medium text-site-navy hover:text-site-gold"
            >
              <Phone className="size-3.5" />
              {SITE_PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </div>

      {/* Основная строка */}
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-5 md:px-6">
        <Link to="/" className="flex shrink-0 items-center" aria-label="Резиденция&Море">
          <img src={logo} alt="Резиденция&Море" className="h-9 w-auto" />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={
                "text-[15px] font-medium tracking-wide transition-colors " +
                (isActive(item.to)
                  ? "text-site-gold"
                  : "text-site-navy hover:text-site-gold")
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={SITE_PHONE_TEL}
            className="hidden text-sm font-semibold text-site-navy hover:text-site-gold md:block lg:hidden xl:block"
          >
            {SITE_PHONE_DISPLAY}
          </a>
          <button
            onClick={() => setLeadOpen(true)}
            className="hidden rounded-md bg-site-gold px-4 py-2 text-[13px] font-semibold text-site-navy transition-colors hover:bg-site-gold/85 sm:block"
          >
            Связаться с нами
          </button>
          <button
            className="rounded-md p-2 text-site-navy lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Меню"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Мобильное меню */}
      {menuOpen && (
        <nav className="border-t border-site-line bg-white px-5 py-4 lg:hidden">
          <div className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={
                  "rounded-md px-3 py-2.5 text-sm font-medium " +
                  (isActive(item.to)
                    ? "bg-site-gold-soft text-site-navy"
                    : "text-site-navy hover:bg-site-navy-soft")
                }
              >
                {item.label}
              </Link>
            ))}
            <button
              onClick={() => {
                setMenuOpen(false);
                setLeadOpen(true);
              }}
              className="mt-2 rounded-md bg-site-gold px-4 py-2.5 text-sm font-semibold text-site-navy"
            >
              Связаться с нами
            </button>
          </div>
        </nav>
      )}

      <Dialog open={leadOpen} onOpenChange={setLeadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-site text-site-navy">
              Связаться c нами
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-site-muted">
            Заполните форму и мы свяжемся с вами в ближайшее время
          </p>
          <SiteLeadForm source="site-header" buttonLabel="Заказать звонок" />
        </DialogContent>
      </Dialog>
    </header>
  );
}
