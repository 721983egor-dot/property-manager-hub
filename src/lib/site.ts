export const SITE_NAME = "Резиденция & Море";
export const SITE_TAGLINE = "Аренда недвижимости в Сочи";

export const SITE_PHONE_DISPLAY = "+7 938 500-00-24";
export const SITE_PHONE_TEL = "tel:+79385000024";
export const SITE_WHATSAPP = "https://wa.me/79385000024";
export const SITE_TELEGRAM = "https://t.me/ResidenceMore";
export const SITE_EMAIL = "info@residence-more.ru";
export const SITE_ADDRESS =
  "г. Сочи, ул. Войкова 1/1, офис 110, БЦ «Войковый»";
export const SITE_REQUISITES =
  "ИП Шапиев Эльнур Исламович, ИНН 231031523810, ОГРНИП 32523000004373";

export const LEAD_TOPICS = [
  { value: "rent", label: "Хочу снять" },
  { value: "management", label: "Управление недвижимостью" },
  { value: "selection", label: "Персональный подбор" },
  { value: "sale", label: "Хочу продать" },
  { value: "cooperation", label: "Сотрудничество" },
  { value: "other", label: "Другой вопрос" },
] as const;

export function leadTopicLabel(value: string) {
  return LEAD_TOPICS.find((t) => t.value === value)?.label ?? value;
}
