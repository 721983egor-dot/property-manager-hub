import {
  formatArea,
  formatMoney,
  roomsLabel,
  typeLabel,
  type Property,
} from "@/lib/properties";
import { propertyPageHeading, propertyUrl } from "@/lib/seo";
import {
  SITE_NAME,
  SITE_PHONE_DISPLAY,
  SITE_TELEGRAM,
  SITE_WHATSAPP,
} from "@/lib/site";

const DEFAULT_TAGS = [
  "#residencemore",
  "#сочи",
  "#арендасочи",
  "#долгосрочнаяаренда",
  "#апартаментысочи",
];

export function propertyVideoTitle(property: Property) {
  const heading = propertyPageHeading(property);
  return heading.length > 100 ? `${heading.slice(0, 97)}…` : heading;
}

export function propertyVideoTags(extraHashtags: string) {
  const extra = extraHashtags
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
  return [...new Set([...DEFAULT_TAGS, ...extra])];
}

/** Описание ролика: объект, цена, ссылка, контакты и хештеги. */
export function propertyVideoDescription(property: Property, extraHashtags: string) {
  const lines: string[] = [];
  lines.push(propertyPageHeading(property));
  if (property.title.trim() && property.title.trim() !== propertyPageHeading(property)) {
    lines.push(property.title.trim());
  }
  lines.push("");
  const specs = [
    typeLabel(property.type),
    roomsLabel(property.rooms),
    property.area != null ? formatArea(property.area) : "",
    property.complex_name?.trim() ? `ЖК ${property.complex_name.trim()}` : "",
  ].filter(Boolean);
  if (specs.length) lines.push(specs.join(" · "));
  if (property.price_month != null) {
    lines.push(`Стоимость: ${formatMoney(property.price_month)} / мес`);
  }
  const about = property.description.trim().replace(/\s+/g, " ");
  if (about) {
    lines.push("");
    lines.push(about.length > 800 ? `${about.slice(0, 797)}…` : about);
  }
  lines.push("");
  lines.push(`Карточка объекта: ${propertyUrl(property)}`);
  lines.push("");
  lines.push(SITE_NAME);
  lines.push(`Телефон: ${SITE_PHONE_DISPLAY}`);
  lines.push(`WhatsApp: ${SITE_WHATSAPP}`);
  lines.push(`Telegram: ${SITE_TELEGRAM}`);
  lines.push("");
  lines.push(propertyVideoTags(extraHashtags).join(" "));
  return lines.join("\n").slice(0, 4900);
}

export function withYoutubeShortsMarkup(title: string, description: string, tags: string[]) {
  const nextTitle = title.includes("#Shorts") ? title : `${title.slice(0, 90)} #Shorts`.slice(0, 100);
  const nextDescription = description.includes("#Shorts") ? description : `#Shorts\n${description}`.slice(0, 4900);
  const nextTags = tags.some((tag) => tag.replace(/^#/, "").toLowerCase() === "shorts")
    ? tags
    : ["#Shorts", ...tags];
  return { title: nextTitle, description: nextDescription, tags: nextTags };
}
