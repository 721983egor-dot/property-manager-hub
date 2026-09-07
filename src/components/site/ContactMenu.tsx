import { MessageCircle, Phone, Send } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SITE_PHONE_TEL,
  SITE_TELEGRAM,
  SITE_WHATSAPP,
} from "@/lib/site";

type Props = {
  children: React.ReactNode;
  /** Дополнительные классы для выпадающего контента. */
  contentClassName?: string;
  /** Вызывается при открытии/закрытии меню. */
  onOpenChange?: (open: boolean) => void;
};

/** Кнопка «Связаться» с выбором канала: чат, WhatsApp, Telegram, звонок. */
export function ContactMenu({ children, contentClassName, onOpenChange }: Props) {
  const openChat = () => {
    window.dispatchEvent(new CustomEvent("rm-open-chat"));
  };

  return (
    <DropdownMenu {...(onOpenChange ? { onOpenChange } : {})}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className={
          "w-56 rounded-xl border border-site-line bg-white p-1.5 shadow-xl " +
          contentClassName
        }
      >
        <DropdownMenuItem
          onClick={openChat}
          className="cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium text-site-navy focus:bg-site-navy-soft focus:text-site-navy"
        >
          <MessageCircle className="mr-2.5 size-4 text-site-gold" />
          Написать в чат
        </DropdownMenuItem>
        <DropdownMenuItem
          asChild
          className="cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium text-site-navy focus:bg-site-navy-soft focus:text-site-navy"
        >
          <a
            href={SITE_WHATSAPP}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <MessageCircle className="mr-2.5 size-4 text-site-green" />
            WhatsApp
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          asChild
          className="cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium text-site-navy focus:bg-site-navy-soft focus:text-site-navy"
        >
          <a
            href={SITE_TELEGRAM}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <Send className="mr-2.5 size-4 text-site-navy" />
            Telegram
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          asChild
          className="cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium text-site-navy focus:bg-site-navy-soft focus:text-site-navy"
        >
          <a href={SITE_PHONE_TEL} onClick={(e) => e.stopPropagation()}>
            <Phone className="mr-2.5 size-4 text-site-navy" />
            Позвонить
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
