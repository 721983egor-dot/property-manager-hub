import { useEffect } from "react";

import {
  isRmOsAppHost,
  RM_OS_PWA_MANIFEST_HREF,
  RM_OS_PWA_THEME_COLOR,
  RM_OS_PWA_TITLE,
} from "@/lib/rm-os-pwa";

function ensureMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/**
 * CRM routes often run with ssr:false, so root head may miss the Host.
 * Ensure iOS/Android install tags exist on RM OS hosts after hydrate.
 */
export function RmOsPwaHead() {
  useEffect(() => {
    if (!isRmOsAppHost(window.location.hostname)) return;

    ensureMeta("theme-color", RM_OS_PWA_THEME_COLOR);
    ensureMeta("mobile-web-app-capable", "yes");
    ensureMeta("apple-mobile-web-app-capable", "yes");
    ensureMeta("apple-mobile-web-app-status-bar-style", "default");
    ensureMeta("apple-mobile-web-app-title", RM_OS_PWA_TITLE);
    ensureMeta("application-name", RM_OS_PWA_TITLE);

    let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = RM_OS_PWA_MANIFEST_HREF;

    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      const content = viewport.getAttribute("content") || "";
      if (!content.includes("viewport-fit=cover")) {
        viewport.setAttribute(
          "content",
          content.includes("width=")
            ? `${content}, viewport-fit=cover`
            : "width=device-width, initial-scale=1, viewport-fit=cover",
        );
      }
    }
  }, []);

  return null;
}
