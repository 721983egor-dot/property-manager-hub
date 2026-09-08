import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

const COUNTER_ID = 97013300;

/** Внутренние разделы RM OS — их в статистику сайта не отправляем. */
const PRIVATE_PREFIXES = [
  "/objects",
  "/complexes",
  "/crm",
  "/promo",
  "/selections",
  "/calendar",
  "/chats",
  "/assistant",
  "/system",
  "/auth",
];

declare global {
  interface Window {
    ym?: ((id: number, action: string, ...args: unknown[]) => void) & { a?: unknown[] };
  }
}

function isPublicPath(pathname: string) {
  return !PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Счётчик Яндекс.Метрики для публичного сайта (учитывает переходы между страницами). */
export function YandexMetrika() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const loaded = useRef(false);
  const firstHit = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPublicPath(pathname)) return;

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
      firstHit.current = false;
      return;
    }

    if (firstHit.current) {
      firstHit.current = false;
      return;
    }

    window.ym?.(COUNTER_ID, "hit", `${pathname}${searchStr ?? ""}`);
  }, [pathname, searchStr]);

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
