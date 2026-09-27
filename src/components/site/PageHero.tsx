import type { ReactNode } from "react";

type PageHeroProps = {
  /** Optional gold eyebrow above the title */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Primary CTA — link or button element */
  cta?: ReactNode;
  children?: ReactNode;
};

/**
 * Compact text-only hero for internal site landings.
 * Navy / gold gradient, no photo. Home and rent keep their own heroes.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  cta,
  children,
}: PageHeroProps) {
  return (
    <section className="relative overflow-hidden bg-site-navy">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,color-mix(in_oklch,var(--site-gold)_22%,transparent),transparent_55%),radial-gradient(ellipse_at_90%_80%,color-mix(in_oklch,var(--site-gold)_12%,transparent),transparent_50%),linear-gradient(135deg,var(--site-navy)_0%,oklch(0.28_0.05_255)_48%,oklch(0.22_0.04_250)_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-site-gold/50 to-transparent"
      />
      <div className="relative mx-auto w-full max-w-[1280px] px-5 py-12 md:px-6 md:py-14">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-site-gold">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={`${eyebrow ? "mt-3" : ""} max-w-xl text-2xl font-bold leading-snug text-white md:text-[2rem] md:leading-tight`}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/80 md:text-[15px]">
            {description}
          </p>
        ) : null}
        {cta ? <div className="mt-6">{cta}</div> : null}
        {children}
      </div>
    </section>
  );
}

export function PageHeroCta({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center rounded-md bg-site-gold px-5 py-2.5 text-sm font-semibold text-site-navy transition-colors hover:bg-site-gold/85"
    >
      {children}
    </a>
  );
}
