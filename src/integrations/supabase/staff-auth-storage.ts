const REFRESH_COOKIE = "rmos_rt";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

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

/**
 * localStorage плюс cookie с refresh-токеном.
 * На iPhone Safari замирает в фоне и может почистить память вкладки;
 * cookie переживает это чаще и позволяет восстановить вход.
 */
export function durableAuthStorage() {
  if (typeof window === "undefined") return undefined;
  const inner = window.localStorage;
  return {
    getItem: (key: string) => {
      const value = inner.getItem(key);
      if (value) {
        const token = refreshTokenFrom(value);
        if (token) writeRefreshCookie(token);
      }
      return value;
    },
    setItem: (key: string, value: string) => {
      inner.setItem(key, value);
      writeRefreshCookie(refreshTokenFrom(value));
    },
    removeItem: (key: string) => {
      inner.removeItem(key);
      writeRefreshCookie(null);
    },
  };
}
