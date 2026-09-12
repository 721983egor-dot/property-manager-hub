export const SOCIAL_PLATFORMS = ["instagram", "vk", "telegram", "max"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_POST_STATUSES = [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "cancelled",
] as const;
export type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number];

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  vk: "ВКонтакте",
  telegram: "Telegram",
  max: "Макс",
};

export const STATUS_LABEL: Record<SocialPostStatus, string> = {
  draft: "Черновик",
  scheduled: "В очереди",
  publishing: "Публикуется",
  published: "Опубликован",
  failed: "Ошибка",
  cancelled: "Отменён",
};

export type SocialChannel = {
  id: string;
  platform: SocialPlatform;
  name: string;
  enabled: boolean;
  postmypost_account_id: number | null;
  postmypost_channel: string;
  external_url: string;
  last_synced_at: string | null;
  last_error: string;
};

export type SocialBrand = {
  voice: string;
  audience: string;
  hashtags: string;
  forbidden: string;
  cta: string;
  examples: string;
};

export type SocialSkill = { id: string; text: string; created_at: string };

export type SocialPostTarget = {
  id: string;
  channel_id: string;
  platform: SocialPlatform;
  body: string;
  status: string;
  postmypost_account_id: number | null;
  external_url: string;
  last_error: string;
};

export type SocialPost = {
  id: string;
  status: SocialPostStatus;
  topic: string;
  body: string;
  property_id: string | null;
  property_title: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_by: string;
  source: "manual" | "assistant";
  postmypost_publication_id: number | null;
  last_error: string;
  created_at: string;
  targets: SocialPostTarget[];
};

export type SocialPostStatsRow = {
  platform: SocialPlatform;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
};

export type SocialBoard = {
  connected: boolean;
  projectId: number | null;
  timezone: string;
  channels: SocialChannel[];
  posts: SocialPost[];
  brand: SocialBrand;
  skills: SocialSkill[];
  stats: SocialPostStatsRow[];
  postmypostAccounts: { id: number; name: string; channel: string }[];
};

export function platformLabel(value: string) {
  return PLATFORM_LABEL[value as SocialPlatform] ?? value;
}

export function statusLabel(value: string) {
  return STATUS_LABEL[value as SocialPostStatus] ?? value;
}
