import { Heart } from "lucide-react";

import { trackEvent } from "@/lib/analytics";
import { useSiteCart } from "@/lib/site-cart";

type Props = {
  propertyId: string;
  /**
   * overlay — круглая кнопка поверх фото карточки;
   * inline — полноразмерная кнопка с текстом рядом с «Связаться».
   */
  variant?: "overlay" | "inline";
};

/** Кнопка «В подборку» с сердечком. */
export function CartToggleButton({ propertyId, variant = "overlay" }: Props) {
  const { has, toggle } = useSiteCart();
  const active = has(propertyId);

  const handle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const added = toggle(propertyId);
    if (added) trackEvent(propertyId, "selection_add");
  };

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={handle}
        aria-pressed={active}
        title={active ? "Убрать из подборки" : "Добавить в мою подборку"}
        className={
          "flex h-14 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border px-5 text-[15px] font-semibold transition-colors " +
          (active
            ? "border-site-gold bg-site-gold/15 text-site-navy"
            : "border-site-line bg-white text-site-navy hover:border-site-gold/60")
        }
      >
        <Heart
          className={
            "size-5 transition-colors " +
            (active ? "fill-site-gold text-site-gold" : "text-site-muted")
          }
        />
        {active ? "В подборке" : "В подборку"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handle}
      aria-pressed={active}
      aria-label={active ? "Убрать из подборки" : "Добавить в подборку"}
      title={active ? "В подборке" : "В подборку"}
      className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-all hover:scale-105 hover:bg-white"
    >
      <Heart
        className={
          "size-5 transition-colors " +
          (active ? "fill-site-gold text-site-gold" : "text-site-navy/60")
        }
      />
    </button>
  );
}
