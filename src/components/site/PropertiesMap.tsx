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

type LocatedPoint = MapPoint & { coords: [number, number] };

type PinGroup = {
  key: string;
  coords: [number, number];
  items: LocatedPoint[];
};

type MapEvent = {
  preventDefault?: () => void;
  get?: (key: string) => unknown;
};

type GeoEvents = {
  add: (name: string, cb: (e: MapEvent) => void) => void;
};

type PlacemarkInstance = {
  geometry: { getCoordinates: () => [number, number] };
  options: { set: (key: string, value: unknown) => void };
  events: GeoEvents;
};

type ClustererInstance = {
  add: (items: unknown[]) => void;
  getBounds: () => number[][] | null;
  events: GeoEvents;
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
    props: { hintContent: string; iconContent?: string },
    opts: { preset: string; hasBalloon: boolean },
  ) => PlacemarkInstance;
  Clusterer: new (opts: {
    preset: string;
    groupByCoordinates: boolean;
    clusterHasBalloon: boolean;
  }) => ClustererInstance;
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

function coordKey(coords: [number, number]) {
  return `${coords[0].toFixed(4)},${coords[1].toFixed(4)}`;
}

function groupByCoords(points: LocatedPoint[]): PinGroup[] {
  const groups = new Map<string, PinGroup>();
  for (const point of points) {
    const key = coordKey(point.coords);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(point);
    } else {
      groups.set(key, { key, coords: point.coords, items: [point] });
    }
  }
  return [...groups.values()];
}

function pinPreset(count: number, selected: boolean) {
  if (count > 1) return selected ? "islands#yellowCircleIcon" : "islands#nightCircleIcon";
  return selected ? "islands#yellowCircleDotIcon" : "islands#nightCircleDotIcon";
}

function objectsCountLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} объект`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} объекта`;
  return `${count} объектов`;
}

function pinHint(group: PinGroup) {
  if (group.items.length === 1) return group.items[0].title;
  return `${objectsCountLabel(group.items.length)} в этой точке`;
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
  selectedIds = [],
  onSelect,
  onInteractiveChange,
  className,
}: {
  properties: Property[];
  selectedIds?: string[];
  onSelect?: (propertyIds: string[]) => void;
  onInteractiveChange?: (interactive: boolean) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef<Array<{ ids: string[]; placemark: PlacemarkInstance }>>([]);
  const onSelectRef = useRef(onSelect);
  const onInteractiveChangeRef = useRef(onInteractiveChange);
  const selectedIdsRef = useRef(selectedIds);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [widget, setWidget] = useState(false);
  const loadKey = useServerFn(getMapsApiKey);
  const { data, isError } = useQuery({
    queryKey: ["maps-api-key"],
    queryFn: () => loadKey(),
  });

  onSelectRef.current = onSelect;
  onInteractiveChangeRef.current = onInteractiveChange;
  selectedIdsRef.current = selectedIds;

  const points = useMemo(() => properties.map(toPoint), [properties]);
  const fingerprint = points.map((point) => point.id).join("|");
  const selectedKey = selectedIds.join("|");

  useEffect(() => {
    if (isError) setWidget(true);
  }, [isError]);

  useEffect(() => {
    onInteractiveChangeRef.current?.(!widget);
  }, [widget]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || data === undefined || widget) return;
    let cancelled = false;
    let map: InstanceType<YMaps["Map"]> | null = null;
    setReady(false);
    setError(null);
    groupsRef.current = [];

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
          (item): item is LocatedPoint => Boolean(item),
        );
        const groups = groupByCoords(located);

        map = new ymaps.Map(hostRef.current, {
          center: groups[0]?.coords ?? SOCHI,
          zoom: groups.length > 1 ? 11 : 14,
          controls: ["zoomControl", "fullscreenControl"],
        });
        if (cancelled) {
          map.destroy();
          return;
        }

        const clusterer = new ymaps.Clusterer({
          preset: "islands#invertedNightClusterIcons",
          groupByCoordinates: true,
          clusterHasBalloon: false,
        });
        const selectedSet = new Set(selectedIdsRef.current);
        const placemarks = groups.map((group) => {
          const ids = group.items.map((item) => item.id);
          const selected = ids.some((id) => selectedSet.has(id));
          const placemark = new ymaps.Placemark(
            group.coords,
            {
              hintContent: pinHint(group),
              ...(group.items.length > 1 ? { iconContent: String(group.items.length) } : {}),
            },
            {
              preset: pinPreset(group.items.length, selected),
              hasBalloon: false,
            },
          );
          placemark.events.add("click", (event) => {
            event.preventDefault?.();
            onSelectRef.current?.(ids);
          });
          groupsRef.current.push({ ids, placemark });
          return placemark;
        });
        clusterer.add(placemarks);
        clusterer.events.add("click", (event) => {
          const target = event.get?.("target");
          if (!target || typeof (target as { getGeoObjects?: unknown }).getGeoObjects === "function") {
            return;
          }
          const match = groupsRef.current.find((group) => group.placemark === target);
          if (!match) return;
          event.preventDefault?.();
          onSelectRef.current?.(match.ids);
        });
        map.geoObjects.add(clusterer);
        const bounds = clusterer.getBounds();
        if (bounds && groups.length > 1) {
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
      groupsRef.current = [];
      map?.destroy();
    };
    // selectedIds are applied in a separate effect so the map is not rebuilt on every pin click
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, fingerprint, points, widget]);

  useEffect(() => {
    const selectedSet = new Set(selectedIds);
    for (const group of groupsRef.current) {
      group.placemark.options.set("preset", pinPreset(group.ids.length, group.ids.some((id) => selectedSet.has(id))));
    }
  }, [selectedIds, selectedKey, ready]);

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
