/** Абсолютные ссылки на публичный сайт для сообщений Telegram. */

export function siteBaseUrl(): string {
  const raw =
    process.env["PUBLIC_SITE_URL"] ||
    process.env["PUBLIC_BASE_URL"] ||
    "https://residence-more.ru";
  return raw.replace(/\/+$/, "");
}

/** Превращает относительные ссылки вида /p/CODE и /rent/ID в абсолютные. */
export function absolutizeLinks(text: string): string {
  const base = siteBaseUrl();
  return text.replace(/(^|[\s(])\/(p|rent)\/([A-Za-z0-9-]+)/g, (_m, pre: string, kind: string, id: string) =>
    `${pre}${base}/${kind}/${id}`,
  );
}

export function selectionUrl(code: string) {
  return `${siteBaseUrl()}/p/${code}`;
}

export function propertyUrl(id: string) {
  return `${siteBaseUrl()}/rent/${id}`;
}
