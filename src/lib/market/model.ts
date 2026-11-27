export type PriceEvent = { old: number; new: number; at: string };
export type MarketOffer = {
  source: string;
  url: string;
  price: number;
  photos: string[];
  history: PriceEvent[];
  published: string | null;
  seen: string | null;
  category: string;
  terms: string;
  summerPrice?: number | null;
};
export type MarketGroup = {
  id: string;
  area: number | null;
  floor: number | null;
  layout: string;
  possibleOwn: boolean;
  offers: MarketOffer[];
};
export type MarketSnapshot = {
  houseKey: string;
  day: string;
  checkedAt: string;
  listings: MarketGroup[];
};
export type MarketHome = {
  id: string;
  name: string;
  address: string;
  kind: "flat" | "house";
  locality: string;
  query: string | null;
  propertyIds: string[];
  complexId: string | null;
  unresolved: boolean;
};
export type MarketProperty = {
  id: string;
  title: string;
  address: string;
  type: string;
  complex_id: string | null;
  complex_name: string;
  area: number | null;
  floor: number | null;
  price_month: number | null;
  summer_price_month: number | null;
  published: boolean;
  publicUrl?: string;
};
export type MarketComplex = { id: string; name: string };
export type MarketPoint = {
  day: string;
  checkedAt: string;
  active: number;
  median: number | null;
  medianDays: number | null;
  groupIds: string[];
  samples: { id: string; price: number; days: number | null }[];
  coveredHomes?: string[];
};
export type MarketBuilding = MarketHome & {
  propertyNames: string[];
  published: number;
  latest: MarketPoint | null;
  previousMonth: MarketPoint | null;
  monthly: MarketPoint[];
};

export const marketDate = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const low = sorted.at(Math.floor((sorted.length - 1) / 2));
  const high = sorted.at(Math.floor(sorted.length / 2));
  return low === undefined || high === undefined ? null : (low + high) / 2;
}

const streetTypes: [RegExp, string][] = [
  [/(?:^| )пр[-. ]?(?:т|оспект)(?= |$)/gu, "проспект"],
  [/(?:^| )ул(?:ица)?(?= |$)/gu, "улица"],
  [/(?:^| )пер(?:еулок)?(?= |$)/gu, "переулок"],
  [/(?:^| )ш(?:оссе)?(?= |$)/gu, "шоссе"],
  [/(?:^| )наб(?:ережная)?(?= |$)/gu, "набережная"],
  [/(?:^| )б[- ]?(?:р|ульвар)(?= |$)/gu, "бульвар"],
  [/(?:^| )проезд(?= |$)/gu, "проезд"],
];
const neutral = (value: string) => value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
const houseNumber =
  /^(?:д\.?\s*|дом\s+)?(\d+[а-яa-z]?(?:\s*[/-]\s*\d+(?:[а-яa-z]\d*)?)*(?:\s*(?:корпус|корп\.?|к\.?|строение|стр\.?)\s*[а-яa-z]?\d*[а-яa-z]?)?)(?:\s|$)/u;

function addressNumber(part: string) {
  return neutral(part.trim()).match(houseNumber)?.[1];
}

export function isMarketCatalogEntry(...values: (string | null)[]) {
  return !values.some(
    (value) =>
      value &&
      /(?:^|[^\p{L}\d])(?:тест(?:ов\p{L}*)?|test(?:ing)?|демонстрационн\p{L}*|[nhн]\s*[-‐‑–]?\s*11)(?=$|[^\p{L}\d])/iu.test(
        value,
      ),
  );
}

