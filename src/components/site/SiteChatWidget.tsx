import { useEffect, useState } from "react";
import { MessageCircle, Phone, Send, X } from "lucide-react";

import {
  SITE_PHONE_DISPLAY,
  SITE_PHONE_TEL,
  SITE_TELEGRAM,
  SITE_WHATSAPP,
} from "@/lib/site";
import { SiteChatPanel } from "@/components/site/SiteChatPanel";
import { useSiteCart } from "@/lib/site-cart";

/** Плавающий чат: WhatsApp, Telegram, звонок и сообщение через форму. */
export function SiteChatWidget() {
  const [open, setOpen] = useState(false);
  const { count } = useSiteCart();
  const bottom = count > 0 ? "bottom-32" : "bottom-8";

  useEffect(() => {
    const openChat = () => setOpen(true);
    window.addEventListener("rm-open-chat", openChat);
    return () => window.removeEventListener("rm-open-chat", openChat);
  }, []);

  return (
    <div className={`fixed right-4 z-50 flex flex-col items-end gap-3 ${bottom} md:right-6`}>
      {open && (
          <div className="w-[min(92vw,340px)] overflow-hidden rounded-2xl border border-site-line bg-white shadow-2xl">
          <div className="bg-site-navy px-5 py-4 text-site-navy-foreground">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-site text-base font-semibold">Чем можем помочь?</p>
                <p className="mt-1 text-xs text-white/70">
                  Напишите нам — ответим в рабочее время
                </p>
              </div>
              <div className="flex items-center gap-1">
                <a
                  href={SITE_WHATSAPP}
                  target="_blank"
                  rel="noreferrer"
                  title="WhatsApp"
                  aria-label="Написать в WhatsApp"
                  className="flex size-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-site-gold"
                >
                  <MessageCircle className="size-5" />
                </a>
                <a
                  href={SITE_TELEGRAM}
                  target="_blank"
                  rel="noreferrer"
                  title="Telegram"
                  aria-label="Написать в Telegram"
                  className="flex size-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-site-gold"
                >
                  <Send className="size-5" />
                </a>
                <a
                  href={SITE_PHONE_TEL}
                  title="Позвонить"
                  aria-label={SITE_PHONE_DISPLAY}
                  className="flex size-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-site-gold"
                >
                  <Phone className="size-5" />
                </a>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-site-line pt-1">
            <p className="px-4 pt-2 text-xs font-semibold uppercase tracking-wider text-site-muted">
              Или напишите нам здесь
            </p>
            <SiteChatPanel />
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
