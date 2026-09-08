import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Проверка входа пользователя, совместимая с self-hosted бэкендом:
 * токен валидируется запросом /auth/v1/user, а не локальной проверкой JWKS.
 */
export const requireUser = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase environment variables on the server");
  }

  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: No authorization header provided");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new Error("Unauthorized: No token provided");
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    throw new Error("Unauthorized: Invalid token");
  }

  return next({ context: { supabase, userId: data.user.id, user: data.user } });
});
