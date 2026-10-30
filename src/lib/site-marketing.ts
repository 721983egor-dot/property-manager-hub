import {
  attributionSchema,
  captureTouch,
  nextAttribution,
  marketingKind,
  type MarketingAttribution,
} from "./marketing-attribution";
export const METRIKA_ID = 97013300;
const KEY = "rm_marketing_v1";
let memory: MarketingAttribution | null = null;
let capturedLocation = "";
export function isMarketingHost(host: string): boolean {
  return host === "residence-more.ru" || host === "www.residence-more.ru";
}
export function isPublicMarketingPath(path: string): boolean {
  return (
    path === "/" || /^\/(rent|management|service|about|contacts|blog|privacy|p)(\/|$)/.test(path)
  );
}
export function captureMarketing(): MarketingAttribution | null {
  if (
    typeof window === "undefined" ||
    !isMarketingHost(window.location.hostname) ||
    !isPublicMarketingPath(window.location.pathname)
  )
    return null;
  try {
    if (capturedLocation === window.location.href && memory) return memory;
    let previous = memory;
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) previous = attributionSchema.parse(JSON.parse(stored));
    } catch {
      /* storage may be blocked */
    }
    const touch = captureTouch(
      window.location.href,
      capturedLocation ? "" : document.referrer,
      new Date().toISOString(),
    );
    memory = nextAttribution(
      previous,
      touch,
      crypto.randomUUID(),
      marketingKind(window.location.pathname),
    );
    capturedLocation = window.location.href;
    try {
      localStorage.setItem(KEY, JSON.stringify(memory));
    } catch {
      /* keep in memory */
    }
    return memory;
  } catch {
    return null;
  }
}
export async function getMarketingAttribution(
  source = "",
): Promise<MarketingAttribution | undefined> {
  const value = captureMarketing();
  if (!value) return undefined;
  const snapshot = { ...value, kind: marketingKind(window.location.pathname, source) };
  // Blocked/slow Metrika must never block a lead. Never read private cookies.
  const clientId = await new Promise<string>((resolve) => {
    const timer = window.setTimeout(() => resolve(""), 400);
    try {
      window.ym?.(METRIKA_ID, "getClientID", (id: string) => {
        window.clearTimeout(timer);
        resolve(/^\d{1,32}$/.test(String(id)) ? String(id) : "");
      });
    } catch {
      window.clearTimeout(timer);
      resolve("");
    }
  });
  if (clientId) {
    snapshot.metrika_client_id = clientId;
    if (memory?.visitor_id === value.visitor_id) {
      memory = { ...memory, metrika_client_id: clientId };
      try {
        localStorage.setItem(KEY, JSON.stringify(memory));
      } catch {
        /* storage blocked */
      }
    }
  }
  return snapshot;
}
export function reachMarketingGoal(goal: string, kind: MarketingAttribution["kind"]) {
  if (typeof window === "undefined" || !isMarketingHost(window.location.hostname)) return;
  try {
    window.ym?.(METRIKA_ID, "reachGoal", goal, { kind });
  } catch {
    /* analytics is optional */
  }
}
