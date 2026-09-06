/**
 * Сборка тела объявления для выгрузки на ЦИАН из карточки объекта RM OS.
 * Только сервер: обращается к приватному хранилищу фотографий.
 */

const PHOTO_BUCKET = "property-photos";
const PHOTO_TTL_SECONDS = 60 * 60 * 24 * 7;

type Row = Record<string, unknown>;

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && value !== null && value !== "" ? n : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Категория объявления ЦИАН по типу объекта RM OS (долгосрочная аренда). */
function cianCategory(type: string): string {
  switch (type) {
    case "house":
    case "villa":
      return "houseRent";
    case "townhouse":
      return "townhouseRent";
    default:
      return "flatRent";
  }
}

export async function buildCianOfferPayload(property: Row) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const photos = Array.isArray(property["photos"]) ? (property["photos"] as Row[]) : [];
  const paths = photos.map((p) => str(p["path"])).filter(Boolean);

  let photoUrls: string[] = [];
  if (paths.length > 0) {
    const { data } = await supabaseAdmin.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(paths, PHOTO_TTL_SECONDS);
    photoUrls = (data ?? [])
      .map((item) => item.signedUrl)
      .filter((url): url is string => Boolean(url));
  }

  const rooms = num(property["rooms"]) ?? 1;

  return {
    externalId: str(property["id"]),
    category: cianCategory(str(property["type"])),
    description: str(property["description"]),
    address: str(property["address"]),
    coordinates: {
      lat: num(property["latitude"]),
      lng: num(property["longitude"]),
    },
    totalArea: num(property["area"]),
    landArea: num(property["land_area"]),
    floorNumber: num(property["floor"]),
    floorsCount: num(property["total_floors"]),
    roomsCount: rooms === 0 ? 1 : rooms,
    isStudio: rooms === 0,
    separateWcsCount: num(property["bathrooms"]),
    bargainTerms: {
      price: num(property["price_month"]),
      currency: "rur",
      deposit: num(property["deposit"]),
      utilitiesTerms: {
        includedInPrice: false,
        price: num(property["utilities_month"]),
      },
      leaseTermType: "longTerm",
    },
    phones: [],
    photos: photoUrls.map((url, index) => ({ url, isDefault: index === 0 })),
  };
}
