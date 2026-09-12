import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";
import {
  YANDEX_FEED_URL,
  YANDEX_OAUTH_URL,
} from "@/lib/yandex";
import { loadYandexFeedStatus, syncYandexListingStats } from "@/lib/yandex.server";

export type YandexFeedStatus =
  | { configured: false; oauthUrl: string; feedUrl: string }
  | {
      configured: true;
      checkedAt: string;
      feedId: string;
      feedStatus: string;
      total: number;
      accepted: number;
      rejected: number;
      problems: { externalId: string; message: string }[];
    };

export type YandexOfferStat = { externalId: string; views: number; calls: number };

export type YandexStatsResult =
  | { configured: false; oauthUrl: string; feedUrl: string }
  | { configured: true; from: string; to: string; offers: YandexOfferStat[]; synced?: number };

/** Статус обработки фида: сколько объявлений принято, сколько отклонено и почему. */
export const getYandexFeedStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async (): Promise<YandexFeedStatus> => loadYandexFeedStatus());

/** Статистика по объявлениям за период (просмотры карточки и звонки). */
export const syncYandexStats = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => (input as { days?: number } | undefined) ?? {})
  .handler(async ({ data }): Promise<YandexStatsResult> => {
    const result = await syncYandexListingStats(data.days ?? 30);
    if (!result.configured) {
      return { configured: false, oauthUrl: YANDEX_OAUTH_URL, feedUrl: YANDEX_FEED_URL };
    }
    return result;
  });
