import { createServerFn } from "@tanstack/react-start";

export type AddressSuggestion = {
  title: string;
  subtitle: string;
  value: string;
};

export type GeoPoint = { lat: number; lon: number };

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
    if (!apikey) return [];

    const url = new URL("https://suggest-maps.yandex.ru/v1/suggest");
    url.searchParams.set("apikey", apikey);
    url.searchParams.set("text", text);
    url.searchParams.set("lang", "ru");
    url.searchParams.set("results", "7");
    url.searchParams.set("print_address", "1");
    url.searchParams.set("types", "house,street,locality,district");

    try {
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const json = (await res.json()) as {
        results?: {
          title?: { text?: string };
          subtitle?: { text?: string };
          address?: { formatted_address?: string };
        }[];
      };
      return (json.results ?? []).map((r) => {
        const title = r.title?.text ?? "";
        const subtitle = r.subtitle?.text ?? "";
        return {
          title,
          subtitle,
          value: r.address?.formatted_address ?? [subtitle, title].filter(Boolean).join(", "),
        };
      });
    } catch {
      return [];
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
    if (!apikey) return null;

    const url = new URL("https://geocode-maps.yandex.ru/1.x/");
    url.searchParams.set("apikey", apikey);
    url.searchParams.set("format", "json");
    url.searchParams.set("lang", "ru_RU");
    url.searchParams.set("results", "1");
    url.searchParams.set("geocode", address);

    try {
      const res = await fetch(url.toString());
      if (!res.ok) return null;
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
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { lat, lon };
    } catch {
      return null;
    }
  });
