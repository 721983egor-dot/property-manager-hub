import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  captureMarketing,
  getMarketingAttribution,
  isMarketingHost,
  isPublicMarketingPath,
  reachMarketingGoal,
} from "@/lib/site-marketing";
import { trackSiteMarketingEvent } from "@/lib/site-marketing.functions";
import type { MarketingAttribution } from "@/lib/marketing-attribution";
let lastPageEvent = "";
function record(
  eventType: "page_view" | "phone_click" | "telegram_click" | "whatsapp_click",
  a: MarketingAttribution,
) {
  void trackSiteMarketingEvent({
    data: { id: crypto.randomUUID(), eventType, attribution: a },
  }).catch(() => undefined);
}
export function SiteMarketing() {
  const href = useRouterState({ select: (s) => s.location.href });
  useEffect(() => {
    if (
      !isMarketingHost(window.location.hostname) ||
      !isPublicMarketingPath(window.location.pathname)
    )
      return;
    const a = captureMarketing();
    if (a && lastPageEvent !== href) {
      lastPageEvent = href;
      record("page_view", a);
    }
    const click = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.origin);
      } catch {
        return;
      }
      const eventType =
        url.protocol === "tel:"
          ? "phone_click"
          : ["t.me", "telegram.me"].includes(url.hostname) && url.pathname !== "/residencemore"
            ? "telegram_click"
            : ["wa.me", "api.whatsapp.com"].includes(url.hostname)
              ? "whatsapp_click"
              : null;
      if (!eventType) return;
      const current = captureMarketing();
      if (current) {
        record(eventType, current);
        reachMarketingGoal(`rm_${eventType}`, current.kind);
      }
    };
    document.addEventListener("click", click, true);
    // Warm ClientID asynchronously; lead collection also makes a bounded attempt at submission.
    void getMarketingAttribution();
    return () => document.removeEventListener("click", click, true);
  }, [href]);
  return null;
}
