import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getMapsApiKey } from "@/lib/geo.functions";
import { cn } from "@/lib/utils";

type YMaps = {
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
};

declare global {
  interface Window {
    ymaps?: YMaps;
  }
}

let loader: Promise<YMaps> | null = null;

function loadYmaps(apiKey: string): Promise<YMaps> {
  if (window.ymaps) return Promise.resolve(window.ymaps);
  if (loader) return loader;
  loader = new Promise<YMaps>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
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
  });
  return loader;
}

type Props = {
  lat: number;
  lon: number;
  /** Подпись метки (обычно адрес объекта). */
  caption?: string;
  zoom?: number;
  draggable?: boolean;
  onDragEnd?: (point: { lat: number; lon: number }) => void;
  className?: string;
};

export function YandexMap({
  lat,
  lon,
  caption,
  zoom = 16,
  draggable = false,
  onDragEnd,
  className,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<InstanceType<YMaps["Map"]> | null>(null);
  const [failed, setFailed] = useState(false);
  const dragHandler = useRef(onDragEnd);
  dragHandler.current = onDragEnd;

  const { data } = useQuery({
    queryKey: ["yandex-maps-key"],
    queryFn: () => getMapsApiKey(),
    staleTime: Infinity,
  });
  const apiKey = data?.key ?? "";

  useEffect(() => {
    if (!apiKey || !container.current) return;
    let cancelled = false;

    loadYmaps(apiKey)
      .then((ymaps) => {
        if (cancelled || !container.current) return;
        if (!mapRef.current) {
          mapRef.current = new ymaps.Map(
            container.current,
            { center: [lat, lon], zoom, controls: ["zoomControl"] },
            { suppressMapOpenBlock: true },
          );
        } else {
          mapRef.current.setCenter([lat, lon], zoom);
        }
        const map = mapRef.current;
        map.geoObjects.removeAll();
        const placemark = new ymaps.Placemark(
          [lat, lon],
          { hintContent: caption ?? "", balloonContent: caption ?? "" },
          { preset: "islands#redDotIcon", draggable },
        );
        if (draggable) {
          placemark.events.add("dragend", () => {
            const [nextLat, nextLon] = placemark.geometry.getCoordinates();
            if (nextLat != null && nextLon != null) {
              dragHandler.current?.({ lat: nextLat, lon: nextLon });
            }
          });
        }
        map.geoObjects.add(placemark);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, lat, lon, zoom, caption, draggable]);

  useEffect(() => {
    return () => {
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-border bg-muted text-sm text-muted-foreground",
          className,
        )}
      >
        Карта временно недоступна
      </div>
    );
  }

  return <div ref={container} className={cn("overflow-hidden rounded-xl", className)} />;
}

export default YandexMap;
