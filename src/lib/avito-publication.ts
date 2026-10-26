export const AVITO_PUBLICATION_STATUSES = [
  "active",
  "old",
  "removed",
  "blocked",
  "rejected",
] as const;
export type AvitoPublicationStatus = (typeof AVITO_PUBLICATION_STATUSES)[number];

/** Validate complete API pages before using them to change local publication flags. */
export async function loadAvitoStatusItems(
  status: AvitoPublicationStatus,
  fetchPage: (page: number) => Promise<unknown>,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 100; page += 1) {
    const payload = await fetchPage(page);
    const resources = (payload as { resources?: unknown } | null)?.resources;
    if (!Array.isArray(resources)) throw new Error("Авито вернул неполный список объявлений");
    for (const raw of resources) {
      const item = raw as Record<string, unknown> | null;
      const id = String(item?.id ?? "");
      if (!/^\d+$/.test(id) || item?.status !== status || seen.has(id)) {
        throw new Error("Авито вернул неоднозначные статусы объявлений");
      }
      seen.add(id);
      items.push(item);
    }
    if (resources.length < 100) return items;
  }
  throw new Error("Не удалось получить все страницы объявлений Авито");
}

export function avitoLinkKeys(row: { property_id: string; external_id: string }): string[] {
  // The feed's <Id> is the property UUID, even when external_id has not been assigned yet.
  return [...new Set([row.property_id, row.external_id.trim()].filter(Boolean))];
}

export function avitoConfirmedInactiveStatus(
  id: string,
  statuses: Map<string, Set<AvitoPublicationStatus>>,
  publishedAt?: string | null,
  now = Date.now(),
): AvitoPublicationStatus | null {
  // Let Avito process a deliberate (re)publication before treating the previous state as final.
  if (publishedAt && Date.parse(publishedAt) > now - 30 * 60_000) return null;
  const values = statuses.get(id);
  // Missing IDs and conflicting states can be a newly submitted ad or a changing API snapshot.
  if (!values || values.size !== 1 || values.has("active")) return null;
  const status = [...values][0];
  return AVITO_PUBLICATION_STATUSES.includes(status) ? status : null;
}
