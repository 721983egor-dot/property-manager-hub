/**
 * Сборка текста Description для фидов (Авито, Циан, Яндекс, Справочник).
 * Структура: описание объекта → Локация → Инфо по ЖК → Условия → футер компании.
 */

/** Подписи инфраструктуры (как INFRASTRUCTURE_OPTIONS в complexes.ts) — без импорта клиента. */
const INFRASTRUCTURE_LABELS: Record<string, string> = {
  pool: "Бассейн",
  gated: "Закрытая территория",
  parking: "Парковка",
  near_sea: "Рядом с морем",
  fountain: "Фонтан",
  security: "Охрана",
  playground: "Детская площадка",
  beach: "Пляж",
};

function infrastructureLabel(value: string): string {
  return INFRASTRUCTURE_LABELS[value] ?? value;
}

export type ListingDescriptionPlatform = "avito" | "cian" | "yandex" | "yandex-spravochnik";

export type ListingDescriptionComplex = {
  name: string;
  description: string;
  location_description: string;
  infrastructure: string[];
};

export type ListingDescriptionProperty = {
  description: string;
  complex_id: string | null;
  rent_terms: string;
  deposit: number | null;
  utilities_month: number | null;
};

export type BuildListingDescriptionOptions = {
  platform: ListingDescriptionPlatform;
  /** Лимит символов; по умолчанию — лимит платформы. */
  maxLength?: number;
};

export const COMPANY_FOOTER_DEFAULT =
  "Резиденция&Море — сервис управления жилой недвижимостью в Сочи.";

/** Циан: без «&» и без «и» — отдельная строка, не через replace &→« и ». */
export const COMPANY_FOOTER_CIAN =
  "Резиденция Море — сервис управления жилой недвижимостью в Сочи.";

export const LISTING_DESCRIPTION_LIMITS: Record<ListingDescriptionPlatform, number> = {
  avito: 7500,
  cian: 3000,
  yandex: 10_000,
  "yandex-spravochnik": 5500,
};

function companyFooter(platform: ListingDescriptionPlatform): string {
  return platform === "cian" ? COMPANY_FOOTER_CIAN : COMPANY_FOOTER_DEFAULT;
}

