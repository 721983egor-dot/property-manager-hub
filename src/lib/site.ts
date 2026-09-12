export const SITE_ORIGIN = "https://residence-more.ru";
export const SITE_NAME = "Резиденция&Море";
export const SITE_TAGLINE = "Аренда премиум апартаментов и домов в г. Сочи";

export const SITE_PHONE_DISPLAY = "+7 (938)-442-08-09";
export const SITE_PHONE_TEL = "tel:+79384420809";
export const SITE_WHATSAPP = "https://wa.me/79384420809";
export const SITE_TELEGRAM = "https://t.me/residencemore";
export const SITE_VK = "https://vk.com/residencemore";
export const SITE_EMAIL = "residence.more@yandex.ru";
export const SITE_ADDRESS = "г. Сочи ул. Московская, д. 22, офис 72";
export const SITE_ADDRESS_SHORT = "г. Сочи ул. Московская, д. 22";
export const SITE_HOURS = "Пн-Пт 9:00 — 18:00";
export const SITE_HOURS_HEADER = "Пн-Пт 8:00 — 21:00";
export const SITE_REQUISITES =
  "ИП Мошков Егор Олегович ИНН 112105421351 ОГРНИП 322237500096645";

export const LEAD_TOPICS = [
  { value: "rent", label: "Долгосрочная аренда" },
  { value: "management", label: "Собственникам" },
  { value: "other", label: "Другое" },
] as const;

export function leadTopicLabel(value: string) {
  return LEAD_TOPICS.find((t) => t.value === value)?.label ?? value;
}

export function selectionPublicUrl(code: string): string {
  return `${SITE_ORIGIN}/p/${String(code).trim()}`;
}
