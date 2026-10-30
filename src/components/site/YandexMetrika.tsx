import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

import {
  METRIKA_ID as COUNTER_ID,
  isMarketingHost,
  isPublicMarketingPath,
} from "@/lib/site-marketing";

declare global {
  interface Window {
    ym?: ((id: number, action: string, ...args: unknown[]) => void) & { a?: unknown[] };
  }
}

/** Счётчик Яндекс.Метрики для публичного сайта (учитывает переходы между страницами). */
export function YandexMetrika() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const loaded = useRef(false);
  const lastHit = useRef("");

  const isPreview =
    process.env["PREVIEW_MODE"] === "1" ||
    (typeof window !== "undefined" &&
      (window.location.hostname.startsWith("preview.") ||
        window.location.hostname.startsWith("preview-rm-os.")));

  useEffect(() => {
    if (typeof window === "undefined" || isPreview) return;
    if (!isMarketingHost(window.location.hostname) || !isPublicMarketingPath(pathname)) return;
    const location = `${pathname}${searchStr ?? ""}`;
    if (lastHit.current === location) return;
    lastHit.current = location;

    if (!loaded.current) {
      loaded.current = true;
      const ym: NonNullable<Window["ym"]> = Object.assign(
        (...args: unknown[]) => {
          (ym.a = ym.a || []).push(args);
        },
        { l: Date.now() },
      ) as NonNullable<Window["ym"]>;
      window.ym = window.ym || ym;

      const script = document.createElement("script");
      script.async = true;
      script.src = "https://mc.yandex.ru/metrika/tag.js";
      document.head.appendChild(script);

      window.ym(COUNTER_ID, "init", {
        clickmap: true,
        trackLinks: true,
        accurateTrackBounce: true,
        webvisor: true,
      });

      return;
    }

    window.ym?.(COUNTER_ID, "hit", `${pathname}${searchStr ?? ""}`);
  }, [isPreview, pathname, searchStr]);

  if (isPreview) return null;

  return (
    <noscript>
      <div>
        <img
          src={`https://mc.yandex.ru/watch/${COUNTER_ID}`}
          style={{ position: "absolute", left: "-9999px" }}
          alt=""
        />
      </div>
    </noscript>
  );
}
