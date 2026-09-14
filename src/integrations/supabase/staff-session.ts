import { supabase } from "@/integrations/supabase/client";
import {
  readRefreshCookie,
  writeRefreshCookie,
} from "@/integrations/supabase/staff-auth-storage";

async function recoverFromCookie() {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session;
  const token = readRefreshCookie();
  if (!token) return null;
  const { data: recovered } = await supabase.auth.refreshSession({ refresh_token: token });
  return recovered.session ?? null;
}

/** Актуальный пользователь без запроса /auth/v1/user — тот запрос на iPhone стирает сессию. */
export async function ensureStaffUser() {
  const session = await recoverFromCookie();
  if (session?.user) return session.user;
  const { data } = await supabase.auth.refreshSession();
  return data.session?.user ?? null;
}

export async function getFreshAccessToken() {
  const session = (await recoverFromCookie()) ?? (await supabase.auth.getSession()).data.session;
  const expiresAt = (session?.expires_at ?? 0) * 1000;
  if (session?.access_token && expiresAt - Date.now() > 60_000) return session.access_token;
  const { data } = await supabase.auth.refreshSession(
    session?.refresh_token ? { refresh_token: session.refresh_token } : undefined,
  );
  return data.session?.access_token ?? session?.access_token ?? null;
}

let keeperStarted = false;
let refreshInFlight: Promise<void> | null = null;

function refreshWhenVisible() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const cookie = readRefreshCookie();
      if (!data.session && !cookie) return;
      await supabase.auth.refreshSession(cookie ? { refresh_token: cookie } : undefined);
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
    if (event === "SIGNED_OUT") writeRefreshCookie(null);
    else if (session?.refresh_token) writeRefreshCookie(session.refresh_token);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshWhenVisible();
  });
  window.addEventListener("focus", () => {
    void refreshWhenVisible();
  });
  window.addEventListener("pageshow", () => {
    void refreshWhenVisible();
  });
}
