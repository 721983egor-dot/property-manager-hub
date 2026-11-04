/** PWA helpers for RM OS (iPhone «На экран Домой», без App Store). */

export const RM_OS_PWA_THEME_COLOR = "#f8f9fc";
export const RM_OS_PWA_TITLE = "RM OS";
export const RM_OS_PWA_MANIFEST_HREF = "/rm-os.webmanifest";

/** Hosts where the CRM app is the primary surface (not the public marketing site). */
export function isRmOsAppHost(hostname: string): boolean {
  const host = hostname.toLowerCase().split(":")[0];
  return host === "rm-os.residence-more.ru" || host === "preview-rm-os.residence-more.ru";
}

export function hostnameFromRequestHeaders(headers: Headers): string {
  const raw = headers.get("x-forwarded-host") || headers.get("host") || "";
  return raw.split(",")[0]?.trim().split(":")[0]?.toLowerCase() || "";
}

/** Meta + links for Safari / Chrome install as a standalone app. */
export function rmOsPwaHead() {
  return {
    meta: [
      { name: "theme-color", content: RM_OS_PWA_THEME_COLOR },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: RM_OS_PWA_TITLE },
      { name: "application-name", content: RM_OS_PWA_TITLE },
    ],
    links: [{ rel: "manifest", href: RM_OS_PWA_MANIFEST_HREF }],
  };
}
