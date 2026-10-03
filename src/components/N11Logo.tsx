import n11Logo from "@/assets/n11/logo.svg";
import n11LogoCompact from "@/assets/n11/logo-compact.svg";
import n11Mark from "@/assets/n11/mark.svg";
import h11BrandCompact from "@/assets/n11/h11-residence-logo-compact.png";
import { cn } from "@/lib/utils";

const SRC = {
  full: n11Logo,
  /** Старый SVG-компакт (H11 + Резиденция без вертикали). */
  compactSvg: n11LogoCompact,
  /** Новый бренд-марк H11 Резиденция (как на маркетинге) — компактный. */
  compact: h11BrandCompact,
  mark: n11Mark,
} as const;

export function N11Logo({
  variant = "compact",
  className,
}: {
  variant?: keyof typeof SRC;
  className?: string;
}) {
  return (
    <img
      src={SRC[variant]}
      alt="H11 Резиденция"
      className={cn("w-auto", className)}
    />
  );
}
