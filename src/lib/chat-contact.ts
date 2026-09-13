/** Контакты и имя из переписки: телефон, Telegram, площадочные заглушки. */

const GENERIC_CHAT_NAMES = new Set(["", "клиент", "клиент авито", "клиент циан", "клиент с сайта"]);

const PHONE_RE = /(?:\+7|8|7)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g;
const TELEGRAM_RE =
  /(?:@|(?:https?:\/\/)?(?:t\.me|telegram\.me)\/)([A-Za-z][A-Za-z0-9_]{4,31})/gi;

export const PREFERRED_MESSENGERS = ["Telegram", "WhatsApp", "MAX", "Телефон"] as const;
export type PreferredMessenger = (typeof PREFERRED_MESSENGERS)[number];

export function isGenericChatName(name: string) {
  return GENERIC_CHAT_NAMES.has(name.trim().toLowerCase());
}

/** Имя с площадки пишем, только если оператор ещё не задал своё. */
export function resolvedPlatformName(
  current: string | undefined,
  platformName: string | undefined,
  fallback: string,
) {
  const incoming = (platformName ?? "").trim();
  const usable = incoming && !isGenericChatName(incoming) ? incoming.slice(0, 120) : "";
  if (usable && isGenericChatName(current ?? "")) return usable;
  if ((current ?? "").trim()) return null;
  return usable || fallback;
}

export function threadClientName(name: string) {
  const trimmed = name.trim();
  if (trimmed && !isGenericChatName(trimmed)) return trimmed;
  return "Клиент";
}

export function normalizeTelegramHandle(raw: string) {
  let value = raw.trim();
  value = value.replace(/^https?:\/\//i, "");
  value = value.replace(/^(?:t\.me|telegram\.me)\//i, "");
  value = value.replace(/^@/, "");
  value = (value.split(/[/?#]/)[0] ?? "").trim();
  return value;
}

export function formatTelegramHandle(raw: string) {
  const handle = normalizeTelegramHandle(raw);
  return handle ? `@${handle}` : "";
}

export function telegramHref(raw: string) {
  const handle = normalizeTelegramHandle(raw);
  return handle ? `https://t.me/${handle}` : "";
}

export function extractPhones(text: string) {
  const found = new Set<string>();
  for (const match of text.match(PHONE_RE) ?? []) {
    const digits = match.replace(/\D/g, "");
    const normalized = digits.length === 11 && digits.startsWith("8") ? `7${digits.slice(1)}` : digits;
    if (normalized.length === 11 && normalized.startsWith("7")) found.add(`+${normalized}`);
  }
  return [...found];
}

export function extractTelegramHandles(text: string) {
  const found = new Set<string>();
  for (const match of text.matchAll(TELEGRAM_RE)) {
    const handle = normalizeTelegramHandle(match[1] ?? match[0] ?? "");
    if (handle) found.add(handle);
  }
  return [...found];
}

export type ChatContactFinds = {
  phones: string[];
  telegrams: string[];
};

export function extractChatContacts(messages: { direction: string; body: string }[]): ChatContactFinds {
  const phones = new Set<string>();
  const telegrams = new Set<string>();
  for (const message of messages) {
    if (message.direction !== "in") continue;
    for (const phone of extractPhones(message.body)) phones.add(phone);
    for (const handle of extractTelegramHandles(message.body)) telegrams.add(handle);
  }
  return { phones: [...phones], telegrams: [...telegrams] };
}

const TOKEN_RE =
  /(https?:\/\/[^\s]+)|((?:\+7|8|7)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})|(@[A-Za-z][A-Za-z0-9_]{4,31})/g;

export type ChatTextPart =
  | { type: "text"; value: string }
  | { type: "url"; value: string }
  | { type: "phone"; value: string }
  | { type: "telegram"; value: string };

export function splitChatText(text: string): ChatTextPart[] {
  const parts: ChatTextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ type: "text", value: text.slice(last, index) });
    const [full, url, phone, telegram] = match;
    if (url) parts.push({ type: "url", value: url });
    else if (phone) parts.push({ type: "phone", value: phone });
    else if (telegram) parts.push({ type: "telegram", value: telegram });
    else parts.push({ type: "text", value: full });
    last = index + full.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.length > 0 ? parts : [{ type: "text", value: text }];
}
