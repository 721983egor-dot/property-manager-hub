import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";

import { getMapsApiKey } from "@/lib/geo.functions";
import { formatMoney, roomsLabel, type Property } from "@/lib/properties";
import { propertyPath } from "@/lib/seo";
import { cn } from "@/lib/utils";

type MapPoint = {
  id: string;
  title: string;
  address: string;
  href: string;
  price: string;
  rooms: string;
  lat: number | null;
  lon: number | null;
};

type YMaps = {
  ready: (cb: () => void) => void;
  Map: new (
    el: HTMLElement,
    opts: { center: [number, number]; zoom: number; controls: string[] },
  ) => {
    geoObjects: { add: (obj: unknown) => void };
    setBounds: (bounds: number[][], opts?: { checkZoomRange: boolean; zoomMargin: number }) => void;
    destroy: () => void;
  };
  Placemark: new (
    coords: [number, number],
    props: { balloonContentHeader: string; balloonContentBody: string; hintContent: string },
    opts: { preset: string },
  ) => { geometry: { getCoordinates: () => [number, number] } };
  Clusterer: new (opts: { preset: string; groupByCoordinates: boolean }) => {
    add: (items: unknown[]) => void;
    getBounds: () => number[][] | null;
  };
  geocode: (
    text: string,
    opts: { results: number },
  ) => Promise<{
    geoObjects: { get: (index: number) => { geometry: { getCoordinates: () => [number, number] } } | null };
  }>;
};

const SOCHI: [number, number] = [43.585, 39.723];
const geocodeCache = new Map<string, [number, number] | null>();

let ymapsPromise: Promise<YMaps> | null = null;

function loadYmaps(key: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const existing = (window as Window & { ymaps?: YMaps }).ymaps;
  if (existing) {
    return new Promise<YMaps>((resolve) => existing.ready(() => resolve(existing)));
  }
  if (ymapsPromise) return ymapsPromise;
  ymapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({ lang: "ru_RU" });
    if (key) params.set("apikey", key);
    script.src = `https://api-maps.yandex.ru/2.1/?${params.toString()}`;
    script.async = true;
    script.onload = () => {
      const api = (window as Window & { ymaps?: YMaps }).ymaps;
      if (!api) {
        reject(new Error("ymaps missing"));
        return;
      }
      api.ready(() => resolve(api));
    };
    script.onerror = () => reject(new Error("ymaps load failed"));
    document.head.appendChild(script);
  });
  return ymapsPromise;
}

function toPoint(property: Property): MapPoint {
  return {
    id: property.id,
    title: property.title,
    address: property.address,
    href: propertyPath(property),
    price: formatMoney(property.price_month),
    rooms: roomsLabel(property.rooms),
    lat: property.latitude,
    lon: property.longitude,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function widgetSrc(points: MapPoint[]) {
  const located = points.filter(
    (point): point is MapPoint & { lat: number; lon: number } => point.lat != null && point.lon != null,
  );
  const params = new URLSearchParams({ lang: "ru_RU", z: "11" });
  const first = located[0];
  if (first) params.set("ll", `${first.lon},${first.lat}`);
  else params.set("ll", `${SOCHI[1]},${SOCHI[0]}`);
  if (located.length > 0) {
    params.set(
      "pt",
      located.slice(0, 100).map((point) => `${point.lon},${point.lat},pm2ntl`).join("~"),
    );
  }
  return `https://yandex.ru/map-widget/v1/?${params.toString()}`;
}

export function PropertiesMap({
  properties,
  className,
}: {
  properties: Property[];
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [widget, setWidget] = useState(false);
  const loadKey = useServerFn(getMapsApiKey);
  const { data, isError } = useQuery({
    queryKey: ["maps-api-key"],
    queryFn: () => loadKey(),
  });

  const points = useMemo(() => properties.map(toPoint), [properties]);
  const fingerprint = points.map((point) => point.id).join("|");

  useEffect(() => {
    if (isError) setWidget(true);
  }, [isError]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || data === undefined || widget) return;
    let cancelled = false;
    let map: InstanceType<YMaps["Map"]> | null = null;
    setReady(false);
    setError(null);

    void (async () => {
      try {
        const ymaps = await loadYmaps(data.key ?? "");
        if (cancelled || !hostRef.current) return;

        const resolved = await Promise.all(
          points.map(async (point) => {
            if (point.lat != null && point.lon != null) {
              return { ...point, coords: [point.lat, point.lon] as [number, number] };
            }
            if (!point.address.trim()) return null;
            const cached = geocodeCache.get(point.address);
            if (cached) return { ...point, coords: cached };
            if (cached === null) return null;
            try {
              const result = await ymaps.geocode(point.address, { results: 1 });
              const geo = result.geoObjects.get(0);
              const coords = geo?.geometry.getCoordinates() ?? null;
              geocodeCache.set(point.address, coords);
              if (!coords) return null;
              return { ...point, coords };
            } catch {
              geocodeCache.set(point.address, null);
              return null;
            }
          }),
        );
        if (cancelled || !hostRef.current) return;

        const located = resolved.filter(
          (item): item is MapPoint & { coords: [number, number] } => Boolean(item),
        );

        map = new ymaps.Map(hostRef.current, {
          center: located[0]?.coords ?? SOCHI,
          zoom: located.length > 1 ? 11 : 14,
          controls: ["zoomControl", "fullscreenControl"],
        });
        if (cancelled) {
          map.destroy();
          return;
        }

        const clusterer = new ymaps.Clusterer({
          preset: "islands#invertedNightClusterIcons",
          groupByCoordinates: false,
        });
        const placemarks = located.map(
          (item) =>
            new ymaps.Placemark(
              item.coords,
              {
                balloonContentHeader: `<a href="${escapeHtml(item.href)}" style="color:#1f2a44;font-weight:600">${escapeHtml(item.title)}</a>`,
                balloonContentBody: `<p style="margin:6px 0 0;color:#64748b">${escapeHtml(item.rooms)} · ${escapeHtml(item.price)} / мес</p>`,
                hintContent: item.title,
              },
              { preset: "islands#nightCircleDotIcon" },
            ),
        );
        clusterer.add(placemarks);
        map.geoObjects.add(clusterer);
        const bounds = clusterer.getBounds();
        if (bounds && located.length > 1) {
          map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 48 });
        }
        setReady(true);
        setError(located.length === 0 ? "Для этих объектов пока нет точек на карте" : null);
      } catch {
        if (!cancelled) {
          setWidget(true);
          setReady(true);
          setError(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      map?.destroy();
    };
  }, [data, fingerprint, points]);

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-site-line bg-site-navy-soft", className)}>
      {widget ? (
        <iframe
          title="Карта объектов"
          src={widgetSrc(points)}
          allowFullScreen
          className="block h-full min-h-[420px] w-full border-0"
        />
      ) : (
        <>
          {!ready && !error ? (
            <div className="absolute inset-0 grid place-items-center text-sm text-site-muted">
              Загружаем карту…
            </div>
          ) : null}
          {error ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-site-navy-soft/90 px-6 text-center text-sm text-site-muted">
              {error}
            </div>
          ) : null}
          <div ref={hostRef} className="h-full min-h-[420px] w-full" />
        </>
      )}
    </div>
  );
}
