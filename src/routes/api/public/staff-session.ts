import { createFileRoute } from "@tanstack/react-router";

const COOKIE = "rmos_sid";
const MAX_AGE = 60 * 60 * 24 * 180;

function cookieValue(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  const prefix = `${COOKIE}=`;
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length)).trim();
    }
  }
  return "";
}

function cookieHeader(token: string | null, secure: boolean) {
  const flags = `Path=/; SameSite=Lax${secure ? "; Secure" : ""}; HttpOnly`;
  if (!token) {
    return `${COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${flags}`;
  }
  const expires = new Date(Date.now() + MAX_AGE * 1000).toUTCString();
  return `${COOKIE}=${encodeURIComponent(token)}; Max-Age=${MAX_AGE}; Expires=${expires}; ${flags}`;
}

function isSecureRequest(request: Request) {
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol;
  return proto.includes("https");
}

async function refreshGoTrue(refreshToken: string) {
  const base = (process.env["SUPABASE_URL"] ?? "http://caddy").replace(/\/$/, "");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
  const response = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const json = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        user?: { id?: string; email?: string | null };
      }
    | null;
  if (!response.ok || !json?.access_token || !json.refresh_token || !json.user?.id) return null;
  return json;
}

/**
 * Постоянный вход RM OS на iPhone: HttpOnly cookie с refresh-токеном.
 * JS-cookie и localStorage Safari часто стирает, когда веб-приложение смахивают из фона.
 */
export const Route = createFileRoute("/api/public/staff-session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = cookieValue(request);
        if (!token) return new Response(null, { status: 204 });
        const session = await refreshGoTrue(token);
        if (!session) {
          return new Response(null, {
            status: 204,
            headers: { "Set-Cookie": cookieHeader(null, isSecureRequest(request)) },
          });
        }
        return Response.json(
          {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_in: session.expires_in,
            token_type: session.token_type ?? "bearer",
            user: { id: session.user?.id, email: session.user?.email ?? null },
          },
          {
            headers: {
              "Set-Cookie": cookieHeader(session.refresh_token ?? token, isSecureRequest(request)),
              "cache-control": "no-store",
            },
          },
        );
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { refresh_token?: string } | null;
        const token = String(body?.refresh_token ?? "").trim();
        if (token.length < 8) return new Response("Bad request", { status: 400 });
        const session = await refreshGoTrue(token);
        const stored = session?.refresh_token || token;
        return Response.json(
          { ok: true },
          { headers: { "Set-Cookie": cookieHeader(stored, isSecureRequest(request)) } },
        );
      },
      DELETE: async ({ request }) => {
        return new Response(null, {
          status: 204,
          headers: { "Set-Cookie": cookieHeader(null, isSecureRequest(request)) },
        });
      },
    },
  },
});
