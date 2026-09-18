const REFRESH_COOKIE = "rmos_rt";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
const IDB_NAME = "rmos-auth";
const IDB_STORE = "kv";

/** Стабильный ключ — не зависит от смены VITE_SUPABASE_URL между деплоями. */
export const STAFF_AUTH_STORAGE_KEY = "rm-os-auth";

export function readRefreshCookie(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${REFRESH_COOKIE}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) {
      const value = decodeURIComponent(part.slice(prefix.length)).trim();
      return value || null;
    }
  }
  return null;
}

export function writeRefreshCookie(token: string | null) {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  if (!token) {
    document.cookie = `${REFRESH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    return;
  }
  document.cookie = `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

function refreshTokenFrom(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as {
      refresh_token?: unknown;
      currentSession?: { refresh_token?: unknown };
    };
    const token = parsed.refresh_token ?? parsed.currentSession?.refresh_token;
    return typeof token === "string" && token.length > 8 ? token : null;
  } catch {
    return null;
  }
}

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
    req.onerror = () => resolve(null);
  });
}

async function idbSet(key: string, value: string | null) {
  const db = await openIdb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    if (value == null) store.delete(key);
    else store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** HttpOnly cookie на сервере — Safari на iPhone её не стирает вместе с localStorage. */
export function persistRefreshOnServer(token: string | null) {
  if (typeof window === "undefined") return Promise.resolve();
  const url = "/api/public/staff-session";
  if (!token) {
    return fetch(url, { method: "DELETE", credentials: "same-origin", keepalive: true }).then(
      () => undefined,
      () => undefined,
    );
  }
  return fetch(url, {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: token }),
  }).then(
    () => undefined,
    () => undefined,
  );
}

export type RestoredSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user: { id: string; email?: string | null };
};

export async function restoreFromServerCookie(): Promise<RestoredSession | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/api/public/staff-session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.status === 204 || !response.ok) return null;
    const payload = (await response.json()) as RestoredSession;
    if (!payload?.access_token || !payload.refresh_token || !payload.user?.id) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const key = "__rmos_ls_probe__";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return window.localStorage;
  } catch {
    return null;
  }
}

function migrateLegacySession(inner: Storage | null) {
  if (!inner) return;
  try {
    if (inner.getItem(STAFF_AUTH_STORAGE_KEY)) return;
    for (let i = 0; i < inner.length; i += 1) {
      const key = inner.key(i);
      if (!key) continue;
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const value = inner.getItem(key);
      if (!value || !refreshTokenFrom(value)) continue;
      inner.setItem(STAFF_AUTH_STORAGE_KEY, value);
      writeRefreshCookie(refreshTokenFrom(value));
      void persistRefreshOnServer(refreshTokenFrom(value));
      void idbSet(STAFF_AUTH_STORAGE_KEY, value);
      break;
    }
  } catch {
    // ignore
  }
}

/**
 * localStorage + IndexedDB + cookie + HttpOnly cookie.
 * На iPhone «закрыть из фона» убивает вкладку — серверная cookie переживает это.
 */
export function durableAuthStorage() {
  if (typeof window === "undefined") return undefined;
  const inner = safeLocalStorage();
  migrateLegacySession(inner);

  const remember = (value: string | null) => {
    const token = value ? refreshTokenFrom(value) : null;
    if (token) {
      writeRefreshCookie(token);
      void persistRefreshOnServer(token);
    }
    // null здесь НЕ чистим сервер: supabase вызывает removeItem при сбое refresh.
  };

  return {
    getItem: async (key: string) => {
      const local = inner?.getItem(key) ?? null;
      if (local) {
        remember(local);
        void idbSet(key, local);
        return local;
      }
      const stored = await idbGet(key);
      if (stored) {
        try {
          inner?.setItem(key, stored);
        } catch {
          // ignore
        }
        remember(stored);
        return stored;
      }
      return null;
    },
    setItem: async (key: string, value: string) => {
      try {
        inner?.setItem(key, value);
      } catch {
        // ignore
      }
      remember(value);
      await idbSet(key, value);
    },
    removeItem: async (key: string) => {
      // Не трогаем HttpOnly / JS cookie — иначе сбой refresh снова просит пароль.
      try {
        inner?.removeItem(key);
      } catch {
        // ignore
      }
      await idbSet(key, null);
    },
  };
}
