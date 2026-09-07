import { useState } from "react";
import { MessageCircle, Phone, Send, X } from "lucide-react";

import {
  SITE_PHONE_DISPLAY,
  SITE_PHONE_TEL,
  SITE_TELEGRAM,
  SITE_WHATSAPP,
} from "@/lib/site";
import { SiteLeadForm } from "@/components/site/SiteLeadForm";
import { useSiteCart } from "@/lib/site-cart";

/** Плавающий чат: WhatsApp, Telegram, звонок и сообщение через форму. */
export function SiteChatWidget() {
  const [open, setOpen] = useState(false);
  const { count } = useSiteCart();
  const bottom = count > 0 ? "bottom-24" : "bottom-5";

  return (
    <div className={`fixed right-4 z-50 flex flex-col items-end gap-3 ${bottom} md:right-6`}>
      {open && (
        <div className="w-[min(92vw,340px)] overflow-hidden rounded-2xl border border-site-line bg-white shadow-2xl">
          <div className="bg-site-navy px-5 py-4 text-site-navy-foreground">
            <p className="font-site text-base font-semibold">Чем можем помочь?</p>
            <p className="mt-1 text-xs text-white/70">
              Напишите нам удобным способом — ответим в рабочее время
            </p>
          </div>

          <div className="flex flex-col gap-2 px-4 pt-4">
            <a
              href={SITE_WHATSAPP}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border border-site-line px-3 py-2.5 text-sm font-medium text-site-navy transition-colors hover:border-site-gold hover:bg-site-gold-soft"
            >
              <MessageCircle className="size-4 text-site-gold" />
              Написать в WhatsApp
            </a>
            <a
              href={SITE_TELEGRAM}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border border-site-line px-3 py-2.5 text-sm font-medium text-site-navy transition-colors hover:border-site-gold hover:bg-site-gold-soft"
            >
              <Send className="size-4 text-site-gold" />
              Написать в Telegram
            </a>
            <a
              href={SITE_PHONE_TEL}
              className="flex items-center gap-3 rounded-xl border border-site-line px-3 py-2.5 text-sm font-medium text-site-navy transition-colors hover:border-site-gold hover:bg-site-gold-soft"
            >
              <Phone className="size-4 text-site-gold" />
              {SITE_PHONE_DISPLAY}
            </a>
          </div>

          <div className="px-4 pb-4 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-site-muted">
              Или оставьте сообщение
            </p>
            <SiteLeadForm source="site-chat" buttonLabel="Отправить сообщение" />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Закрыть чат" : "Открыть чат"}
        className="flex size-14 items-center justify-center rounded-full bg-site-gold text-site-navy shadow-xl transition-transform hover:scale-105"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>
    </div>
  );
}
