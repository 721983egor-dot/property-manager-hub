import { createServerFn } from "@tanstack/react-start";

/**
 * Синхронизация с партнёрским API Яндекс Недвижимости.
 * Нужны три значения в защищённом хранилище:
 *  - YANDEX_REALTY_TOKEN      — OAuth-токен кабинета (уже сохранён)
 *  - YANDEX_REALTY_CLIENT_ID  — clientID партнёра (пришлёт Яндекс)
 *  - YANDEX_REALTY_VERTIS_KEY — значение заголовка X-Authorization (Vertis crm-...)
 * Пока clientID не выдан, функции возвращают { configured: false } и интерфейс
 * показывает подсказку вместо ошибки.
 */

const API_BASE = "https://api.realty.yandex.net/2.0";

type YandexConfig = { token: string; clientId: string; vertisKey: string };

/** Читает ключи из окружения сервера, а при их отсутствии — из настроек площадок. */
async function readConfig(): Promise<YandexConfig | null> {
  const { getPlatformSecret } = await import("@/lib/platform-secrets.server");
  const token = await getPlatformSecret("YANDEX_REALTY_TOKEN");
  const clientId = await getPlatformSecret("YANDEX_REALTY_CLIENT_ID");
  const vertisKey = await getPlatformSecret("YANDEX_REALTY_VERTIS_KEY");
  if (!token || !clientId || !vertisKey) return null;
  return { token, clientId, vertisKey };
}


/** Запрос к API Яндекса с нужными заголовками. */
async function yandexGet(cfg: YandexConfig, path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `OAuth ${cfg.token}`,
      "X-Authorization": cfg.vertisKey.startsWith("Vertis ")
        ? cfg.vertisKey
        : `Vertis ${cfg.vertisKey}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Яндекс Недвижимость ответила ошибкой ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Яндекс Недвижимость вернула неожиданный ответ");
  }
}

export type YandexFeedStatus =
  | { configured: false }
  | {
      configured: true;
      checkedAt: string;
      total: number;
      accepted: number;
      rejected: number;
      /** Ошибки по объявлениям: внешний id и текст причины. */
      problems: { externalId: string; message: string }[];
    };

/** Статус обработки фида: сколько объявлений принято, сколько отклонено и почему. */
export const getYandexFeedStatus = createServerFn({ method: "POST" }).handler(
  async (): Promise<YandexFeedStatus> => {
    const cfg = await readConfig();

    if (!cfg) return { configured: false };

    const raw = (await yandexGet(
      cfg,
      `/crm/partners/${encodeURIComponent(cfg.clientId)}/feeds/status`,
    )) as {
      response?: Record<string, unknown>;
    } & Record<string, unknown>;
    const body = (raw.response ?? raw) as Record<string, unknown>;

    const offers = Array.isArray(body["offers"])
      ? (body["offers"] as Record<string, unknown>[])
      : [];
    const problems: { externalId: string; message: string }[] = [];
    let accepted = 0;
    let rejected = 0;

    for (const o of offers) {
      const externalId = String(o["internalId"] ?? o["id"] ?? "");
      const errors = Array.isArray(o["errors"]) ? (o["errors"] as unknown[]) : [];
      const status = String(o["status"] ?? "");
      if (errors.length > 0 || status.toLowerCase().includes("error")) {
        rejected += 1;
        const message = errors
          .map((e) =>
            typeof e === "string"
              ? e
              : String((e as Record<string, unknown>)["description"] ?? (e as Record<string, unknown>)["code"] ?? ""),
          )
          .filter(Boolean)
          .join("; ");
        problems.push({ externalId, message: message || "Объявление отклонено" });
      } else {
        accepted += 1;
      }
    }

    return {
      configured: true,
      checkedAt: new Date().toISOString(),
      total: offers.length || Number(body["total"] ?? 0),
      accepted: accepted || Number(body["accepted"] ?? 0),
      rejected: rejected || Number(body["rejected"] ?? 0),
      problems: problems.slice(0, 50),
    };
  },
);

export type YandexOfferStat = {
  externalId: string;
  views: number;
  calls: number;
};

export type YandexStatsResult =
  | { configured: false }
  | { configured: true; from: string; to: string; offers: YandexOfferStat[] };

/** Статистика по объявлениям за период (просмотры и звонки, если API их отдаёт). */
export const syncYandexStats = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => (input as { days?: number } | undefined) ?? {})
  .handler(async ({ data }): Promise<YandexStatsResult> => {
    const cfg = await readConfig();
    if (!cfg) return { configured: false };

    const days = data.days && [7, 30, 90].includes(data.days) ? data.days : 30;
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const raw = (await yandexGet(
      cfg,
      `/crm/partners/${encodeURIComponent(cfg.clientId)}/offers/stats?from=${iso(from)}&to=${iso(to)}`,
    )) as { response?: Record<string, unknown> } & Record<string, unknown>;
    const body = (raw.response ?? raw) as Record<string, unknown>;
    const list = Array.isArray(body["offers"])
      ? (body["offers"] as Record<string, unknown>[])
      : [];

    const offers: YandexOfferStat[] = list.map((o) => ({
      externalId: String(o["internalId"] ?? o["id"] ?? ""),
      views: Number(o["views"] ?? o["cardShows"] ?? 0),
      calls: Number(o["calls"] ?? 0),
    }));

    // Сохраняем в статистику площадок, чтобы графики на /promo/$id видели данные.
    if (offers.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: listings } = await supabaseAdmin
        .from("property_listings")
        .select("property_id, external_id")
        .eq("platform", "yandex");
      const byExternal = new Map<string, string>();
      for (const l of (listings ?? []) as { property_id: string; external_id: string }[]) {
        if (l.external_id) byExternal.set(l.external_id, l.property_id);
      }
      const today = iso(to);
      const rows = offers
        .map((o) => {
          const propertyId = byExternal.get(o.externalId) ?? o.externalId;
          return {
            property_id: propertyId,
            platform: "yandex" as const,
            date: today,
            views: o.views,
            calls: o.calls,
            impressions: 0,
            contact_views: 0,
            messages: 0,
            favorites: 0,
          };
        })
        .filter((r) => /^[0-9a-f-]{36}$/i.test(r.property_id));
      if (rows.length > 0) {
        await supabaseAdmin
          .from("listing_stats")
          .upsert(rows, { onConflict: "property_id,platform,date" });
      }
    }

    return { configured: true, from: iso(from), to: iso(to), offers };
  });
