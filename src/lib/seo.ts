import { formatArea, formatMoney, roomsLabel, type Property } from "@/lib/properties";
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
    const url = raw.includes("://") ? new URL(raw) : new URL(raw.startsWith("/") ? raw : `/rent/${raw}`, SITE_ORIGIN);
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
  const encoded = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
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

function fitTitle(core: string): string {
  const suffix = ` — ${SITE_NAME}`;
  if ((core + suffix).length <= 70) return core + suffix;
  const maxCore = 69 - suffix.length;
  const trimmed = core.slice(0, Math.max(1, maxCore)).replace(/[\s,;:–-]+$/u, "");
  return `${trimmed}${suffix}`;
}

/** H1 карточки: «Снять студию в ЖК Лазурный берег 2 в Сочи». */
export function propertyPageHeading(p: Pick<Property, "type" | "rooms" | "is_apartments" | "complex_name">): string {
  const phrase = rentListingPhrase(p);
  const jk = p.complex_name?.trim() ? ` в ЖК ${p.complex_name.trim()}` : "";
  return `Снять ${phrase}${jk} в Сочи`;
}

/** Title карточки объекта под поисковые запросы «снять … в ЖК … Сочи». */
export function propertyMetaTitle(p: Property): string {
  const price = p.price_month ? ` — ${formatMoney(p.price_month)}` : "";
  return fitTitle(`${propertyPageHeading(p)}${price}`);
}

export function propertyMetaDescription(p: Property): string {
  const parts = [`Снять ${rentListingPhrase(p)} в Сочи`];
  if (p.area) parts.push(formatArea(p.area));
  if (p.rooms != null) parts.push(roomsLabel(p.rooms));
  if (p.price_month) parts.push(`${formatMoney(p.price_month)}/мес`);
  const location = p.complex_id ? p.complex_name : "";
  if (location) parts.push(`ЖК ${location}`);
  const sentence =
    parts.join(" — ") + ". Долгосрочная аренда от Резиденция&Море, прозрачные условия и сопровождение.";
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

export function buildSitemapXml(urls: { loc: string; lastmod?: string; changefreq?: string; priority?: string }[]) {
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
