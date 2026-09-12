/** Публичные ссылки сайта для клиентов. Только сервер. */

const DEFAULT_ORIGIN = "https://residence-more.ru";

export function siteOrigin(): string {
  const raw =
    process.env["PUBLIC_SITE_URL"] ||
    process.env["SITE_ORIGIN"] ||
    process.env["PUBLIC_SITE_ORIGIN"] ||
    process.env["PUBLIC_ORIGIN"] ||
    DEFAULT_ORIGIN;
  return raw.replace(/^http:\/\//i, "https://").replace(/\/$/, "");
}

export function selectionUrl(code: string): string {
  return `${siteOrigin()}/p/${String(code).trim()}`;
}

/** Превращает `/p/КОД` в полную https-ссылку — иначе Telegram показывает её текстом. */
export function absolutizeLinks(text: string): string {
  const origin = siteOrigin();
  return String(text ?? "")
    .replace(/(^|[\s(])\/p\/([A-Z0-9]+)\b/gi, `$1${origin}/p/$2`)
    .replace(/\]\(\/p\/([A-Z0-9]+)\)/gi, `](${origin}/p/$1)`);
}

export function firstSelectionUrl(text: string): string | null {
  const match = String(text ?? "").match(/https?:\/\/[^\s)]+\/p\/[A-Z0-9]+/i);
  return match?.[0] ?? null;
}
