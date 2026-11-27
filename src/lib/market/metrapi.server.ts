import { setTimeout } from "node:timers/promises";
import {
  marketAddress,
  marketDate,
  type MarketGroup,
  type MarketHome,
  type MarketOffer,
  type PriceEvent,
} from "./model";
import { rentalMarketSyncCatalog, saveMarketSnapshot } from "./rental-market.server";

const sources: Record<string, string> = {
  avito: "Авито",
  cian: "Циан",
  yandex: "Яндекс",
  domclick: "Домклик",
  move: "Move.ru",
  yula: "Юла",
  sob: "Sob.ru",
  farpost: "FarPost",
};

function positive(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function date(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

type ApiRow = Record<string, unknown>;

function makeOffer(row: ApiRow): MarketOffer | null {
  const url = httpsUrl(row["url"]);
  const price = positive(row["price"]);
  if (url === null || price === null) return null;
  const photos = Array.isArray(row["photos"])
    ? row["photos"]
        .flatMap((value) => {
          const photo = httpsUrl(value);
          return photo ? [photo] : [];
        })
        .slice(0, 2)
    : [];
  const history: PriceEvent[] = Array.isArray(row["price_history"])
    ? row["price_history"].flatMap((raw) => {
        const old = positive(raw?.old);
        const next = positive(raw?.new);
        const at = date(raw?.at);
        return old && next && at ? [{ old, new: next, at }] : [];
      })
    : [];
  const description = String(row["description"] ?? "");
  const fixed = /без (?:повышения|удорожания)(?: цены)? (?:на )?лет/iu.test(description);
  const seasonal = /до лет[ао]|с мая посуточ|летом (?:дороже|\d)|летний период/iu.test(description);
  return {
    source: sources[String(row["source"])] ?? String(row["source"]),
    url,
    price,
    photos,
    history,
    published: date(row["published_at"]),
    seen: date(row["last_seen"]),
    category: fixed ? "Без повышения летом" : seasonal ? "Сезонная" : "Срок по карточке",
    terms: row["rent_period"] === "long" ? "Длительная аренда" : "Условия в объявлении",
  };
}

let lastRequest = 0;
async function fetchHouse(home: MarketHome, key: string, ownIds: Set<string>) {
  const address = marketAddress(home.address);
  if (!address) throw new Error("Точный адрес не определён");
  const parameters = new URLSearchParams({
    q: home.address,
    locality: home.locality,
    realty_type: home.kind,
    deal_type: "rent",
    price_history: "1",
    limit: "50",
    dedupe: "false",
  });
  const groups = new Map<string, MarketGroup>();
  const cursors = new Set<string>();
  const seenIds = new Set<string>();
  for (let page = 0; page < 25; page++) {
    await setTimeout(Math.max(0, 2200 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
    const response = await fetch("https://api.metrapi.ru/v1/items?" + parameters, {
      headers: { "X-Api-Key": key },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`Metrapi HTTP ${response.status}`);
    const payload = (await response.json()) as {
      items?: ApiRow[];
      next_cursor?: string | null;
      count?: number;
    };
    if (!Array.isArray(payload.items)) throw new Error("Metrapi не вернул список");
    for (const row of payload.items) {
      if (row["delisted_at"] || (row["rent_period"] && row["rent_period"] !== "long")) continue;
      const exact =
        typeof row["address"] === "string" && marketAddress(row["address"])?.key === address.key;
      if (!exact) continue;
      const identity = `${row["source"]}:${row["source_id"]}`;
      if (seenIds.has(identity)) continue;
      seenIds.add(identity);
      const offer = makeOffer(row);
      if (!offer) continue;
      const id = row["group_id"] ? String(row["group_id"]) : identity;
      const rooms = positive(row["rooms"]);
      const floor =
        typeof row["floor"] === "number" && Number.isFinite(row["floor"]) ? row["floor"] : null;
      const group = groups.get(id) ?? {
        id,
        area: positive(row["area_total"]),
        floor,
        layout: rooms ? `${rooms} комн.` : "Планировка уточняется",
        possibleOwn: false,
        offers: [],
      };
      group.possibleOwn ||= ownIds.has(identity);
      group.offers.push(offer);
      groups.set(id, group);
    }
    if (!payload.next_cursor) return [...groups.values()];
    if (cursors.has(payload.next_cursor)) throw new Error("Metrapi повторил курсор");
    cursors.add(payload.next_cursor);
    parameters.set("cursor", payload.next_cursor);
  }
  throw new Error("Не удалось дочитать выдачу Metrapi");
}

let running = false;
export async function syncRentalMarket() {
  const key = process.env["METRAPI_API_KEY"]?.trim();
  if (!key) return { configured: false, saved: 0, remaining: null };
  if (running) return { configured: true, saved: 0, running: true };
  running = true;
  try {
    const { homes, ownSourceIds, seen } = await rentalMarketSyncCatalog();
    ownSourceIds.add("avito:7907008885");
    ownSourceIds.add("yandex:3449747965218039978");
    const day = marketDate(new Date());
    const pending = homes
      .filter((home) => !home.unresolved && seen.get(home.id) !== day)
      .sort((a, b) => (seen.get(a.id) ?? "").localeCompare(seen.get(b.id) ?? ""));
    let saved = 0;
    const errors: { house: string; error: string }[] = [];
    const until = Date.now() + 35_000;
    for (const home of pending.slice(0, 6)) {
      if (Date.now() > until) break;
      try {
        const listings = await fetchHouse(home, key, ownSourceIds);
        const checkedAt = new Date();
        await saveMarketSnapshot({
          houseKey: home.id,
          day: marketDate(checkedAt),
          checkedAt: checkedAt.toISOString(),
          listings,
        });
        saved++;
      } catch (error) {
        errors.push({
          house: home.id,
          error: error instanceof Error ? error.message : "Не удалось загрузить срез",
        });
        if (error instanceof Error && /HTTP (401|403|429)/.test(error.message)) break;
      }
    }
    return { configured: true, saved, remaining: pending.length - saved, errors };
  } finally {
    running = false;
  }
}
