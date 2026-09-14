import type { SocialPlatform } from "@/lib/social";
import { SITE_ORIGIN } from "@/lib/site";

const MONEY_RE =
  /(\d[\d\s]{0,10})\s?(₽|руб(?:лей|ля)?\.?|р\.|тыс\.?)/gi;
const PHONE_RE = /(\+7|8)[\s(]*\d[\d\s()\-]{8,16}/g;
const URL_RE = /https?:\/\/\S+|www\.\S+|\b(t\.me|vk\.com|wa\.me|residence-more\.ru)\/\S*/gi;
const COMMERCIAL_LINE_RE =
  /^(условия аренды|стоимость|цена|депозит|страховой депозит|комисси|ку оплач|коммунальн|минимальн(ый|ые)? срок|скрыт(ых|ые) платеж|телефон|мессенджер|по всем вопросам|наш канал|актуальн(ые|ые объекты)|подробнее|больше объектов|арендуйте у нас|без комиссий)/i;
const SITE_URL_RE = /https?:\/\/(?:www\.)?residence-more\.ru(?:\/[^\s<]*)?/gi;
const MASKED_SITE_LINK_RE = /<a href="[^"]*">https:\/\/residence-more\.ru\/?<\/a>/gi;

const INSTAGRAM_HASHTAGS = "#residencemore #сочиаренда #жизньуморя";
const INSTAGRAM_SOFT_CTA = "Если откликается — напишите в директ.";

/** Как ссылка выглядит в VK, Telegram и Макс. Переход — на карточку из поля «Ссылка на объект». */
export const SITE_LINK_LABEL = `${SITE_ORIGIN}/`;

export function normalizeObjectUrl(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(value.includes("://") ? value : `https://${value.replace(/^\/+/, "")}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function maskedSiteLink(objectUrl: string) {
  const href = normalizeObjectUrl(objectUrl);
  if (!href) return "";
  return `<a href="${escapeAttr(href)}">${SITE_LINK_LABEL}</a>`;
}

/** В тексте поста сайт выглядит как главная, клик ведёт на карточку. */
export function applyObjectLink(text: string, objectUrl?: string) {
  const source = text.trim();
  const masked = objectUrl ? maskedSiteLink(objectUrl) : "";
  if (!source) return masked ? `Подробнее: ${masked}` : "";
  if (masked && source.includes("<a href=")) {
    const replaced = source.replace(MASKED_SITE_LINK_RE, masked);
    if (replaced !== source) return replaced;
  }
  if (masked && /https?:\/\/(?:www\.)?residence-more\.ru/i.test(source)) {
    return source.replace(SITE_URL_RE, masked);
  }
  if (!masked) return source;
  return `${source}\n\nПодробнее: ${masked}`;
}

/** Канонический текст (VK / Telegram / Макс) превращаем в обычный пост для Instagram: без цен, телефонов и оферты. */
export function toInstagramOrganic(source: string): string {
  if (!source.trim()) return "";
  const lines = source
    .replace(/\r\n/g, "\n")
    .replace(/<a [^>]*>(.*?)<\/a>/gi, "")
    .split("\n")
    .map((line) => line.trimEnd());

  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (kept.length && kept[kept.length - 1] !== "") kept.push("");
      continue;
    }
    if (COMMERCIAL_LINE_RE.test(line)) continue;
    if (/^\s*[-—•]\s*(октябрь|июнь|коммунальн|депозит|комисси|минимум|животн)/i.test(line)) continue;
    let cleaned = line
      .replace(URL_RE, "")
      .replace(PHONE_RE, "")
      .replace(MONEY_RE, "")
      .replace(/\b\d[\d\s]{2,8}\s?(в месяц|\/мес\.?)/gi, "")
      .replace(/\(\s*(без повышения на лето|лето)[^)]*\)/gi, "")
      .replace(/\b(стоимость|цена)\s*(в месяц|\/мес\.?)?/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/[|·•]\s*$/g, "")
      .replace(/^[-—•]\s*/g, "")
      .trim();
    if (!cleaned) continue;
    if (!/[а-яёa-z]{4,}/i.test(cleaned)) continue;
    if (/^(резиденция\s*[&и]\s*море)/i.test(cleaned) && cleaned.length < 80) continue;
    kept.push(cleaned);
  }

  let text = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) text = "Море, свет и спокойный Сочи. Расскажем подробнее в директ.";

  if (!/#residencemore/i.test(text) && !/#сочи/i.test(text)) {
    text = `${text}\n\n${INSTAGRAM_HASHTAGS}`;
  }
  if (!/директ|direct/i.test(text)) {
    text = text.replace(/\n+(#residencemore[\s\S]*)$/i, `\n\n${INSTAGRAM_SOFT_CTA}\n\n$1`);
    if (!/директ|direct/i.test(text)) text = `${text}\n\n${INSTAGRAM_SOFT_CTA}`;
  }
  return text.trim().slice(0, 2200);
}

export function adaptPostForPlatform(body: string, platform: SocialPlatform, objectUrl?: string): string {
  const text = body.trim();
  if (!text && !objectUrl?.trim()) return "";
  if (platform === "instagram") return toInstagramOrganic(text);
  return applyObjectLink(text, objectUrl);
}

export function bodiesForPlatforms(
  body: string,
  platforms: SocialPlatform[],
  overrides?: Partial<Record<SocialPlatform, string>>,
  objectUrl?: string,
): Record<SocialPlatform, string> {
  const result = {} as Record<SocialPlatform, string>;
  for (const platform of platforms) {
    const source = overrides?.[platform]?.trim() || body;
    result[platform] = adaptPostForPlatform(source, platform, objectUrl);
  }
  return result;
}
