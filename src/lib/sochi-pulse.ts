export const SOCHI_PULSE_KINDS = ["weather", "news", "event"] as const;
export type SochiPulseKind = (typeof SOCHI_PULSE_KINDS)[number];

export type SochiPulseRelatedPost = {
  id: string;
  status: string;
  topic: string;
};

export type SochiPulseForecastDay = {
  date: string;
  min: number;
  max: number;
  precipProb: number;
  code: number;
  label: string;
};

export type SochiPulseWeatherPayload = {
  temp: number;
  feelsLike: number;
  humidity: number;
  wind: number;
  precip: number;
  code: number;
  label: string;
  forecast: SochiPulseForecastDay[];
};

export type SochiPulseItem = {
  id: string;
  kind: SochiPulseKind;
  title: string;
  summary: string;
  source: string;
  url: string;
  startsAt: string | null;
  publishedAt: string | null;
  payload: Record<string, unknown>;
  relatedPosts: SochiPulseRelatedPost[];
};

export type SochiPulseBoard = {
  fetchedAt: string | null;
  weather: SochiPulseItem | null;
  news: SochiPulseItem[];
  events: SochiPulseItem[];
  errors: string[];
};

export function pulseKindLabel(kind: SochiPulseKind) {
  if (kind === "weather") return "Погода";
  if (kind === "event") return "Событие";
  return "Новость";
}

export function pulsePostStatusLabel(status: string) {
  if (status === "draft") return "Черновик";
  if (status === "scheduled") return "В очереди";
  if (status === "published") return "Уже был пост";
  if (status === "failed") return "Пост с ошибкой";
  return status;
}
