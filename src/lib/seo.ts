import { formatArea, formatMoney, roomsLabel, shortAddress, type Property } from "@/lib/properties";
import { SITE_NAME, SITE_ORIGIN } from "@/lib/site";

const RU_TRANSLIT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "j",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** Человекочитаемый slug из русского названия ЖК. */
export function slugifyName(name: string): string {
  const translit = name
    .trim()
    .toLowerCase()
    .split("")
    .map((ch) => RU_TRANSLIT[ch] ?? ch)
    .join("");
  const slug = translit
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || "complex";
}

export function complexSlug(
  complex: { id: string; name: string },
  all: { id: string; name: string }[],
): string {
  const base = slugifyName(complex.name);
  const clashes = all.filter((item) => slugifyName(item.name) === base);
  if (clashes.length > 1) return `${base}-${complex.id.slice(0, 6)}`;
  return base;
}

export function complexPath(slug: string): string {
  return `/rent/jk/${slug}`;
}

export function complexUrl(slug: string): string {
  return `${SITE_ORIGIN}${complexPath(slug)}`;
}

/** /rent/kvartira-s-2-spalnyami-v-zhk-brevis-42 — уникальность через ref_id. */
export function propertySlug(p: { title: string; ref_id: number }): string {
  const base = slugifyName(p.title) || "kvartira";
  const safe = base === "jk" ? "kvartira" : base;
  return `${safe}-${p.ref_id}`;
}

export function propertyPath(p: { title: string; ref_id: number }): string {
  return `/rent/${propertySlug(p)}`;
}

export function propertyUrl(p: { title: string; ref_id: number }): string {
  return `${SITE_ORIGIN}${propertyPath(p)}`;
}

function pathnameFromMaybeUrl(value: string): string {
  const raw = value.trim();
  try {
    const url = raw.includes("://")
      ? new URL(raw)
      : new URL(raw.startsWith("/") ? raw : `/rent/${raw}`, SITE_ORIGIN);
    return (url.pathname.replace(/\/+$/, "") || "/").toLowerCase();
  } catch {
    const path = raw.startsWith("/") ? raw : `/rent/${raw}`;
    return path.replace(/\/+$/, "").toLowerCase();
  }
}

/** Совпадение со старым WordPress-адресом из source_url. */
export function propertyMatchesLegacyPath(
  property: { source_url?: string | null },
  requestKey: string,
): boolean {
  const stored = property.source_url ? pathnameFromMaybeUrl(property.source_url) : "";
  if (!stored.startsWith("/rent/")) return false;
  const wanted = pathnameFromMaybeUrl(requestKey);
  if (stored === wanted) return true;
  const storedTail = stored.split("/").filter(Boolean);
  const wantedTail = wanted.split("/").filter(Boolean);
  if (wantedTail.length === 0) return false;
  if (storedTail.slice(-wantedTail.length).join("/") === wantedTail.join("/")) return true;
  const last = wantedTail.at(-1) ?? "";
  return last.length > 4 && storedTail.at(-1) === last;
}

/** Постоянный публичный URL фото (без подписи). */
export function publicPhotoUrl(path: string): string {
  const encoded = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `${SITE_ORIGIN}/api/public/feed-photo/${encoded}`;
}

const ROOM_ADJ_FEM: Record<number, string> = {
  1: "однокомнатную",
  2: "двухкомнатную",
  3: "трёхкомнатную",
  4: "четырёхкомнатную",
};

const ROOM_ADJ_PL: Record<number, string> = {
  1: "однокомнатные",
  2: "двухкомнатные",
  3: "трёхкомнатные",
  4: "четырёхкомнатные",
};

/** «двухкомнатную квартиру», «виллу», «студию» — для title «Снять …». */
export function rentListingPhrase(p: Pick<Property, "type" | "rooms" | "is_apartments">): string {
  if (p.type === "villa") return "виллу";
  if (p.type === "house") return "дом";
  if (p.type === "townhouse") return "таунхаус";
  const isAparts = p.type === "aparts" || p.is_apartments === true;
  if (p.rooms <= 0) return "студию";
  if (isAparts) {
    const adj = ROOM_ADJ_PL[p.rooms];
    return adj ? `${adj} апартаменты` : `${p.rooms}-комнатные апартаменты`;
  }
  const adj = ROOM_ADJ_FEM[p.rooms];
  return adj ? `${adj} квартиру` : `${p.rooms}-комнатную квартиру`;
}

const META_TITLE_MAX = 70;

function titleSuffix(): string {
  return ` — ${SITE_NAME}`;
}

/** Укладывает core в лимит; при обрезке сохраняет хвостовой «№N». */
function fitTitle(core: string): string {
  const suffix = titleSuffix();
  if ((core + suffix).length <= META_TITLE_MAX) return core + suffix;
  const maxCore = META_TITLE_MAX - 1 - suffix.length;
  const numMatch = core.match(/(№\s*\d+)\s*$/u);
  if (numMatch) {
    const num = numMatch[1]!.replace(/\s+/g, "");
    const budget = maxCore - num.length - 1;
    const head = core.slice(0, Math.max(1, budget)).replace(/[\s,;:–-]+$/u, "");
    return `${head} ${num}${suffix}`;
  }
  const trimmed = core.slice(0, Math.max(1, maxCore)).replace(/[\s,;:–-]+$/u, "");
  return `${trimmed}${suffix}`;
}

function pickFittingTitle(candidates: string[]): string {
  const suffix = titleSuffix();
  for (const core of candidates) {
    if ((core + suffix).length <= META_TITLE_MAX) return core + suffix;
  }
  return fitTitle(candidates[candidates.length - 1] ?? "");
}

