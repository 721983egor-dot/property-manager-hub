import { z } from "zod";

const text = (max: number) => z.string().max(max).default("");
export const touchSchema = z.object({
  at: z.string().datetime(),
  landing_page: text(1200),
  referrer: text(500),
  utm_source: text(200),
  utm_medium: text(200),
  utm_campaign: text(300),
  utm_content: text(300),
  utm_term: text(300),
  yclid: text(200),
});
export const attributionSchema = z.object({
  version: z.literal(1),
  visitor_id: z.string().uuid(),
  first_touch: touchSchema,
  last_touch: touchSchema,
  page: text(1200),
  metrika_client_id: z
    .string()
    .regex(/^\d{1,32}$/)
    .or(z.literal(""))
    .default(""),
  kind: z.enum(["tenant", "owner", "service", "general"]),
});
export type MarketingTouch = z.infer<typeof touchSchema>;
export type MarketingAttribution = z.infer<typeof attributionSchema>;
export const ATTRIBUTION_TTL = 90 * 86400_000;
const KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "yclid",
] as const;

// Store only attribution parameters. Never retain arbitrary query strings (phones, tokens, messages).
export function safeMarketingUrl(value: string, referrer = false): string {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    const clean = new URL(url.origin + url.pathname);
    if (!referrer)
      for (const key of KEYS) {
        const v = url.searchParams.get(key);
        if (v)
          clean.searchParams.set(
            key,
            v.slice(0, key === "yclid" || key === "utm_source" || key === "utm_medium" ? 200 : 300),
          );
      }
    return clean.toString().slice(0, referrer ? 500 : 1200);
  } catch {
    return "";
  }
}
export function marketingKind(path: string, source = ""): MarketingAttribution["kind"] {
  if (source === "management" || /^\/management(?:\/|$)/.test(path)) return "owner";
  if (source === "service" || /^\/service(?:\/|$)/.test(path)) return "service";
  if (source === "site_cart" || /^\/rent(?:\/|$)/.test(path)) return "tenant";
  return "general";
}
export function captureTouch(href: string, referrer: string, at: string): MarketingTouch {
  const url = new URL(href);
  const values = Object.fromEntries(
    KEYS.map((key) => [
      key,
      (url.searchParams.get(key) || "").slice(
        0,
        key === "yclid" ? 200 : key === "utm_source" || key === "utm_medium" ? 200 : 300,
      ),
    ]),
  );
  return touchSchema.parse({
    at,
    landing_page: safeMarketingUrl(href),
    referrer: safeMarketingUrl(referrer, true),
    ...values,
  });
}
export function nextAttribution(
  previous: MarketingAttribution | null,
  touch: MarketingTouch,
  visitorId: string,
  kind: MarketingAttribution["kind"],
  now = Date.now(),
): MarketingAttribution {
  const valid =
    previous &&
    now - Date.parse(previous.first_touch.at) < ATTRIBUTION_TTL &&
    Date.parse(previous.first_touch.at) <= now;
  let external = false;
  try {
    external =
      !!touch.referrer && new URL(touch.referrer).origin !== new URL(touch.landing_page).origin;
  } catch {
    /* no external referrer */
  }
  const tagged = KEYS.some((key) => Boolean(touch[key]));
  const last = valid && !tagged && !external ? previous.last_touch : touch;
  return {
    version: 1,
    visitor_id: valid ? previous.visitor_id : visitorId,
    first_touch: valid ? previous.first_touch : touch,
    last_touch: last,
    page: touch.landing_page,
    metrika_client_id: valid ? previous.metrika_client_id : "",
    kind,
  };
}
export function attributionChannel(a?: MarketingAttribution | null): string {
  const parsed = attributionSchema.safeParse(a);
  if (!parsed.success) return "Источник не записан";
  const t = parsed.data.last_touch;
  if (t.yclid || (t.utm_source === "yandex" && t.utm_medium === "cpc")) return "Яндекс Директ";
  if (t.utm_source) return [t.utm_source, t.utm_medium].filter(Boolean).join(" / ");
  if (t.referrer) {
    try {
      return new URL(t.referrer).hostname;
    } catch {
      return "Переход с сайта";
    }
  }
  return "Прямой заход";
}
export function sanitizeAttribution(a: MarketingAttribution): MarketingAttribution {
  const clean = (t: MarketingTouch) => ({
    ...t,
    landing_page: safeMarketingUrl(t.landing_page),
    referrer: safeMarketingUrl(t.referrer, true),
  });
  return {
    ...a,
    first_touch: clean(a.first_touch),
    last_touch: clean(a.last_touch),
    page: safeMarketingUrl(a.page),
  };
}
