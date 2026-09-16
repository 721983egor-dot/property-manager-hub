import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  SochiPulseBoard,
  SochiPulseForecastDay,
  SochiPulseItem,
  SochiPulseKind,
  SochiPulseRelatedPost,
  SochiPulseWeatherPayload,
} from "@/lib/sochi-pulse";

const SOCHI_LAT = 43.5853;
const SOCHI_LON = 39.7233;
const CACHE_MS = 30 * 60 * 1000;
const FETCH_MS = 12_000;
const UA = "ResidenceMorePulse/1.0 (+https://residence-more.ru)";

const WMO_LABEL: Record<number, string> = {
  0: "Ясно",
  1: "Преимущественно ясно",
  2: "Переменная облачность",
  3: "Пасмурно",
  45: "Туман",
  48: "Изморозь",
  51: "Морось",
  53: "Морось",
  55: "Сильная морось",
  61: "Небольшой дождь",
  63: "Дождь",
  65: "Сильный дождь",
  71: "Небольшой снег",
  73: "Снег",
  75: "Сильный снег",
  80: "Ливень",
  81: "Ливень",
  82: "Сильный ливень",
  95: "Гроза",
  96: "Гроза с градом",
  99: "Гроза с градом",
};

const STOP_WORDS = new Set(
  "сочи город города после этот эта эти этого этом как для что чтобы при над под или перед более менее только также уже еще ещё есть будет были была было свой свои своя когда который которая которые такой такая такие сегодня завтра вчера новость новости событие события погода день дня году года сентября августа июля июня мая апреля марта февраля января".split(
    " ",
  ),
);

type RawPulse = {
  kind: SochiPulseKind;
  fingerprint: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  startsAt: string | null;
  publishedAt: string | null;
  payload: Record<string, unknown>;
};

function wmoLabel(code: number) {
  return WMO_LABEL[code] ?? "Переменная погода";
}

