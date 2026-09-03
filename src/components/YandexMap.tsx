import { useEffect, useRef, useState } from "react";

import { geocodeInBrowser, loadYmaps, type YMaps } from "@/lib/ymaps";
import { cn } from "@/lib/utils";

type Props = {
  lat?: number | null;
  lon?: number | null;
  /** Адрес: если координат нет, точка определяется по нему в браузере. */
  address?: string;
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
  address,
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

  const hasCoords = lat != null && lon != null;

  useEffect(() => {
    if (!container.current) return;
    if (!hasCoords && !address?.trim()) return;
    let cancelled = false;
    setFailed(false);

    (async () => {
      const point = hasCoords
        ? { lat: lat as number, lon: lon as number }
        : await geocodeInBrowser(address ?? "");
      if (cancelled || !point) {
        if (!cancelled) setFailed(true);
        return;
      }
      const ymaps = await loadYmaps();
      if (cancelled || !container.current) return;
      if (!mapRef.current) {
        mapRef.current = new ymaps.Map(
          container.current,
          { center: [point.lat, point.lon], zoom, controls: ["zoomControl"] },
          { suppressMapOpenBlock: true },
        );
      } else {
        mapRef.current.setCenter([point.lat, point.lon], zoom);
      }
      const map = mapRef.current;
      map.geoObjects.removeAll();
      const placemark = new ymaps.Placemark(
        [point.lat, point.lon],
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
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [hasCoords, lat, lon, address, zoom, caption, draggable]);

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