function complexNameKey(name: string) {
  return neutral(name)
    .replace(/^жк\s+/u, "")
    .replace(/[«»"„“”]/gu, "")
    .trim();
}

export function marketAddress(address: string) {
  const parts = address.trim().split(/,\s*/u);
  for (const [index, part] of parts.entries()) {
    let text = neutral(part).replace(/[.]/g, " ").replace(/\s+/g, " ").trim();
    text = text.replace(
      /^ул(?:ица)? (?=.+ (?:улица|проспект|переулок|шоссе|набережная|бульвар|проезд)(?: |$))/u,
      "",
    );
    for (const [pattern, type] of streetTypes) {
      const rest = text.replace(pattern, " ").trim();
      if (rest === text) continue;
      const embedded = rest.match(/^(.*?)\s+(?=(?:дом\s+|д\s+)?\d+[а-яa-z]?(?:[\s/-]|$))(.+)$/u);
      const street = (embedded?.[1] ?? rest).trim();
      const following = addressNumber(parts[index + 1] ?? "");
      const previous = parts[index - 1] ?? "";
      const preceding =
        !following && !embedded && addressNumber(previous) === neutral(previous.trim())
          ? addressNumber(previous)
          : undefined;
      const number = embedded ? addressNumber(embedded[2] ?? "") : (following ?? preceding);
      if (!street || !number) continue;
      const suffix = neutral(parts[index + 2] ?? "");
      const block =
        following &&
        !/корп|стр|к\d/u.test(number) &&
        /^(?:корпус|корп\.?|к\.|строение|стр\.?)\s*\d/u.test(suffix)
          ? suffix
          : "";
      const canonical = (number + block)
        .replace(/корпус|корп\.?|к\./gu, "к")
        .replace(/строение|стр\.?/gu, "с")
        .replace(/\s/g, "");
      return {
        key: `${type}:${street}:${canonical}`,
        street,
        display: `${street[0]?.toLocaleUpperCase("ru-RU") ?? ""}${street.slice(1)} ${type}, ${canonical}`,
        query: `${street}, ${canonical}`,
      };
    }
  }
  // Some catalog addresses use a city and an adjectival street name without "ул.".
  const short = neutral(address).match(/^сочи\s*,?\s+([а-я-]+(?:ая|яя))\s+(\d+[а-я]?)$/u);
  if (short) return marketAddress(`улица ${short[1]}, ${short[2]}`);
  return null;
}

export function marketHomes(
  properties: MarketProperty[],
  complexes: MarketComplex[],
): MarketHome[] {
  const houses = new Map<string, MarketHome>();
  const linked = new Set<string>();
  const names = new Map(complexes.map((c) => [c.id, c.name]));
  const idsByName = new Map(complexes.map((c) => [complexNameKey(c.name), c.id]));
  for (const p of properties) {
    if (["house", "villa", "townhouse", "land"].includes(p.type)) continue;
    const named =
      p.complex_name?.trim() || p.title.match(/(?:^|\s)в\s+ЖК\s+(.+)$/iu)?.[1]?.trim() || "";
    const nameKey = complexNameKey(named);
    const complexId =
      p.complex_id || (nameKey ? (idsByName.get(nameKey) ?? `name:${nameKey}`) : null);
    if (!complexId) continue;
    linked.add(complexId);
    const address = marketAddress(p.address);
    const locality =
      p.address.match(
        /(?:^|[,\s])(?:пос[её]лок\s+|пгт\s+|село\s+)?(Сириус|Дагомыс|Красная Поляна|Эсто[- ]Садок)(?=$|[,\s])/iu,
      )?.[1] ?? "Сочи";
    const id = address ? `flat:${neutral(locality)}:${address.key}` : `complex:${complexId}`;
    const name = names.get(complexId) || named || p.title;
    const existing = houses.get(id);
    if (existing) {
      existing.propertyIds.push(p.id);
    } else {
      houses.set(id, {
        id,
        name,
        address: address?.display ?? p.address,
        kind: "flat",
        locality,
        query: address?.query ?? null,
        propertyIds: [p.id],
        complexId,
        unresolved: !address,
      });
    }
  }
  for (const complex of complexes)
    if (!linked.has(complex.id)) {
      const id = `complex:${complex.id}`;
      houses.set(id, {
        id,
        name: complex.name,
        address: "",
        kind: "flat",
        locality: "Сочи",
        query: null,
        propertyIds: [],
        complexId: complex.id,
        unresolved: true,
      });
    }
  return [...houses.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "ru") ||
      a.address.localeCompare(b.address, "ru", { numeric: true }),
  );
}

export function summarizeMarket(snapshot: MarketSnapshot): MarketPoint {
  const groups = snapshot.listings.filter(
    (listing) => !listing.possibleOwn && listing.offers.length,
  );
  const samples = groups.map((group) => {
    const dates = group.offers.flatMap((offer) =>
      offer.published ? [Date.parse(offer.published)] : [],
    );
    const ms = Date.parse(snapshot.checkedAt) - Math.min(...dates.filter(Number.isFinite));
    return {
      id: group.id,
      price: Math.min(...group.offers.map((offer) => offer.price)),
      days: Number.isFinite(ms) && ms >= 0 ? Math.floor(ms / 86_400_000) : null,
    };
  });
  return pointFromSamples(snapshot.day, snapshot.checkedAt, samples);
}

function pointFromSamples(
  day: string,
  checkedAt: string,
  samples: MarketPoint["samples"],
): MarketPoint {
  return {
    day,
    checkedAt,
    samples,
    active: samples.length,
    median: median(samples.map((x) => x.price)),
    medianDays: median(samples.flatMap((x) => (x.days === null ? [] : [x.days]))),
    groupIds: samples.map((x) => x.id),
  };
}

export function marketComplexes(houses: MarketBuilding[]) {
  const groups = new Map<string, MarketBuilding[]>();
  for (const house of houses) {
    const key = house.complexId ?? house.id;
    const group = groups.get(key) ?? [];
    group.push(house);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) => {
    const first = group[0];
    if (!first) return [];
    if (group.length === 1) return [{ ...first, homes: group }];
    const months = new Map<string, { points: MarketPoint[]; homes: string[] }>();
    for (const house of group) {
      for (const point of house.monthly) {
        const month = point.day.slice(0, 7);
        const value = months.get(month) ?? { points: [], homes: [] };
        value.points.push(point);
        value.homes.push(house.id);
        months.set(month, value);
      }
    }
    const monthly = [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([, value]) => {
        const mostRecent = [...value.points].sort((a, b) =>
          b.checkedAt.localeCompare(a.checkedAt),
        )[0];
        if (!mostRecent) return [];
        const samples = new Map<string, MarketPoint["samples"][number]>();
        for (const point of value.points)
          for (const sample of point.samples) {
            const current = samples.get(sample.id);
            if (!current || sample.price < current.price) samples.set(sample.id, sample);
          }
        return [
          {
            ...pointFromSamples(mostRecent.day, mostRecent.checkedAt, [...samples.values()]),
            coveredHomes: value.homes.sort(),
          },
        ];
      });
    return [
      {
        ...first,
        id: first.complexId ?? first.id,
        address: group.length + " адресов",
        published: group.reduce((sum, house) => sum + house.published, 0),
        latest: monthly.at(-1) ?? null,
        previousMonth: monthly.at(-2) ?? null,
        monthly,
        homes: group,
      },
    ];
  });
}

export function monthPoints(points: MarketPoint[]) {
  const months = new Map<string, MarketPoint>();
  for (const point of points) {
    const month = point.day.slice(0, 7);
    const existing = months.get(month);
    if (!existing || existing.checkedAt < point.checkedAt) months.set(month, point);
  }
  return [...months.values()].sort((a, b) => a.day.localeCompare(b.day));
}