function fingerprint(kind: SochiPulseKind, key: string) {
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 20);
  return `${kind}:${hash}`;
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripHtml(value: string) {
  return decodeXml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlTag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

function truncate(value: string, max = 420) {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function tokens(value: string) {
  return normalize(value)
    .split(" ")
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json, application/rss+xml, text/xml, */*", "User-Agent": UA },
    signal: AbortSignal.timeout(FETCH_MS),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function parseRss(xml: string) {
  return xml
    .split(/<item[\s>]/i)
    .slice(1)
    .map((block) => {
      const title = stripHtml(xmlTag(block, "title"));
      const link = stripHtml(xmlTag(block, "link") || xmlTag(block, "guid"));
      const description = stripHtml(xmlTag(block, "description") || xmlTag(block, "content:encoded"));
      const pubDate = xmlTag(block, "pubDate") || xmlTag(block, "dc:date");
      const source = stripHtml(xmlTag(block, "source"));
      return { title, link, description, pubDate, source };
    })
    .filter((item) => item.title);
}

function newsSourceFromTitle(title: string, fallback: string) {
  const parts = title.split(" - ");
  if (parts.length < 2) return fallback;
  const source = parts.at(-1)?.trim() ?? "";
  return source.length >= 3 && source.length <= 48 ? source : fallback;
}

function newsTitleWithoutSource(title: string, source: string) {
  if (!source) return title;
  const suffix = ` - ${source}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

function isSochiNews(title: string, summary: string) {
  return /сочи|адлер|хост[аы]|лазарев|красная поляна|сириус|сочинск/i.test(`${title} ${summary}`);
}

async function fetchWeather(): Promise<RawPulse> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${SOCHI_LAT}&longitude=${SOCHI_LON}` +
    "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,precipitation" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum" +
    "&timezone=Europe/Moscow&forecast_days=5";
  const data = JSON.parse(await fetchText(url)) as {
    current?: {
      temperature_2m?: number;
      apparent_temperature?: number;
      weather_code?: number;
      wind_speed_10m?: number;
      relative_humidity_2m?: number;
      precipitation?: number;
      time?: string;
    };
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
    };
  };
  const current = data.current ?? {};
  const code = Number(current.weather_code ?? 1);
  const label = wmoLabel(code);
  const temp = Math.round(Number(current.temperature_2m ?? 0));
  const forecast: SochiPulseForecastDay[] = (data.daily?.time ?? []).map((date, i) => {
    const dayCode = Number(data.daily?.weather_code?.[i] ?? 1);
    return {
      date,
      min: Math.round(Number(data.daily?.temperature_2m_min?.[i] ?? 0)),
      max: Math.round(Number(data.daily?.temperature_2m_max?.[i] ?? 0)),
      precipProb: Math.round(Number(data.daily?.precipitation_probability_max?.[i] ?? 0)),
      code: dayCode,
      label: wmoLabel(dayCode),
    };
  });
  const payload: SochiPulseWeatherPayload = {
    temp,
    feelsLike: Math.round(Number(current.apparent_temperature ?? temp)),
    humidity: Math.round(Number(current.relative_humidity_2m ?? 0)),
    wind: Math.round(Number(current.wind_speed_10m ?? 0)),
    precip: Number(current.precipitation ?? 0),
    code,
    label,
    forecast,
  };
  const next = forecast[1];
  const tomorrow = next
    ? `Завтра ${next.max}° / ${next.min}°, ${next.label.toLowerCase()}${next.precipProb >= 40 ? `, осадки ${next.precipProb}%` : ""}`
    : "";
  const day = (current.time ?? new Date().toISOString()).slice(0, 10);
  return {
    kind: "weather",
    fingerprint: `weather:sochi:${day}`,
    title: `Сочи: ${temp}°, ${label.toLowerCase()}`,
    summary: [`Сейчас ${temp}°, ощущается как ${payload.feelsLike}°.`, tomorrow].filter(Boolean).join(" "),
    source: "Open-Meteo",
    url: "https://open-meteo.com/",
    startsAt: null,
    publishedAt: current.time ? new Date(current.time).toISOString() : new Date().toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

async function fetchRssNews(): Promise<RawPulse[]> {
  const feeds = [
    { url: "https://sochi24.tv/rss", source: "Sochi24", sochiOnly: false },
    {
      url: "https://news.google.com/rss/search?q=%D0%A1%D0%BE%D1%87%D0%B8%20when:2d&hl=ru&gl=RU&ceid=RU:ru",
      source: "Google Новости",
      sochiOnly: true,
    },
  ];
  const collected: RawPulse[] = [];
  const feedErrors: string[] = [];
  for (const feed of feeds) {
    try {
      const xml = await fetchText(feed.url);
      for (const item of parseRss(xml).slice(0, 18)) {
        const source = newsSourceFromTitle(item.title, item.source || feed.source);
        const title = newsTitleWithoutSource(item.title, source);
        const summary = truncate(item.description || title);
        if (feed.sochiOnly && !isSochiNews(title, summary)) continue;
        const published = item.pubDate ? new Date(item.pubDate) : null;
        collected.push({
          kind: "news",
          fingerprint: fingerprint("news", item.link || title),
          title,
          summary,
          source,
          url: item.link,
          startsAt: null,
          publishedAt: published && !Number.isNaN(published.getTime()) ? published.toISOString() : new Date().toISOString(),
          payload: {},
        });
      }
    } catch (error) {
      feedErrors.push(`${feed.source}: ${error instanceof Error ? error.message : "не загрузилось"}`);
    }
  }
  if (!collected.length && feedErrors.length) throw new Error(feedErrors.join("; "));
  const seen = new Set<string>();
  return collected.filter((item) => {
    const key = normalize(item.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchEvents(): Promise<RawPulse[]> {
  const since = Math.floor(Date.now() / 1000);
  const url =
    `https://kudago.com/public-api/v1.4/events/?location=sochi&actual_since=${since}` +
    "&page_size=16&expand=place&lang=ru" +
    "&fields=id,title,short_title,description,dates,place,site_url,price";
  const data = JSON.parse(await fetchText(url)) as {
    results?: {
      id: number;
      title?: string;
      short_title?: string;
      description?: string;
      site_url?: string;
      price?: string;
      dates?: { start?: number; end?: number }[];
      place?: { title?: string; address?: string } | number | null;
    }[];
  };
  const now = Date.now() / 1000;
  return (data.results ?? []).flatMap((event) => {
    const upcoming = (event.dates ?? [])
      .filter((d) => Number(d.end ?? d.start ?? 0) >= now - 6 * 3600)
      .sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0))[0];
    if (!upcoming) return [];
    const start = upcoming.start ? new Date(Number(upcoming.start) * 1000) : null;
    const place =
      event.place && typeof event.place === "object"
        ? [event.place.title, event.place.address].filter(Boolean).join(", ")
        : "";
    const title = stripHtml(event.short_title || event.title || "Событие в Сочи");
    const summary = truncate(
      [stripHtml(event.description || ""), place, event.price].filter(Boolean).join(". "),
    );
    return [
      {
        kind: "event" as const,
        fingerprint: fingerprint("event", `kudago:${event.id}`),
        title,
        summary,
        source: "KudaGo",
        url: event.site_url || "",
        startsAt: start && !Number.isNaN(start.getTime()) ? start.toISOString() : null,
        publishedAt: start && !Number.isNaN(start.getTime()) ? start.toISOString() : new Date().toISOString(),
        payload: { place, price: event.price || "" },
      },
    ];
  });
}

async function upsertRaw(rows: RawPulse[]) {
  if (!rows.length) return;
  const fetchedAt = new Date().toISOString();
  const { error } = await supabaseAdmin.from("social_pulse_items").upsert(
    rows.map((row) => ({
      fingerprint: row.fingerprint,
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      source: row.source,
      url: row.url,
      starts_at: row.startsAt,
      published_at: row.publishedAt,
      payload: row.payload as never,
      fetched_at: fetchedAt,
    })),
    { onConflict: "fingerprint" },
  );
  if (error) throw new Error(error.message);
}

function relatedPostsFor(item: { id: string; kind: string; title: string }, posts: { id: string; status: string; topic: string; body: string; pulse_item_id: string | null }[]) {
  const words = tokens(item.title);
  const related: SochiPulseRelatedPost[] = [];
  for (const post of posts) {
    if (post.pulse_item_id === item.id) {
      related.push({ id: post.id, status: post.status, topic: post.topic || "Без темы" });
      continue;
    }
    const hay = normalize(`${post.topic} ${post.body.slice(0, 500)}`);
    if (item.kind === "weather" && /погод/.test(hay) && /сочи/.test(hay)) {
      related.push({ id: post.id, status: post.status, topic: post.topic || "Без темы" });
      continue;
    }
    if (words.length < 2) continue;
    const hits = words.filter((word) => hay.includes(word)).length;
    if (hits >= Math.min(3, Math.ceil(words.length * 0.45))) {
      related.push({ id: post.id, status: post.status, topic: post.topic || "Без темы" });
    }
  }
  const seen = new Set<string>();
  return related.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
}

function mapItem(
  row: {
    id: string;
    kind: string;
    title: string;
    summary: string;
    source: string;
    url: string;
    starts_at: string | null;
    published_at: string | null;
    payload: unknown;
  },
  posts: { id: string; status: string; topic: string; body: string; pulse_item_id: string | null }[],
): SochiPulseItem {
  const kind = row.kind as SochiPulseKind;
  return {
    id: row.id,
    kind,
    title: row.title,
    summary: row.summary,
    source: row.source,
    url: row.url,
    startsAt: row.starts_at,
    publishedAt: row.published_at,
    payload: (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>,
    relatedPosts: relatedPostsFor(row, posts),
  };
}

async function loadStored(): Promise<SochiPulseBoard> {
  const [{ data: rows, error }, postsRes] = await Promise.all([
    supabaseAdmin
      .from("social_pulse_items")
      .select("id, kind, title, summary, source, url, starts_at, published_at, payload, fetched_at")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(120),
    supabaseAdmin
      .from("social_posts")
      .select("id, status, topic, body, pulse_item_id")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);
  if (error) throw new Error(error.message);
  let posts = postsRes.data;
  if (postsRes.error && /pulse_item_id/i.test(postsRes.error.message)) {
    const fallback = await supabaseAdmin
      .from("social_posts")
      .select("id, status, topic, body")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(80);
    posts = (fallback.data ?? []).map((row) => ({ ...row, pulse_item_id: null }));
  } else if (postsRes.error) {
    posts = [];
  }
  const list = rows ?? [];
  const postRows = (posts ?? []) as {
    id: string;
    status: string;
    topic: string;
    body: string;
    pulse_item_id: string | null;
  }[];
  const weatherRows = list.filter((row) => row.kind === "weather");
  const news = list.filter((row) => row.kind === "news").slice(0, 20).map((row) => mapItem(row, postRows));
  const events = list
    .filter((row) => row.kind === "event")
    .sort((a, b) => String(a.starts_at ?? "").localeCompare(String(b.starts_at ?? "")))
    .slice(0, 12)
    .map((row) => mapItem(row, postRows));
  const weather = weatherRows[0] ? mapItem(weatherRows[0], postRows) : null;
  const fetchedAt = list.reduce<string | null>((latest, row) => {
    const at = row.fetched_at;
    if (!at) return latest;
    return !latest || at > latest ? at : latest;
  }, null);
  return { fetchedAt, weather, news, events, errors: [] };
}

async function pruneOld() {
  const newsCutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  const weatherCutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  await supabaseAdmin.from("social_pulse_items").delete().eq("kind", "news").lt("published_at", newsCutoff);
  await supabaseAdmin.from("social_pulse_items").delete().eq("kind", "event").lt("starts_at", newsCutoff);
  await supabaseAdmin.from("social_pulse_items").delete().eq("kind", "weather").lt("published_at", weatherCutoff);
}

export async function loadSochiPulse(options?: { force?: boolean }): Promise<SochiPulseBoard> {
  let cached: SochiPulseBoard = { fetchedAt: null, weather: null, news: [], events: [], errors: [] };
  try {
    cached = await loadStored();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось прочитать пульс";
    if (/does not exist|schema cache|could not find/i.test(message)) {
      throw new Error("Примените обновление системы с миграцией «Пульс Сочи».");
    }
    cached.errors.push(message);
  }

  const age = cached.fetchedAt ? Date.now() - new Date(cached.fetchedAt).getTime() : Number.POSITIVE_INFINITY;
  const fresh = Number.isFinite(age) && age < CACHE_MS;
  if (fresh && !options?.force) return cached;

  const errors: string[] = [...cached.errors];
  const settled = await Promise.allSettled([fetchWeather(), fetchRssNews(), fetchEvents()]);
  const incoming: RawPulse[] = [];
  if (settled[0].status === "fulfilled") incoming.push(settled[0].value);
  else errors.push(`Погода: ${settled[0].reason instanceof Error ? settled[0].reason.message : "не загрузилась"}`);
  if (settled[1].status === "fulfilled") incoming.push(...settled[1].value);
  else errors.push(`Новости: ${settled[1].reason instanceof Error ? settled[1].reason.message : "не загрузились"}`);
  if (settled[2].status === "fulfilled") incoming.push(...settled[2].value);
  else errors.push(`События: ${settled[2].reason instanceof Error ? settled[2].reason.message : "не загрузились"}`);

  if (incoming.length) {
    try {
      await upsertRaw(incoming);
      await pruneOld();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Не удалось сохранить пульс");
    }
  }

  try {
    const board = await loadStored();
    board.errors = errors;
    return board;
  } catch {
    return { ...cached, errors };
  }
}

export function sochiPulsePrompt(board: SochiPulseBoard): string {
  const lines: string[] = [];
  if (board.weather) lines.push(`Погода: ${board.weather.title}. ${board.weather.summary}`);
  for (const item of board.news.slice(0, 8)) {
    const posted = item.relatedPosts.length ? " (уже есть пост)" : "";
    lines.push(`Новость${posted}: ${item.title}`);
  }
  for (const item of board.events.slice(0, 6)) {
    const posted = item.relatedPosts.length ? " (уже есть пост)" : "";
    const when = item.startsAt ? ` ${item.startsAt.slice(0, 16).replace("T", " ")}` : "";
    lines.push(`Событие${posted}:${when} ${item.title}`);
  }
  if (!lines.length) return "";
  return `\n\nПульс Сочи (факты для постов, не выдумывай сверх этого):\n${lines.map((line) => `- ${line}`).join("\n")}`;
}
