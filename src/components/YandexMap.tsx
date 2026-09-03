import { cn } from "@/lib/utils";

type Props = {
  lat?: number | null;
  lon?: number | null;
  /** Адрес объекта: используется, если координат ещё нет. */
  address?: string;
  caption?: string;
  zoom?: number;
  className?: string;
};

/**
 * Карта Яндекса через официальный виджет-iframe: работает и по координатам,
 * и по текстовому адресу, не требует ключа JS API.
 */
export function YandexMap({ lat, lon, address, zoom = 16, className }: Props) {
  const params = new URLSearchParams({ z: String(zoom), lang: "ru_RU" });
  if (lat != null && lon != null) {
    params.set("ll", `${lon},${lat}`);
    params.set("pt", `${lon},${lat},pm2rdm`);
  } else if (address?.trim()) {
    params.set("text", address.trim());
  } else {
    return null;
  }

  return (
    <iframe
      title="Карта расположения объекта"
      src={`https://yandex.ru/map-widget/v1/?${params.toString()}`}
      loading="lazy"
      allowFullScreen
      className={cn("block border-0", className)}
    />
  );
}

export default YandexMap;