function formatMoneyRu(value: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function normalizeParagraph(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Чистка тела описания под правила Циан (без обрезки и без футера). */
export function cleanCianDescriptionBody(raw: string): string {
  return raw
    .replace(/&/g, " и ")
    .replace(/[№/\\]/g, " ")
    .replace(/[«»]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function joinBlocks(blocks: string[]): string {
  return blocks.filter((b) => b.trim()).join("\n\n");
}

function section(title: string, body: string): string {
  const text = body.trim();
  if (!text) return "";
  return `${title}\n\n${text}`;
}

function infrastructureLine(codes: string[]): string {
  const labels = codes
    .map((code) => infrastructureLabel(code).trim())
    .filter(Boolean)
    .map((label) => label.charAt(0).toLowerCase() + label.slice(1));
  if (labels.length === 0) return "";
  return `Инфраструктура ЖК: ${labels.join(", ")}.`;
}

/**
 * Пункты «Условия» из rent_terms; суммы депозита/КУ вплетаются в подходящие строки.
 * Если rent_terms пуст, но есть числа — добавляем отдельные пункты.
 */
export function buildRentTermsBullets(
  property: Pick<ListingDescriptionProperty, "rent_terms" | "deposit" | "utilities_month">,
): string[] {
  const lines = property.rent_terms
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const deposit = property.deposit != null && property.deposit > 0 ? property.deposit : null;
  const utilities =
    property.utilities_month != null && property.utilities_month > 0 ? property.utilities_month : null;

  let usedDeposit = false;
  let usedUtilities = false;

  const bullets = lines.map((raw) => {
    let text = raw.replace(/\s+/g, " ").replace(/\.?\s*$/, "");

    if (utilities != null && /коммунальн/i.test(text) && !/\d/.test(text)) {
      text = `${text} (ориентир по объекту — ${formatMoneyRu(utilities)}/мес)`;
      usedUtilities = true;
    }

    if (deposit != null && /депозит/i.test(text) && !/\d/.test(text)) {
      text = text
        .replace(/,\s*при условии сохранности/i, " при сохранности")
        .replace(/^(.*?депозит)\s+/i, `$1 — ${formatMoneyRu(deposit)}: `);
      usedDeposit = true;
    }

    if (!/[.!?…]$/.test(text)) text += ".";
    return `— ${text}`;
  });

  if (utilities != null && !usedUtilities) {
    bullets.push(`— Коммунальные платежи — ориентир ${formatMoneyRu(utilities)}/мес.`);
  }
  if (deposit != null && !usedDeposit) {
    bullets.push(
      `— Страховой депозит — ${formatMoneyRu(deposit)}: вносится при заселении и возвращается при выезде при сохранности имущества.`,
    );
  }

  return bullets;
}

type AssembledParts = {
  objectDescription: string;
  location: string;
  complexInfo: string;
  terms: string;
  footer: string;
};

function assembleParts(
  property: ListingDescriptionProperty,
  complex: ListingDescriptionComplex | null | undefined,
  platform: ListingDescriptionPlatform,
): AssembledParts {
  const objectDescription = normalizeParagraph(property.description ?? "");
  const hasComplex = Boolean(property.complex_id && complex);

  let location = "";
  let complexInfo = "";
  if (hasComplex && complex) {
    const locationText = normalizeParagraph(complex.location_description ?? "");
    location = section("Локация", locationText);

    const name = (complex.name || "").trim() || "ЖК";
    const complexBody = [
      normalizeParagraph(complex.description ?? ""),
      infrastructureLine(Array.isArray(complex.infrastructure) ? complex.infrastructure : []),
    ]
      .filter(Boolean)
      .join("\n");
    complexInfo = section(`Инфо по ЖК «${name}»`, complexBody);
  }

  const bullets = buildRentTermsBullets(property);
  const terms = bullets.length > 0 ? section("Условия", bullets.join("\n")) : "";
  const footer = companyFooter(platform);

  return { objectDescription, location, complexInfo, terms, footer };
}

function renderParts(parts: AssembledParts): string {
  return joinBlocks([parts.objectDescription, parts.location, parts.complexInfo, parts.terms, parts.footer]);
}

/**
 * Укорачиваем середину (инфра / текст ЖК / локация), объект и футер компании сохраняем.
 */
function fitToLimit(parts: AssembledParts, maxLength: number, platform: ListingDescriptionPlatform): string {
  const applyCianClean = (p: AssembledParts): AssembledParts => {
    if (platform !== "cian") return p;
    return {
      objectDescription: cleanCianDescriptionBody(p.objectDescription),
      location: p.location ? cleanCianDescriptionBody(p.location) : "",
      complexInfo: p.complexInfo ? cleanCianDescriptionBody(p.complexInfo) : "",
      terms: p.terms ? cleanCianDescriptionBody(p.terms) : "",
      footer: p.footer, // не прогоняем через replace &→« и »
    };
  };

  let current = applyCianClean({ ...parts });
  let text = renderParts(current);
  if (text.length <= maxLength) return text;

  // 1) Убрать строку инфраструктуры ЖК
  if (current.complexInfo.includes("Инфраструктура ЖК:")) {
    current = {
      ...current,
      complexInfo: current.complexInfo
        .split("\n")
        .filter((line) => !/^\s*Инфраструктура ЖК:/i.test(line))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    };
    text = renderParts(current);
    if (text.length <= maxLength) return text;
  }

  // 2) Укоротить тело «Инфо по ЖК» (после заголовка)
  if (current.complexInfo) {
    const footerLen = current.footer.length + 2;
    const withoutComplex = joinBlocks([
      current.objectDescription,
      current.location,
      current.terms,
      current.footer,
    ]);
    const budget = maxLength - withoutComplex.length;
    if (budget < 40) {
      current = { ...current, complexInfo: "" };
    } else {
      const titleMatch = current.complexInfo.match(/^(Инфо по ЖК[^\n]*)\n\n([\s\S]*)$/);
      if (titleMatch) {
        const title = titleMatch[1];
        let body = titleMatch[2].trim();
        const maxBody = Math.max(0, budget - title.length - 2);
        if (body.length > maxBody) {
          body = `${body.slice(0, Math.max(0, maxBody - 1)).trim()}…`;
        }
        current = { ...current, complexInfo: body ? `${title}\n\n${body}` : "" };
      } else {
        current = { ...current, complexInfo: "" };
      }
    }
    text = renderParts(current);
    if (text.length <= maxLength) return text;
  }

  // 3) Укоротить / убрать локацию
  if (current.location) {
    const withoutLocation = joinBlocks([
      current.objectDescription,
      current.complexInfo,
      current.terms,
      current.footer,
    ]);
    const budget = maxLength - withoutLocation.length;
    if (budget < 30) {
      current = { ...current, location: "" };
    } else {
      const titleMatch = current.location.match(/^(Локация)\n\n([\s\S]*)$/);
      if (titleMatch) {
        let body = titleMatch[2].trim();
        const maxBody = Math.max(0, budget - titleMatch[1].length - 2);
        if (body.length > maxBody) {
          body = `${body.slice(0, Math.max(0, maxBody - 1)).trim()}…`;
        }
        current = { ...current, location: body ? `Локация\n\n${body}` : "" };
      } else {
        current = { ...current, location: "" };
      }
    }
    text = renderParts(current);
    if (text.length <= maxLength) return text;
  }

  // 4) В крайнем случае укоротить описание объекта (футер и условия сохранить)
  const tail = joinBlocks([current.terms, current.footer]);
  const budget = maxLength - (tail ? tail.length + 2 : 0);
  let head = current.objectDescription;
  if (budget <= 0) {
    return current.footer.slice(0, maxLength);
  }
  if (head.length > budget) {
    head = `${head.slice(0, Math.max(0, budget - 1)).trim()}…`;
  }
  return joinBlocks([head, current.terms, current.footer]).slice(0, maxLength);
}

/**
 * Полный текст Description для фида.
 * Без complex_id / complex — блоки «Локация» и «Инфо по ЖК» пропускаются.
 * Футер компании — всегда; условия — если есть rent_terms / депозит / КУ.
 */
export function buildListingDescription(
  property: ListingDescriptionProperty,
  complex: ListingDescriptionComplex | null | undefined,
  options: BuildListingDescriptionOptions,
): string {
  const maxLength = options.maxLength ?? LISTING_DESCRIPTION_LIMITS[options.platform];
  const parts = assembleParts(property, complex, options.platform);
  return fitToLimit(parts, maxLength, options.platform);
}

/** Загрузка комплексов для фидов (сервисный клиент). */
export async function fetchComplexesMapForFeeds(): Promise<Map<string, ListingDescriptionComplex>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("complexes")
    .select("id, name, description, location_description, infrastructure");
  if (error) throw error;

  const map = new Map<string, ListingDescriptionComplex>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const id = String(row["id"] ?? "");
    if (!id) continue;
    map.set(id, {
      name: typeof row["name"] === "string" ? row["name"] : "",
      description: typeof row["description"] === "string" ? row["description"] : "",
      location_description:
        typeof row["location_description"] === "string" ? row["location_description"] : "",
      infrastructure: Array.isArray(row["infrastructure"])
        ? (row["infrastructure"] as string[])
        : [],
    });
  }
  return map;
}
