import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";
import type { BnovoSyncRun } from "@/lib/hotel";

async function requireAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("admin")) throw new Error("Действие доступно только администратору");
  return supabaseAdmin;
}

async function requireStaff(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as string);
  if (!roles.includes("admin") && !roles.includes("manager")) {
    throw new Error("Нет доступа");
  }
  return supabaseAdmin;
}

export const getBnovoStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const { getPlatformSecret } = await import("@/lib/platform-secrets.server");
    const accountId = await getPlatformSecret("BNOVO_ACCOUNT_ID");
    const password = await getPlatformSecret("BNOVO_API_PASSWORD");
    const baseUrl = await getPlatformSecret("BNOVO_API_BASE_URL");
    return {
      configured: Boolean(accountId && password),
      accountId,
      hasPassword: Boolean(password),
      baseUrl,
    };
  });

function parseBnovoAccountId(value: string) {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const fromPair = trimmed.split("|")[0]?.trim() ?? "";
  if (/^\d+$/.test(fromPair)) return fromPair;
  return "";
}

export const saveBnovoSettings = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    (input: unknown) =>
      input as { accountId: string; password: string; baseUrl: string },
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdmin(context.userId);
    const accountId = parseBnovoAccountId(data.accountId);
    const password = data.password.trim() || (!accountId ? data.accountId.trim() : "");
    if (!accountId) {
      throw new Error(
        "ID аккаунта Bnovo — это число с экрана «API-доступ», не длинный ключ. Ключ вставьте в поле «API-ключ».",
      );
    }
    const { setPlatformSecret } = await import("@/lib/platform-secrets.server");
    await setPlatformSecret("BNOVO_ACCOUNT_ID", accountId);
    if (password) await setPlatformSecret("BNOVO_API_PASSWORD", password);
    await setPlatformSecret("BNOVO_API_BASE_URL", data.baseUrl.trim());
    const { clearBnovoToken } = await import("@/lib/bnovo.server");
    clearBnovoToken();
    return { ok: true };
  });

export const testBnovoConnection = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { loadBnovoCredentials } = await import("@/lib/bnovo-sync.server");
    const { bnovoAuth, clearBnovoToken } = await import("@/lib/bnovo.server");
    const creds = await loadBnovoCredentials();
    if (!creds) throw new Error("Сначала сохраните ID аккаунта и ключ API");
    if (!/^\d+$/.test(creds.accountId)) {
      throw new Error(
        "ID аккаунта Bnovo должен быть числом. Длинную строку оставьте в API-ключе, число возьмите на экране Octopus → API-доступ.",
      );
    }
    clearBnovoToken();
    try {
      await bnovoAuth(creds);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка Bnovo";
      if (/целым числом|integer/i.test(message)) {
        throw new Error(
          "Bnovo не принял ID: нужно число аккаунта, а не API-ключ. Откройте Octopus → API-доступ и скопируйте «ID аккаунта».",
        );
      }
      throw error;
    }
    return { ok: true };
  });

export const runBnovoSync = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => input as { from?: string; to?: string } | undefined)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { syncBnovoBookings } = await import("@/lib/bnovo-sync.server");
    return syncBnovoBookings(data ?? undefined);
  });

export const listBnovoSyncRuns = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }): Promise<BnovoSyncRun[]> => {
    const admin = await requireStaff(context.userId);
    const { data, error } = await admin
      .from("bnovo_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as BnovoSyncRun[];
  });
