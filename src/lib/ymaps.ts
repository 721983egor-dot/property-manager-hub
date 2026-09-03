import { getMapsApiKey } from "@/lib/geo.functions";

export type YMaps = {
  ready: (cb: () => void) => void;
  Map: new (el: HTMLElement, state: Record<string, unknown>, opts?: Record<string, unknown>) => {
    geoObjects: { add: (o: unknown) => void; removeAll: () => void };
    setCenter: (coords: number[], zoom?: number) => void;
    destroy: () => void;
  };
  Placemark: new (
    coords: number[],
    props?: Record<string, unknown>,
    opts?: Record<string, unknown>,
  ) => {
    geometry: { getCoordinates: () => number[] };
    events: { add: (event: string, cb: (e: unknown) => void) => void };
  };
  geocode: (
    request: string,
    opts?: Record<string, unknown>,
  ) => Promise<{
    geoObjects: {
      get: (i: number) => { geometry: { getCoordinates: () => number[] } } | undefined;
      getLength: () => number;
    };
  }>;
  suggest: (
    request: string,
    opts?: Record<string, unknown>,
  ) => Promise<{ displayName: string; value: string; hl?: unknown[] }[]>;
};

declare global {
  interface Window {
    ymaps?: YMaps;
  }
}

let loader: Promise<YMaps> | null = null;
let keyPromise: Promise<string> | null = null;

function apiKey(): Promise<string> {
  if (!keyPromise) {
    keyPromise = getMapsApiKey()
      .then((r) => r.key ?? "")
      .catch(() => "");
  }
  return keyPromise;
}

/** Загружает JS API Яндекс.Карт один раз на страницу. */
export function loadYmaps(): Promise<YMaps> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.ymaps?.Map) return Promise.resolve(window.ymaps);
  if (loader) return loader;
  loader = apiKey().then(
    (key) =>
      new Promise<YMaps>((resolve, reject) => {
        if (!key) {
          reject(new Error("Нет ключа Яндекс.Карт"));
          return;
        }
        const script = document.createElement("script");
        script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
        script.async = true;
        script.onload = () => {
          const ymaps = window.ymaps;
          if (!ymaps) {
            reject(new Error("Яндекс.Карты не загрузились"));
            return;
          }
          ymaps.ready(() => resolve(ymaps));
        };
        script.onerror = () => {
          loader = null;
          reject(new Error("Не удалось загрузить Яндекс.Карты"));
        };
        document.head.appendChild(script);
      }),
  );
  return loader;
}

/** Геокодирование в браузере через JS API (работает с ключом JS API). */
export async function geocodeInBrowser(address: string) {
  const text = address.trim();
  if (!text) return null;
  try {
    const ymaps = await loadYmaps();
    const res = await ymaps.geocode(text, { results: 1 });
    const obj = res.geoObjects.get(0);
    if (!obj) return null;
    const [lat, lon] = obj.geometry.getCoordinates();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat: lat as number, lon: lon as number };
  } catch {
    return null;
  }
}

/** Подсказки адресов в браузере через JS API. */
export async function suggestInBrowser(text: string) {
  const q = text.trim();
  if (q.length < 3) return [];
  try {
    const ymaps = await loadYmaps();
    const items = await ymaps.suggest(q, { results: 7 });
    return items.map((i) => ({
      title: i.displayName || i.value,
      subtitle: "",
      value: i.value,
    }));
  } catch {
    return [];
  }
}
