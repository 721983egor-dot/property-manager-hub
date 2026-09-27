import {
  SITE_MAX_GROUP,
  SITE_TELEGRAM_GROUP,
  SITE_VK,
} from "@/lib/site";

type Variant = "footer" | "contacts" | "header" | "headerMobile";

type Props = {
  /**
   * footer — светлые иконки на navy;
   * contacts — на белом с подписями;
   * header — desktop top bar с лейблом «Соцсети»;
   * headerMobile — только значки в основной строке шапки (без текста).
   */
  variant?: Variant;
  className?: string;
};

const iconClass = "size-[18px]";

/** Официальный силуэт ВКонтакте (Simple Icons). */
function VkIcon({ className = iconClass }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="m9.489.004.729-.003h3.564l.73.003.914.01.433.007.418.011.403.014.388.016.374.021.36.025.345.03.333.033c1.74.196 2.933.616 3.833 1.516.9.9 1.32 2.092 1.516 3.833l.034.333.029.346.025.36.02.373.025.588.012.41.013.644.009.915.004.98-.001 3.313-.003.73-.01.914-.007.433-.011.418-.014.403-.016.388-.021.374-.025.36-.03.345-.033.333c-.196 1.74-.616 2.933-1.516 3.833-.9.9-2.092 1.32-3.833 1.516l-.333.034-.346.029-.36.025-.373.02-.588.025-.41.012-.644.013-.915.009-.98.004-3.313-.001-.73-.003-.914-.01-.433-.007-.418-.011-.403-.014-.388-.016-.374-.021-.36-.025-.345-.03-.333-.033c-1.74-.196-2.933-.616-3.833-1.516-.9-.9-1.32-2.092-1.516-3.833l-.034-.333-.029-.346-.025-.36-.02-.373-.025-.588-.012-.41-.013-.644-.009-.915-.004-.98.001-3.313.003-.73.01-.914.007-.433.011-.418.014-.403.016-.388.021-.374.025-.36.03-.345.033-.333c.196-1.74.616-2.933 1.516-3.833.9-.9 2.092-1.32 3.833-1.516l.333-.034.346-.029.36-.025.373-.02.588-.025.41-.012.644-.013.915-.009ZM6.79 7.3H4.05c.13 6.24 3.25 9.99 8.72 9.99h.31v-3.57c2.01.2 3.53 1.67 4.14 3.57h2.84c-.78-2.84-2.83-4.41-4.11-5.01 1.28-.74 3.08-2.54 3.51-4.98h-2.58c-.56 1.98-2.22 3.78-3.8 3.95V7.3H10.5v6.92c-1.6-.4-3.62-2.34-3.71-6.92Z" />
    </svg>
  );
}

/** Официальный силуэт Telegram (Simple Icons). */
function TelegramIcon({ className = iconClass }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

/**
 * Силуэт иконки приложения Max (мессенджер).
 * Монохромный знак из публичных материалов бренда.
 */
function MaxIcon({ className = iconClass }: { className?: string }) {
  return (
    <svg viewBox="0 0 720 720" fill="currentColor" className={className} aria-hidden>
      <path d="M350.4,9.6C141.8,20.5,4.1,184.1,12.8,390.4c3.8,90.3,40.1,168,48.7,253.7,2.2,22.2-4.2,49.6,21.4,59.3,31.5,11.9,79.8-8.1,106.2-26.4,9-6.1,17.6-13.2,24.2-22,27.3,18.1,53.2,35.6,85.7,43.4,143.1,34.3,299.9-44.2,369.6-170.3C799.6,291.2,622.5-4.6,350.4,9.6h0ZM269.4,504c-11.3,8.8-22.2,20.8-34.7,27.7-18.1,9.7-23.7-.4-30.5-16.4-21.4-50.9-24-137.6-11.5-190.9,16.8-72.5,72.9-136.3,150-143.1,78-6.9,150.4,32.7,183.1,104.2,72.4,159.1-112.9,316.2-256.4,218.6h0Z" />
    </svg>
  );
}

const LINKS = [
  { href: SITE_VK, label: "ВКонтакте", Icon: VkIcon },
  { href: SITE_TELEGRAM_GROUP, label: "Telegram", Icon: TelegramIcon },
  { href: SITE_MAX_GROUP, label: "Max", Icon: MaxIcon },
] as const;

/** Иконки соцсетей: ВК, Telegram-группа, Max-группа. */
export function SiteSocialLinks({ variant = "footer", className = "" }: Props) {
  const isFooter = variant === "footer";
  const isHeader = variant === "header" || variant === "headerMobile";
  const showHeaderLabel = variant === "header";
  const showLabels = variant === "contacts";
  const linkClass = isFooter
    ? "flex size-9 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors hover:border-site-gold hover:text-site-gold"
    : isHeader
      ? "flex size-7 items-center justify-center rounded-full border border-site-line text-site-muted transition-colors hover:border-site-gold hover:text-site-gold"
      : "inline-flex items-center gap-2 rounded-md border border-site-line px-4 py-2 text-sm font-medium text-site-navy transition-colors hover:border-site-gold hover:text-site-gold";
  const disabledClass = isFooter
    ? "flex size-9 cursor-not-allowed items-center justify-center rounded-full border border-white/10 text-white/35"
    : isHeader
      ? "flex size-7 cursor-not-allowed items-center justify-center rounded-full border border-site-line/60 text-site-muted/40"
      : "inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-site-line/60 px-4 py-2 text-sm font-medium text-site-muted/60";
  // Header / headerMobile: glyph почти на весь круг (size-7), небольшой зазор для клика.
  const iconSize = isHeader ? "size-[90%]" : iconClass;

  return (
    <div
      className={
        isHeader
          ? `flex items-center gap-2.5 ${className}`.trim()
          : className
      }
    >
      {isFooter ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-site-gold">
          Соцсети
        </p>
      ) : showHeaderLabel ? (
        <span className="shrink-0 text-xs text-site-muted">Соцсети</span>
      ) : showLabels ? (
        <p className="text-xs text-site-muted">Мы в соцсетях</p>
      ) : null}
      <div
        className={`flex flex-wrap ${isFooter ? "gap-3" : isHeader ? "gap-1.5 sm:gap-2" : "mt-3 gap-3"}`}
      >
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
              <Icon className={iconSize} />
              {showLabels ? <span>{label}</span> : null}
            </a>
          ) : (
            <span
              key={label}
              aria-label={`${label} — ссылка скоро`}
              title={`${label}: ссылка появится позже`}
              className={disabledClass}
            >
              <Icon className={iconSize} />
              {showLabels ? <span>{label}</span> : null}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
