import { useSyncExternalStore } from "react";

/**
 * «Моя подборка» посетителя сайта: список id объектов в localStorage.
 * Синхронизируется между компонентами и вкладками браузера.
 */

const KEY = "rm_site_cart";
const HINT_KEY = "rm_site_cart_hint_seen";

const EMPTY: string[] = [];
let ids: string[] = EMPTY;
const listeners = new Set<() => void>();

function load(): string[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : EMPTY;
  } catch {
    return EMPTY;
  }
}

function persist(next: string[]) {
  ids = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // приватный режим — подборка живёт только в памяти вкладки
  }
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  ids = load();
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    ids = load();
    for (const l of listeners) l();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const siteCart = {
  has(id: string) {
    return ids.includes(id);
  },
  /** Возвращает true, если объект добавлен (false — если убран). */
  toggle(id: string): boolean {
    if (ids.includes(id)) {
      persist(ids.filter((x) => x !== id));
      return false;
    }
    persist([...ids, id]);
    return true;
  },
  remove(id: string) {
    if (!ids.includes(id)) return;
    persist(ids.filter((x) => x !== id));
  },
  clear() {
    persist([]);
  },
};

/** Подсказка «зачем подборка» показывается один раз на устройстве. */
export const cartHint = {
  seen(): boolean {
    try {
      return window.localStorage.getItem(HINT_KEY) === "1";
    } catch {
      return true;
    }
  },
  markSeen() {
    try {
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      // ignore
    }
  },
};

export function useSiteCart() {
  const current = useSyncExternalStore(subscribe, () => ids, () => EMPTY);
  return {
    ids: current,
    count: current.length,
    has: siteCart.has,
    toggle: siteCart.toggle,
    remove: siteCart.remove,
    clear: siteCart.clear,
  };
}
