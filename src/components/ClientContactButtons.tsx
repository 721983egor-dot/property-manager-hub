import { MessageCircle, Phone, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatPhone,
  hasCallablePhone,
  maxLink,
  phoneDigits,
  tgLink,
  waLink,
} from "@/lib/clients";

type Variant = "row" | "full";

type Props = {
  phone: string;
  variant?: Variant;
  /** Дополнительные классы контейнера. */
  className?: string;
  /** Вызывается при клике, чтобы не открывать карточку в списках. */
  onClick?: (e: React.MouseEvent) => void;
};

type LinkDef = {
  href: string;
  label: string;
  color: string;
  icon?: React.ComponentType<{ className?: string }>;
};

/** Кнопки связи с клиентом: позвонить, WhatsApp, Telegram, MAX. */
export function ClientContactButtons({ phone, variant = "full", className, onClick }: Props) {
  const digits = phoneDigits(phone);
  if (digits.length !== 11) return null;

  const formatted = formatPhone(phone);
  const links: LinkDef[] = [
    { href: waLink(phone), icon: MessageCircle, label: "WhatsApp", color: "text-site-green" },
    { href: tgLink(phone), icon: Send, label: "Telegram", color: "text-site-navy" },
    { href: maxLink(phone), label: "MAX", color: "text-site-navy" },
  ];

  const stopAndForward = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(e);
  };

  if (variant === "row") {
    return (
      <div className={cn("flex items-center gap-1", className)} onClick={onClick}>
        <a
          href={`tel:+${digits}`}
          title={`Позвонить ${formatted}`}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={stopAndForward}
        >
          <Phone className="size-4" />
        </a>
        {links.map(({ href, icon: Icon, label, color }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noreferrer"
            title={`${label} ${formatted}`}
            className={cn(
              "rounded-md p-1.5 transition-colors hover:bg-muted",
              color,
            )}
            onClick={stopAndForward}
          >
            {Icon ? (
              <Icon className="size-4" />
            ) : (
              <span className="block min-w-[1rem] text-center text-xs font-bold leading-4">M</span>
            )}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} onClick={onClick}>
      <Button
        variant="outline"
        size="sm"
        asChild
        className="gap-1.5"
        onClick={stopAndForward}
      >
        <a href={`tel:+${digits}`} title={`Позвонить ${formatted}`}>
          <Phone className="size-4" />
          Позвонить
        </a>
      </Button>
      {links.map(({ href, icon: Icon, label, color }) => (
        <Button
          key={label}
          variant="outline"
          size="sm"
          asChild
          className="gap-1.5"
          onClick={stopAndForward}
        >
          <a href={href} target="_blank" rel="noreferrer" title={`${label} ${formatted}`}>
            {Icon && <Icon className={cn("size-4", color)} />}
            {!Icon && <span className="size-4 text-center text-xs font-bold leading-4">M</span>}
            {label}
          </a>
        </Button>
      ))}
    </div>
  );
}

/** Кнопка копирования номера в буфер обмена. */
export function CopyPhoneButton({ phone, className }: { phone: string; className?: string }) {
  if (!hasCallablePhone(phone)) return null;
  const formatted = formatPhone(phone);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
    } catch {
      // Fallback
    }
  };
  return (
    <Button variant="ghost" size="sm" className={cn("h-auto px-2 py-1 text-xs", className)} onClick={copy}>
      Скопировать
    </Button>
  );
}
