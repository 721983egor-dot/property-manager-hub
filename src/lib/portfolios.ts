/** RM OS — система управления компанией. Два отдельных проекта в одном месте. */
export type Portfolio = "rm" | "n11";

export const PORTFOLIOS: { value: Portfolio; label: string; short: string }[] = [
  { value: "n11", label: "H11 Резиденция", short: "H11" },
  { value: "rm", label: "Резиденция Море", short: "РМ" },
];

export function portfolioLabel(value: Portfolio | string | null | undefined) {
  return PORTFOLIOS.find((p) => p.value === value)?.label ?? value ?? "—";
}

export function portfolioShort(value: Portfolio | string | null | undefined) {
  return PORTFOLIOS.find((p) => p.value === value)?.short ?? value ?? "—";
}

export function asPortfolio(value: unknown): Portfolio {
  return value === "n11" ? "n11" : "rm";
}

export function asPortfolios(value: unknown): Portfolio[] {
  if (!Array.isArray(value)) return ["rm"];
  const next = value.filter((item): item is Portfolio => item === "rm" || item === "n11");
  return next.length > 0 ? next : ["rm"];
}

export function hasPortfolio(list: Portfolio[] | null | undefined, value: Portfolio) {
  return (list ?? []).includes(value);
}

/** Бренд на сайте и в UI: H11. В БД портфель по-прежнему `n11`. */
export const N11_ADDRESS = "Сочи, улица Навагинская, 11";
export const N11_SITE = "https://n11-residence.ru/";
export const N11_PHONE_DISPLAY = "+7 (938) 442-08-09";
export const N11_PHONE_TEL = "tel:+79384420809";
export const N11_TAGLINE = "Город. Море. Ваш ритм.";
export const N11_BNOVO_UID = "2be78d5a-bec7-44b5-983f-57bffa544a4d";
