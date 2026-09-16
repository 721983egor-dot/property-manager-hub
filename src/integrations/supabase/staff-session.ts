import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import {
  readRefreshCookie,
  writeRefreshCookie,
} from "@/integrations/supabase/staff-auth-storage";

/** Один refresh за раз — иначе ротация токенов выбивает из аккаунта. */
let refreshLock: Promise<Session | null> | null = null;

function sessionStillFresh(session: Session | null | undefined): session is Session {
  if (!session?.user || !session.access_token) return false;
  const expiresAt = (session.expires_at ?? 0) * 1000;
  return expiresAt - Date.now() > 60_000;
}

async function refreshStaffSession(preferToken?: string | null): Promise<Session | null> {
  if (refreshLock) return refreshLock;

  refreshLock = (async () => {
    try {
      const { data: existing } = await supabase.auth.getSession();
      if (sessionStillFresh(existing.session)) {
        if (existing.session.refresh_token) writeRefreshCookie(existing.session.refresh_token);
        return existing.session;
      }

      const token =
        preferToken ||
        existing.session?.refresh_token ||
        readRefreshCookie() ||
        null;

      const { data, error } = await supabase.auth.refreshSession(
        token ? { refresh_token: token } : undefined,
      );

      if (data.session?.refresh_token) {
        writeRefreshCookie(data.session.refresh_token);
        return data.session;
      }

      // Сеть/гонка: не выкидываем, если в storage ещё есть сессия.
      if (error && existing.session?.user) return existing.session;
      return data.session ?? existing.session ?? null;
    } catch {
      const { data } = await supabase.auth.getSession();
      return data.session ?? null;
    } finally {
      refreshLock = null;
    }
  })();

  return refreshLock;
}

async function recoverFromCookie() {
  const { data } = await supabase.auth.getSession();
  if (sessionStillFresh(data.session)) {
    if (data.session.refresh_token) writeRefreshCookie(data.session.refresh_token);
    return data.session;
  }
  if (data.session?.user) {
    return (await refreshStaffSession(data.session.refresh_token)) ?? data.session;
  }
  const token = readRefreshCookie();
  if (!token) return null;
  return refreshStaffSession(token);
}

/** Актуальный пользователь без запроса /auth/v1/user — тот запрос на iPhone стирает сессию. */
export async function ensureStaffUser() {
  const session = await recoverFromCookie();
  if (session?.user) return session.user;
  const recovered = await refreshStaffSession();
  return recovered?.user ?? null;
}

export async function getFreshAccessToken() {
  const session = await refreshStaffSession();
  return session?.access_token ?? null;
}

/** После успешного пароля сразу пишем refresh в cookie — до первого beforeLoad. */
export function rememberStaffSession(session: Session | null | undefined) {
  if (session?.refresh_token) writeRefreshCookie(session.refresh_token);
}

let keeperStarted = false;

function refreshWhenVisible() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  void refreshStaffSession();
}

/** Обновляет токен, когда вкладку снова открывают (iPhone / спящий ноутбук). */
export function startStaffSessionKeeper() {
  if (typeof window === "undefined" || keeperStarted) return;
  keeperStarted = true;
  supabase.auth.onAuthStateChange((event, session) => {
    // Пишем cookie при любом живом токене. SIGNED_OUT из‑за сбоя refresh
    // cookie не трогаем — иначе следующий заход снова просит пароль.
    if (session?.refresh_token) writeRefreshCookie(session.refresh_token);
    if (event === "SIGNED_OUT") {
      // Явный выход чистит cookie в AppShell; здесь ничего не делаем.
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshWhenVisible();
  });
  window.addEventListener("focus", () => {
    refreshWhenVisible();
  });
  window.addEventListener("pageshow", () => {
    refreshWhenVisible();
  });
  // Подтянуть сессию сразу при старте приложения.
  void refreshStaffSession();
}
