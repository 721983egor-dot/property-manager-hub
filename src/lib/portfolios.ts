/** RM OS — система управления компанией. Два отдельных проекта в одном месте. */
export type Portfolio = "rm" | "n11";

export const PORTFOLIOS: { value: Portfolio; label: string; short: string }[] = [
  { value: "n11", label: "Н11 Резиденция", short: "Н11" },
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

export const N11_ADDRESS = "Сочи, улица Навагинская";
export const N11_SITE = "https://n11-residence.ru/";
