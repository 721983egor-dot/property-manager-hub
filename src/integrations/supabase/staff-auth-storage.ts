const REFRESH_COOKIE = "rmos_rt";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
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

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const key = "__rmos_ls_probe__";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return window.localStorage;
  } catch {
    // Приватный режим / блокировка storage — остаётся cookie.
    return null;
  }
}

/** Перенос старых ключей supabase-js → rm-os-auth после смены storageKey. */
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
      break;
    }
  } catch {
    // ignore
  }
}

/**
 * localStorage плюс cookie с refresh-токеном.
 * Cookie переживает очистку памяти вкладки на iPhone Safari.
 */
export function durableAuthStorage() {
  if (typeof window === "undefined") return undefined;
  const inner = safeLocalStorage();
  migrateLegacySession(inner);
  return {
    getItem: (key: string) => {
      const value = inner?.getItem(key) ?? null;
      if (value) {
        const token = refreshTokenFrom(value);
        if (token) writeRefreshCookie(token);
        return value;
      }
      return null;
    },
    setItem: (key: string, value: string) => {
      try {
        inner?.setItem(key, value);
      } catch {
        // quota / private mode
      }
      writeRefreshCookie(refreshTokenFrom(value));
    },
    removeItem: (key: string) => {
      // Не чистим cookie здесь: supabase-js вызывает removeItem при сбое refresh,
      // и тогда вход «забывался». Явный «Выйти» чистит cookie отдельно.
      try {
        inner?.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}
