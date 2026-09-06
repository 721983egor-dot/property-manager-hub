import { trackPropertyEvent, type PropertyEventType } from "@/lib/analytics.functions";

const VISITOR_KEY = "rm_visitor_id";

/** Случайный анонимный идентификатор посетителя (только браузер). */
function visitorHash(): string {
  if (typeof window === "undefined") return "";
  try {
    let v = window.localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = crypto.randomUUID();
      window.localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    return "";
  }
}

/** Отправка события по объекту. Ошибки игнорируются — статистика не должна ломать сайт. */
export function trackEvent(propertyId: string | null | undefined, eventType: PropertyEventType) {
  if (!propertyId || typeof window === "undefined") return;
  trackPropertyEvent({
    data: {
      propertyId,
      eventType,
      visitorHash: visitorHash(),
      referrer: document.referrer || "",
    },
  }).catch(() => undefined);
}
