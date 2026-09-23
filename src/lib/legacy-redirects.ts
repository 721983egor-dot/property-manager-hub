/**
 * Старые публичные пути Tilda → slug посадочной /rent/jk/$slug.
 * Нужны 301, чтобы Яндекс не держал «мёртвые» URL из индекса.
 *
 * На Tilda комплексы были вида /rent/lazurbereg1 (без /jk/).
 * Сейчас: /rent/jk/lazurnyj-bereg-1.
 */
const LEGACY_COMPLEX_SLUGS: Record<string, string> = {
  lazurbereg1: "lazurnyj-bereg-1",
  lazurbereg2: "lazurnyj-bereg-2",
};

/** Если сегмент после /rent/ — старый алиас комплекса, вернуть канонический slug ЖК. */
export function legacyRentComplexSlug(segment: string): string | null {
  const key = segment.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!key || key.includes("/")) return null;
  return LEGACY_COMPLEX_SLUGS[key] ?? null;
}
