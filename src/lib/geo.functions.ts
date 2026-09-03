import { createServerFn } from "@tanstack/react-start";

export type AddressSuggestion = {
  title: string;
  subtitle: string;
  value: string;
};

export type GeoPoint = { lat: number; lon: number };


const OSM_UA = "residence-more-rm-os/1.0";

/** Запасной источник подсказок, пока ключи Яндекса не активны. */
async function osmSuggest(text: string): Promise<AddressSuggestion[]> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", text);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "ru");
    url.searchParams.set("limit", "7");
    const res = await fetch(url.toString(), { headers: { "User-Agent": OSM_UA } });
    if (!res.ok) return [];
    const json = (await res.json()) as { display_name?: string }[];
    return json
      .filter((r) => r.display_name)
      .map((r) => {
        const parts = (r.display_name as string).split(", ");
        return {
          title: parts.slice(0, 2).join(", "),
          subtitle: parts.slice(2).join(", "),
          value: r.display_name as string,
        };
      });
  } catch {
    return [];
  }
}

/** Запасное геокодирование через OpenStreetMap. */
async function osmGeocode(address: string): Promise<GeoPoint | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", address);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString(), { headers: { "User-Agent": OSM_UA } });
    if (!res.ok) return null;
    const json = (await res.json()) as { lat?: string; lon?: string }[];
    const first = json[0];
    if (!first) return null;
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

/** Ключ JavaScript API Яндекс.Карт для загрузки скрипта в браузере. */
export const getMapsApiKey = createServerFn({ method: "GET" }).handler(async () => {
  return { key: process.env["YANDEX_MAPS_JS_API_KEY"] ?? "" };
});

/** Подсказки адресов (API Геосаджеста). Ключ остаётся на сервере. */
export const suggestAddress = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string }) => ({ text: String(input?.text ?? "") }))
  .handler(async ({ data }): Promise<AddressSuggestion[]> => {
    const text = data.text.trim();
    if (text.length < 3) return [];
    const apikey = process.env["YANDEX_SUGGEST_API_KEY"];
    if (!apikey) return osmSuggest(text);

    const url = new URL("https://suggest-maps.yandex.ru/v1/suggest");
    url.searchParams.set("apikey", apikey);
    url.searchParams.set("text", text);
    url.searchParams.set("lang", "ru");
    url.searchParams.set("results", "7");
    url.searchParams.set("print_address", "1");
    url.searchParams.set("types", "house,street,locality,district");

    try {
      const res = await fetch(url.toString());
      if (!res.ok) return osmSuggest(text);
      const json = (await res.json()) as {
        results?: {
          title?: { text?: string };
          subtitle?: { text?: string };
          address?: { formatted_address?: string };
        }[];
      };
      const results = json.results ?? [];
      if (results.length === 0) return osmSuggest(text);
      return results.map((r) => {
        const title = r.title?.text ?? "";
        const subtitle = r.subtitle?.text ?? "";
        return {
          title,
          subtitle,
          value: r.address?.formatted_address ?? [subtitle, title].filter(Boolean).join(", "),
        };
      });
    } catch {
      return osmSuggest(text);
    }
  });

/** Координаты по текстовому адресу (Геокодер). */
export const geocodeAddress = createServerFn({ method: "POST" })
  .inputValidator((input: { address: string }) => ({ address: String(input?.address ?? "") }))
  .handler(async ({ data }): Promise<GeoPoint | null> => {
    const address = data.address.trim();
    if (!address) return null;
    // Ключ HTTP-геокодера отдельный; если его нет — пробуем ключ JS API.
    const apikey =
      process.env["YANDEX_GEOCODER_API_KEY"] || process.env["YANDEX_MAPS_JS_API_KEY"];
    if (!apikey) return osmGeocode(address);

    const url = new URL("https://geocode-maps.yandex.ru/1.x/");
    url.searchParams.set("apikey", apikey);
    url.searchParams.set("format", "json");
    url.searchParams.set("lang", "ru_RU");
    url.searchParams.set("results", "1");
    url.searchParams.set("geocode", address);

    try {
      const res = await fetch(url.toString());
      if (!res.ok) return osmGeocode(address);
      const json = (await res.json()) as {
        response?: {
          GeoObjectCollection?: {
            featureMember?: { GeoObject?: { Point?: { pos?: string } } }[];
          };
        };
      };
      const pos =
        json.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.Point?.pos ?? "";
      const [lonStr, latStr] = pos.split(" ");
      const lat = Number(latStr);
      const lon = Number(lonStr);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return osmGeocode(address);
      return { lat, lon };
    } catch {
      return osmGeocode(address);
    }
  });
