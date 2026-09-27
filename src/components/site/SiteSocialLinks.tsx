import {
  SITE_MAX_GROUP,
  SITE_TELEGRAM_GROUP,
  SITE_VK,
} from "@/lib/site";

type Variant = "footer" | "contacts";

type Props = {
  /** footer — светлые иконки на navy; contacts — на белом. */
  variant?: Variant;
  className?: string;
};

const iconClass = "size-[18px]";

function VkIcon({ className = iconClass }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.78 17.5h-1.54s.1-2.1-.66-2.4c-.8-.3-1.84 2.1-3.2 2.1H5.9s-1.1-.06-.4-1.16c.06-.1 1.7-2.3 2.56-3.46.96-1.28.68-1.48.26-1.48h-1.5c-.52 0-1.12-.16-1.12-.9 0-.48.4-.84.9-.84h2.24c.42 0 .56-.28.56-.58 0-.56-.86-1.76-.86-2.38 0-.64.34-1.02 1.1-1.02h2.34c.58 0 .72.3.72.74v2.02c0 .42.18.56.3.56.14 0 .26-.08.52-.34.8-.86 1.36-2.2 1.36-2.2.14-.28.4-.56 1.16-.56h1.66s.5.06.36.54c-.14.54-1.66 2.66-1.66 2.66-.14.22-.18.32 0 .54.14.2.48.48.74.76.5.52 1.02 1.14 1.14 1.5.16.5-.18.76-.66.76h-1.58c-.48 0-.64.28-.64.54 0 .54.84 1.68 1.86 2.84 1.1 1.24 2.04 1.84 2.28 2.16.34.44-.06.92-.52.92h-1.82c-.74 0-.96-.32-1.64-1.1-.56-.64-1.02-1.34-1.38-1.34-.28 0-.34.2-.34.54v1.3c0 .38-.14.6-.7.6z" />
    </svg>
  );
}

function TelegramIcon({ className = iconClass }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 6.87-1.55 7.32c-.12.53-.43.66-.87.41l-2.4-1.77-1.16 1.12c-.13.13-.24.24-.49.24l.17-2.43 4.43-4c.2-.17-.04-.27-.3-.1l-5.48 3.45-2.36-.74c-.51-.16-.52-.51.11-.76l9.22-3.55c.43-.16.8.1.66.81z" />
    </svg>
  );
}

function MaxIcon({ className = iconClass }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M4.5 6.2h2.4l2.1 6.6 2.1-6.6h2.4l-3.4 11.1H7.9L4.5 6.2zm11.2 0h2.2v8.4h3.6v1.9h-5.8V6.2z" />
    </svg>
  );
}

const LINKS = [
  { href: SITE_VK, label: "ВКонтакте", Icon: VkIcon },
  { href: SITE_TELEGRAM_GROUP, label: "Telegram-группа", Icon: TelegramIcon },
  { href: SITE_MAX_GROUP, label: "Макс-группа", Icon: MaxIcon },
] as const;

/** Иконки соцсетей: ВК, Telegram-группа, Макс-группа. */
export function SiteSocialLinks({ variant = "footer", className = "" }: Props) {
  const isFooter = variant === "footer";
  const linkClass = isFooter
    ? "flex size-9 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors hover:border-site-gold hover:text-site-gold"
    : "inline-flex items-center gap-2 rounded-md border border-site-line px-4 py-2 text-sm font-medium text-site-navy transition-colors hover:border-site-gold hover:text-site-gold";
  const disabledClass = isFooter
    ? "flex size-9 cursor-not-allowed items-center justify-center rounded-full border border-white/10 text-white/35"
    : "inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-site-line/60 px-4 py-2 text-sm font-medium text-site-muted/60";

  return (
    <div className={className}>
      {isFooter ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-site-gold">
          Соцсети
        </p>
      ) : (
        <p className="text-xs text-site-muted">Мы в соцсетях</p>
      )}
      <div className={`flex flex-wrap ${isFooter ? "gap-3" : "mt-3 gap-3"}`}>
        {LINKS.map(({ href, label, Icon }) =>
          href ? (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={label}
              title={label}
              className={linkClass}
            >
              <Icon />
              {!isFooter ? <span>{label.replace("-группа", "")}</span> : null}
            </a>
          ) : (
            <span
              key={label}
              aria-label={`${label} — ссылка скоро`}
              title={`${label}: ссылка появится позже`}
              className={disabledClass}
            >
              <Icon />
              {!isFooter ? <span>{label.replace("-группа", "")}</span> : null}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
