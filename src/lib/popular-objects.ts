import type { Property, PropertyType } from "@/lib/properties";
import { normalizeCatalogType } from "@/lib/rent-search";

/** Две корзины для баланса блока: квартиры / дома. */
export type PopularKind = "apartment" | "house";

export const POPULAR_HOME_LIMIT = 6;
/** Половина слотов — свежие, половина — по просмотрам. */
export const POPULAR_NEW_QUOTA = 3;
export const POPULAR_VIEWS_QUOTA = 3;
/** Минимум каждого вида, если в каталоге хватает объектов. */
export const POPULAR_MIN_PER_KIND = 2;

export function popularKind(type: PropertyType): PopularKind {
  const normalized = normalizeCatalogType(type);
  return normalized === "apartment" ? "apartment" : "house";
}

type PopularSource = Pick<Property, "id" | "type" | "created_at">;

function viewsOf(id: string, viewCounts: Record<string, number>) {
  return viewCounts[id] ?? 0;
}

function byNewest(a: PopularSource, b: PopularSource) {
  return b.created_at.localeCompare(a.created_at);
}

function byViewsThenNewest(
  a: PopularSource,
  b: PopularSource,
  viewCounts: Record<string, number>,
) {
  const diff = viewsOf(b.id, viewCounts) - viewsOf(a.id, viewCounts);
  if (diff !== 0) return diff;
  return byNewest(a, b);
}

function takeUnique<T extends PopularSource>(
  pool: T[],
  limit: number,
  used: Set<string>,
  kindFilter?: PopularKind,
): T[] {
  const out: T[] = [];
  for (const item of pool) {
    if (out.length >= limit) break;
    if (used.has(item.id)) continue;
    if (kindFilter && popularKind(item.type) !== kindFilter) continue;
    out.push(item);
  }
  return out;
}

/**
 * Смесь для блока «Популярные объекты» на главной:
 * 1) квота новых (по created_at),
 * 2) квота с наибольшим числом просмотров карточки на сайте,
 * 3) баланс квартир и домов (не один тип целиком), когда позволяет каталог.
 *
 * Детерминировано: без рандома, одинаковый вход → одинаковый выход.
 */
export function pickPopularProperties<T extends PopularSource>(
  properties: T[],
  viewCounts: Record<string, number> = {},
  options?: {
    limit?: number;
    newQuota?: number;
    viewsQuota?: number;
    minPerKind?: number;
  },
): T[] {
  const limit = options?.limit ?? POPULAR_HOME_LIMIT;
  if (limit <= 0 || properties.length === 0) return [];

  const newQuota = options?.newQuota ?? Math.min(POPULAR_NEW_QUOTA, Math.ceil(limit / 2));
  const viewsQuota = options?.viewsQuota ?? Math.min(POPULAR_VIEWS_QUOTA, limit - newQuota);
  const minPerKind = options?.minPerKind ?? Math.min(POPULAR_MIN_PER_KIND, Math.floor(limit / 2));

  const byNew = [...properties].sort(byNewest);
  const byViews = [...properties].sort((a, b) => byViewsThenNewest(a, b, viewCounts));

  const apartments = properties.filter((p) => popularKind(p.type) === "apartment");
  const houses = properties.filter((p) => popularKind(p.type) === "house");
  const hasBothKinds = apartments.length > 0 && houses.length > 0;

  const used = new Set<string>();
  const picked: T[] = [];

  const push = (items: T[]) => {
    for (const item of items) {
      if (picked.length >= limit) return;
      if (used.has(item.id)) continue;
      used.add(item.id);
      picked.push(item);
    }
  };

  // 1) Новые: при наличии обоих видов — по одному слоту каждого, остальное без фильтра.
  if (hasBothKinds && newQuota >= 2) {
    push(takeUnique(byNew, 1, used, "apartment"));
    push(takeUnique(byNew, 1, used, "house"));
    push(takeUnique(byNew, newQuota - 2, used));
  } else {
    push(takeUnique(byNew, newQuota, used));
  }

  // 2) По просмотрам: аналогичный баланс видов среди ещё не взятых.
  if (hasBothKinds && viewsQuota >= 2) {
    push(takeUnique(byViews, 1, used, "apartment"));
    push(takeUnique(byViews, 1, used, "house"));
    push(takeUnique(byViews, viewsQuota - 2, used));
  } else {
    push(takeUnique(byViews, viewsQuota, used));
  }

  // 3) Добор до лимита: сначала по просмотрам, потом по новизне.
  if (picked.length < limit) push(takeUnique(byViews, limit - picked.length, used));
  if (picked.length < limit) push(takeUnique(byNew, limit - picked.length, used));

  // 4) Финальный баланс: если одного вида меньше минимума — заменить хвост другого вида.
  if (hasBothKinds && minPerKind > 0) {
    rebalanceKinds(picked, byViews, byNew, used, minPerKind);
  }

  return picked.slice(0, limit);
}

function rebalanceKinds<T extends PopularSource>(
  picked: T[],
  byViews: T[],
  byNew: T[],
  used: Set<string>,
  minPerKind: number,
) {
  const countKind = (kind: PopularKind) =>
    picked.filter((p) => popularKind(p.type) === kind).length;

  const ensure = (kind: PopularKind) => {
    let missing = minPerKind - countKind(kind);
    if (missing <= 0) return;

    const replacements = [...byViews, ...byNew].filter(
      (p) => popularKind(p.type) === kind && !picked.some((x) => x.id === p.id),
    );

    for (const candidate of replacements) {
      if (missing <= 0) break;
      // Вытесняем объект противоположного вида с конца (слабее по приоритету микса).
      const victimIdx = [...picked]
        .map((p, i) => ({ p, i }))
        .reverse()
        .find(({ p }) => popularKind(p.type) !== kind)?.i;
      if (victimIdx == null) break;
      if (countKind(popularKind(picked[victimIdx].type)) <= minPerKind) break;

      const victim = picked[victimIdx];
      used.delete(victim.id);
      used.add(candidate.id);
      picked[victimIdx] = candidate;
      missing -= 1;
    }
  };

  ensure("apartment");
  ensure("house");
}
