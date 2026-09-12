/**
 * Сборка XML-фида Авито (автозагрузка, долгосрочная аренда).
 * Только сервер: читает объекты и публикации через сервисный клиент.
 */

import { isAvitoHouse, missingAvitoFields } from "@/lib/avito";
import { feedPhotoUrl } from "@/lib/cian-feed.server";
import type { Property } from "@/lib/properties";

type Row = Record<string, unknown>;

const PHONE = "+79384420809";
const MANAGER_NAME = "Residence More";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${name}>${esc(String(value))}</${name}>`;
}

function tagCdata(name: string, value: string): string {
  if (!value) return "";
  return `<${name}><![CDATA[${value.replace(/\]\]>/g, "]] >")}]]></${name}>`;
}

function isAvitoItemId(value: string | null | undefined): boolean {
  return Boolean(value && /^\d+$/.test(value));
}

export type AvitoFeedSelection = {
  included: { property: Property; avitoId: string | null }[];
  skipped: { property: Property; missing: string[] }[];
  autoPublish: boolean;
};

/**
 * Отбирает объекты для фида Авито: помеченные к публикации,
 * плюс все подходящие при включённой автопубликации.
 */
export async function computeAvitoFeedSelection(): Promise<AvitoFeedSelection> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: cred } = await supabaseAdmin
    .from("platform_credentials")
    .select("auto_publish")
    .eq("platform", "avito")
    .maybeSingle();
  const autoPublish = Boolean((cred as { auto_publish?: boolean } | null)?.auto_publish);

  const [{ data: properties }, { data: listings }] = await Promise.all([
    supabaseAdmin.from("properties").select("*").neq("status", "archived"),
    supabaseAdmin.from("property_listings").select("*").eq("platform", "avito"),
  ]);

  const listingByProperty = new Map(
    ((listings ?? []) as Row[]).map((listing) => [String(listing["property_id"]), listing]),
  );

  const included: AvitoFeedSelection["included"] = [];
  const skipped: AvitoFeedSelection["skipped"] = [];

  for (const row of (properties ?? []) as Row[]) {
    const property = row as unknown as Property;
    const listing = listingByProperty.get(property.id);

    const explicitlyOff = listing && listing["published"] === false;
    const explicitlyOn = listing && listing["published"] === true;
    const inFeed = !explicitlyOff && (explicitlyOn || autoPublish);
    if (!inFeed) continue;

    const missing = missingAvitoFields(property);
    if (missing.length > 0) {
      skipped.push({ property, missing });
      continue;
    }

    const externalId = String(listing?.["external_id"] || "");
    included.push({
      property,
      avitoId: isAvitoItemId(externalId) ? externalId : null,
    });
  }

  return { included, skipped, autoPublish };
}

function avitoCategory(type: Property["type"]): string {
  return isAvitoHouse(type) ? "Дома, дачи, коттеджи" : "Квартиры";
}

function avitoObjectType(type: Property["type"]): string {
  if (type === "townhouse") return "Таунхаус";
  if (type === "villa") return "Коттедж";
  return "Дом";
}

function avitoRooms(rooms: number): string {
  if (rooms <= 0) return "Студия";
  if (rooms >= 10) return "10 и более";
  return String(rooms);
}

/** Ремонт по справочнику Авито (аренда). Пустое в CRM → Евро, чтобы не падала автозагрузка. */
function avitoRenovation(repairType: string): string {
  switch (repairType) {
    case "cosmetic":
      return "Косметический";
    case "euro":
      return "Евро";
    case "design":
      return "Дизайнерский";
    case "no":
      return "Требуется";
    default:
      return "Евро";
  }
}

/** Площадь кухни: в CRM нет поля, Авито для квартир требует число — оцениваем от общей площади. */
function kitchenSpace(property: Property): number | null {
  if (property.area == null || !Number.isFinite(Number(property.area))) return null;
  const estimated = Math.round(Number(property.area) * 0.2);
  return Math.min(40, Math.max(5, estimated));
}

function leaseDeposit(property: Property): string {
  if (property.deposit == null || property.deposit <= 0) return "Без залога";
  if (property.price_month == null || property.price_month <= 0) return "1 месяц";
  const months = property.deposit / property.price_month;
  const rounded = Math.round(months * 2) / 2;
  if (rounded <= 0) return "Без залога";
  if (rounded <= 0.5) return "0,5 месяца";
  if (rounded <= 1) return "1 месяц";
  if (rounded <= 1.5) return "1,5 месяца";
  if (rounded <= 2) return "2 месяца";
  if (rounded <= 2.5) return "2,5 месяца";
  return "3 месяца";
}

/** Авито ждёт сумму залога числом, даже если залога нет. */
function depositAmount(property: Property): number {
  if (property.deposit == null || !Number.isFinite(property.deposit) || property.deposit <= 0) return 0;
  return Math.round(property.deposit);
}

/** Размер комиссии в процентах, обязателен и должен быть от 0 до 200. */
function commissionSize(property: Property): number {
  if (property.commission == null || !Number.isFinite(property.commission) || property.commission <= 0) return 0;
  return Math.min(200, Math.round(property.commission));
}

function utilitiesPaidByTenant(property: Property): boolean {
  return property.utilities_month != null && property.utilities_month > 0;
}

function balcony(property: Property): string {
  const outdoor = property.outdoor_spaces ?? [];
  if (outdoor.includes("loggia")) return "Лоджия";
  if (outdoor.includes("balcony") || outdoor.includes("terrace")) return "Балкон";
  return "";
}

function appliancesXml(property: Property): string {
  const labels: string[] = [];
  const appliances = property.appliances ?? [];
  if (appliances.includes("air_conditioner")) labels.push("Кондиционер");
  if (appliances.includes("dishwasher")) labels.push("Посудомоечная машина");
  if (appliances.includes("microwave")) labels.push("Микроволновка");
  if (appliances.includes("washer")) labels.push("Стиральная машина");
  if (labels.length === 0) return "";
  return `<LeaseAppliances>${labels.map((label) => tag("Option", label)).join("")}</LeaseAppliances>`;
}

function imagesXml(property: Property, origin: string): string {
  const items = (property.photos ?? [])
    .map((photo) => photo.path)
    .filter(Boolean)
    .slice(0, 40)
    .map((path) => `<Image url="${esc(feedPhotoUrl(origin, path))}"></Image>`)
    .join("");
  return items ? `<Images>${items}</Images>` : "";
}

function offerXml(property: Property, avitoId: string | null, origin: string): string {
  const house = isAvitoHouse(property.type);
  const renovation = avitoRenovation(property.repair_type);
  const tenantPaysUtilities = utilitiesPaidByTenant(property);
  const utilitiesPayment =
    tenantPaysUtilities && property.utilities_month != null ? Math.round(property.utilities_month) : null;
  const floors = property.total_floors != null && property.total_floors > 0 ? property.total_floors : 1;
  const kitchen = !house ? kitchenSpace(property) : null;

  return [
    "<Ad>",
    tag("Id", property.id),
    avitoId ? tag("AvitoId", avitoId) : "",
    tag("AdStatus", "Free"),
    tag("ListingFee", "Package"),
    tag("Category", avitoCategory(property.type)),
    tag("OperationType", "Сдам"),
    tag("PropertyRights", "Посредник"),
    tag("LeaseType", "На длительный срок"),
    tag("Address", property.address),
    property.latitude != null ? tag("Latitude", property.latitude) : "",
    property.longitude != null ? tag("Longitude", property.longitude) : "",
    // Rooms обязателен и для домов (ошибка автозагрузки: «Количество комнат»).
    tag("Rooms", avitoRooms(property.rooms)),
    house ? tag("ObjectType", avitoObjectType(property.type)) : "",
    !house && property.rooms > 1 ? tag("RoomType", "Изолированные") : "",
    tag("Square", property.area),
    kitchen != null ? tag("KitchenSpace", kitchen) : "",
    house && property.land_area != null ? tag("LandArea", property.land_area) : "",
    !house && property.floor != null ? tag("Floor", property.floor) : "",
    tag("Floors", floors),
    !house ? tag("HouseType", "Монолитный") : tag("WallsType", "Кирпич"),
    !house ? tag("Status", property.is_apartments ? "Апартаменты" : "Квартира") : "",
    !house ? tag("MarketType", "Вторичка") : "",
    tag("Renovation", renovation),
    tag("ChildrenAllowed", "Да"),
    tag("PetsAllowed", "Нет"),
    tag("SmokingAllowed", "Нет"),
    tag("LeaseDeposit", leaseDeposit(property)),
    tag("DepositAmount", depositAmount(property)),
    tag("LeaseCommissionSize", commissionSize(property)),
    tag("UtilityMeters", "Оплачивается арендатором"),
    tag(
      "OtherUtilities",
      tenantPaysUtilities ? "Оплачивается арендатором" : "Оплачивается собственником",
    ),
    utilitiesPayment != null ? tag("OtherUtilitiesPayment", utilitiesPayment) : "",
    balcony(property) ? tag("Balcony", balcony(property)) : "",
    appliancesXml(property),
    tag("Price", Math.round(property.price_month ?? 0)),
    tag("ContactPhone", PHONE),
    tag("ManagerName", MANAGER_NAME),
    tag("ContactMethod", "По телефону и в сообщениях"),
    tagCdata("Description", property.description.slice(0, 7500)),
    imagesXml(property, origin),
    "</Ad>",
  ].join("");
}

/** Полный XML фида автозагрузки Авито. */
export function buildAvitoFeedXml(selection: AvitoFeedSelection, origin: string): string {
  const ads = selection.included
    .map(({ property, avitoId }) => offerXml(property, avitoId, origin))
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Ads formatVersion="3" target="Avito.ru">${ads}</Ads>`;
}
