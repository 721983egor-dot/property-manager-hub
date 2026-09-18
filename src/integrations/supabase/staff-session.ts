import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import {
  persistRefreshOnServer,
  readRefreshCookie,
  restoreFromServerCookie,
  writeRefreshCookie,
} from "@/integrations/supabase/staff-auth-storage";

async function applyRestoredSession() {
  const restored = await restoreFromServerCookie();
  if (!restored) return null;
  const { data, error } = await supabase.auth.setSession({
    access_token: restored.access_token,
    refresh_token: restored.refresh_token,
  });
  if (error || !data.session?.user) return null;
  writeRefreshCookie(data.session.refresh_token);
  void persistRefreshOnServer(data.session.refresh_token);
  return data.session;
}

async function recoverSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    if (data.session.refresh_token) {
      writeRefreshCookie(data.session.refresh_token);
      void persistRefreshOnServer(data.session.refresh_token);
    }
    return data.session;
  }
  const fromServer = await applyRestoredSession();
  if (fromServer?.user) return fromServer;
  const token = readRefreshCookie();
  if (!token) return null;
  const { data: recovered, error } = await supabase.auth.refreshSession({ refresh_token: token });
  if (error || !recovered.session?.user) return null;
  writeRefreshCookie(recovered.session.refresh_token);
  void persistRefreshOnServer(recovered.session.refresh_token);
  return recovered.session;
}

/** Актуальный пользователь без запроса /auth/v1/user — тот запрос на iPhone стирает сессию. */
export async function ensureStaffUser() {
  const session = await recoverSession();
  return session?.user ?? null;
}

export async function getFreshAccessToken() {
  const session = await recoverSession();
  const expiresAt = (session?.expires_at ?? 0) * 1000;
  if (session?.access_token && expiresAt - Date.now() > 60_000) return session.access_token;
  if (!session?.refresh_token) return session?.access_token ?? null;
  const { data } = await supabase.auth.refreshSession({ refresh_token: session.refresh_token });
  if (data.session?.refresh_token) {
    writeRefreshCookie(data.session.refresh_token);
    void persistRefreshOnServer(data.session.refresh_token);
  }
  return data.session?.access_token ?? session.access_token;
}

/** После пароля ждём HttpOnly cookie — иначе Safari на iPhone убивает вкладку раньше записи. */
export async function rememberStaffSession(session: Session | null | undefined) {
  if (!session?.refresh_token) return;
  writeRefreshCookie(session.refresh_token);
  await persistRefreshOnServer(session.refresh_token);
}

let keeperStarted = false;
let refreshInFlight: Promise<void> | null = null;

function refreshWhenVisible() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const session = await recoverSession();
      if (!session?.refresh_token) return;
      const expiresAt = (session.expires_at ?? 0) * 1000;
      if (expiresAt - Date.now() > 5 * 60_000) return;
      await supabase.auth.refreshSession({ refresh_token: session.refresh_token });
    } catch {
      // Сеть на телефоне может моргнуть — не выходим из аккаунта из-за этого.
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Обновляет токен, когда iPhone достают из кармана и Safari снова оживает. */
export function startStaffSessionKeeper() {
  if (typeof window === "undefined" || keeperStarted) return;
  keeperStarted = true;
  supabase.auth.onAuthStateChange((event, session) => {
    // SIGNED_OUT из‑за сбоя refresh cookie не чистим — только явный «Выйти».
    if (session?.refresh_token) {
      writeRefreshCookie(session.refresh_token);
      void persistRefreshOnServer(session.refresh_token);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshWhenVisible();
  });
  window.addEventListener("focus", () => {
    void refreshWhenVisible();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void refreshWhenVisible();
  });
}