/** H1 карточки: «Снять студию в ЖК Лазурный берег 2 в Сочи». */
export function propertyPageHeading(
  p: Pick<Property, "type" | "rooms" | "is_apartments" | "complex_name">,
): string {
  const phrase = rentListingPhrase(p);
  const jk = p.complex_name?.trim() ? ` в ЖК ${p.complex_name.trim()}` : "";
  return `Снять ${phrase}${jk} в Сочи`;
}

/**
 * Title карточки: уникальное название + площадь/цена/локация (что влезает).
 * Шаблон: «{title}, {area}, {price}/мес, {ЖК|адрес} — аренда в Сочи — Резиденция&Море».
 * Сначала уникальные поля, мягкий хвост «аренда в Сочи» — только если остаётся место.
 */
export function propertyMetaTitle(p: Property): string {
  const name = p.title.trim() || propertyPageHeading(p);
  const suffix = titleSuffix();
  const maxCore = META_TITLE_MAX - suffix.length;

  const complex = p.complex_name?.trim();
  const place = complex ? `ЖК ${complex}` : p.address?.trim() ? shortAddress(p.address) : "";

  const uniqueBits = [
    p.area ? formatArea(p.area) : "",
    p.price_month ? `${formatMoney(p.price_month)}/мес` : "",
    place,
    p.floor != null ? `${p.floor} этаж` : "",
  ].filter(Boolean);

  let core = name;
  for (const bit of uniqueBits) {
    const next = `${core}, ${bit}`;
    if (next.length <= maxCore) core = next;
  }

  const withRent = `${core} — аренда в Сочи`;
  if (withRent.length <= maxCore) return withRent + suffix;

  // Если ядро уже уникально заполнено — не режем title ради хвоста.
  if (core !== name) return core + suffix;

  // Короткое имя без доп. полей: пробуем мягкий хвост или аккуратную обрезку с «№N».
  return pickFittingTitle([`${name} — аренда в Сочи`, name]);
}

/** Description: начинается с уникального title, дальше тип/площадь/этаж/цена/локация. */
export function propertyMetaDescription(p: Property): string {
  const name = p.title.trim();
  const bits = [`Снять ${rentListingPhrase(p)} в Сочи`];
  if (p.area) bits.push(formatArea(p.area));
  if (p.rooms != null) bits.push(roomsLabel(p.rooms));
  if (p.floor != null) bits.push(`${p.floor} этаж`);
  if (p.price_month) bits.push(`${formatMoney(p.price_month)}/мес`);
  const complex = p.complex_name?.trim();
  if (complex) bits.push(`ЖК ${complex}`);
  else if (p.address?.trim()) bits.push(shortAddress(p.address));
  const lead = name ? `${name}. ` : "";
  const sentence = `${lead}${bits.join(" — ")}. Долгосрочная аренда от Резиденция&Море, прозрачные условия и сопровождение.`;
  if (sentence.length <= 170) return sentence;
  return `${sentence.slice(0, 169).replace(/\s+\S*$/, "")}…`;
}

export function complexMetaTitle(name: string): string {
  return fitTitle(`Снять квартиру в ЖК ${name} в Сочи`);
}

export function complexMetaDescription(name: string, description: string, count: number): string {
  const lead =
    count > 0
      ? `Актуальные квартиры и апартаменты в ЖК ${name}, Сочи — ${count} ${count === 1 ? "объект" : count < 5 ? "объекта" : "объектов"} в долгосрочную аренду.`
      : `Долгосрочная аренда квартир и апартаментов в ЖК ${name}, Сочи от Резиденция&Море.`;
  const extra = description.replace(/\s+/g, " ").trim();
  const full = extra ? `${lead} ${extra}` : lead;
  if (full.length <= 170) return full;
  return `${full.slice(0, 169).replace(/\s+\S*$/, "")}…`;
}

export function propertyJsonLd(p: Property, url: string, image?: string) {
  const isHouse = p.type === "house" || p.type === "villa";
  return {
    "@context": "https://schema.org",
    "@type": isHouse ? "House" : "Apartment",
    name: p.title,
    url,
    description: p.description || propertyMetaDescription(p),
    ...(image ? { image } : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: "Сочи",
      addressCountry: "RU",
      streetAddress: p.address,
    },
    numberOfRooms: p.rooms,
    ...(p.area
      ? {
          floorSize: {
            "@type": "QuantitativeValue",
            value: p.area,
            unitCode: "MTK",
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "RUB",
      ...(p.price_month != null ? { price: p.price_month } : {}),
      availability:
        p.status === "free" || p.status === "soon_free"
          ? "https://schema.org/InStock"
          : "https://schema.org/SoldOut",
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
    },
  };
}

export function complexJsonLd(input: {
  name: string;
  description: string;
  url: string;
  image?: string;
  itemUrls: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ApartmentComplex",
    name: `ЖК ${input.name}`,
    url: input.url,
    description: input.description,
    ...(input.image ? { image: input.image } : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: "Сочи",
      addressCountry: "RU",
    },
    containsPlace: input.itemUrls.map((url) => ({
      "@type": "Apartment",
      url,
    })),
  };
}

export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function buildSitemapXml(
  urls: { loc: string; lastmod?: string; changefreq?: string; priority?: string }[],
) {
  const body = urls
    .map((u) => {
      const lastmod = u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : "";
      const changefreq = u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : "";
      const priority = u.priority ? `<priority>${u.priority}</priority>` : "";
      return `<url><loc>${u.loc}</loc>${lastmod}${changefreq}${priority}</url>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}
