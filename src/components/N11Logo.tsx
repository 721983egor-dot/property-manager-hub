import n11Logo from "@/assets/n11/logo.svg";
import n11LogoCompact from "@/assets/n11/logo-compact.svg";
import n11Mark from "@/assets/n11/mark.svg";
import { cn } from "@/lib/utils";

const SRC = {
  full: n11Logo,
  compact: n11LogoCompact,
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
      alt="Н11 Резиденция"
      className={cn("w-auto", className)}
    />
  );
}
