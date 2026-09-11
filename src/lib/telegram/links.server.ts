/** Абсолютные ссылки на публичный сайт для сообщений Telegram. */

export function siteBaseUrl(): string {
  const raw =
    process.env["PUBLIC_SITE_URL"] ||
    process.env["PUBLIC_BASE_URL"] ||
    "https://residence-more.ru";
  return raw.replace(/\/+$/, "");
}

/** Адрес RM OS, где открываются сохранённые подборки сотрудников. */
export function rmOsBaseUrl(): string {
  const raw = process.env["RM_OS_URL"] || "https://rm-os.residence-more.ru";
  return raw.replace(/\/+$/, "");
}

/** Превращает относительные ссылки вида /p/CODE и /rent/ID в абсолютные. */
export function absolutizeLinks(text: string): string {
  const base = siteBaseUrl();
  return text.replace(/(^|[\s(])\/(p|rent)\/([A-Za-z0-9-]+)/g, (_m, pre: string, kind: string, id: string) =>
    `${pre}${base}/${kind}/${id}`,
  );
}

/** Ссылка на подборку для клиента — всегда на публичном сайте. */
export function selectionUrl(code: string) {
  return `${siteBaseUrl()}/p/${code}`;
}

export function propertyUrl(id: string) {
  return `${siteBaseUrl()}/rent/${id}`;
}
