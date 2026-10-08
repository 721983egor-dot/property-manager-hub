import { z } from "zod";

export const MAX_IMPORT_PHOTOS = 20;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_SOURCE_PHOTOS = 300;

export function diskShareUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["disk.yandex.ru", "disk.yandex.com", "yadi.sk"].includes(url.hostname) ||
    !/^\/(?:d|i)\/[^/]+\/?$/.test(url.pathname)
  )
    throw new Error("Нужна общедоступная ссылка https://disk.yandex.ru/d/… на папку или фото");
  return url.origin + url.pathname.replace(/\/$/, "");
}

export const rentalImportSchema = z
  .object({
    diskUrl: z.string().transform(diskShareUrl),
    title: z.string().trim().min(1).max(200),
    internalName: z.string().trim().max(200).optional(),
    type: z.enum(["apartment", "aparts", "house", "villa", "townhouse"]),
    address: z.string().trim().min(5).max(500),
    rooms: z.number().int().min(0).max(100),
    area: z.number().positive().max(100000),
    priceMonth: z.number().positive().max(100000000),
    floor: z.number().int().min(-5).max(200).optional(),
    totalFloors: z.number().int().positive().max(200).optional(),
    bathrooms: z.number().int().positive().max(100).optional(),
    complexName: z.string().trim().max(200).optional(),
    deposit: z.number().nonnegative().max(100000000).optional(),
    commission: z.number().nonnegative().max(100000000).optional(),
    description: z.string().max(10000).optional(),
    locationDescription: z.string().max(5000).optional(),
    locationNotes: z.string().max(3000).optional(),
  })
  .refine((v) => v.floor === undefined || v.totalFloors === undefined || v.floor <= v.totalFloors, {
    message: "Этаж не может быть выше этажности дома",
  });
export type RentalImport = z.infer<typeof rentalImportSchema>;

export function addressKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-яa-z0-9]/g, "");
}
export function matchingRentalObjects<
  T extends { address: string; rooms: number; area: number | null },
>(input: RentalImport, objects: T[]): T[] {
  const address = addressKey(input.address);
  return objects.filter(
    (p) =>
      addressKey(p.address) === address &&
      p.rooms === input.rooms &&
      (p.area === null || Math.abs(p.area - input.area) < 1),
  );
}

export function rentalImportSummary(
  input: RentalImport,
  files: { name: string }[],
  duplicates: string[],
): string {
  return [
    `Создать в РМ ОС: ${input.title}`,
    "Долгосрочная аренда · цена за месяц",
    `Адрес: ${input.address}`,
    `${input.rooms === 0 ? "Студия" : input.rooms + " комн."} · ${input.area} м²` +
      (input.floor !== undefined
        ? ` · этаж ${input.floor}${input.totalFloors ? "/" + input.totalFloors : ""}`
        : ""),
    `Аренда: ${input.priceMonth.toLocaleString("ru-RU")} ₽/мес`,
    input.internalName ? `Внутреннее название: ${input.internalName}` : "",
    input.complexName ? `ЖК: ${input.complexName}` : "",
    input.bathrooms !== undefined ? `Санузлы: ${input.bathrooms}` : "",
    input.deposit !== undefined ? `Залог: ${input.deposit.toLocaleString("ru-RU")} ₽` : "",
    input.commission !== undefined ? `Комиссия: ${input.commission.toLocaleString("ru-RU")} ₽` : "",
    input.description ? `Описание: ${input.description}` : "",
    input.locationDescription ? `Локация: ${input.locationDescription}` : "",
    `Фото: ${files.length}, с водяным знаком Резиденция Море`,
    ...files.map((f) => `• ${f.name}`),
    `Источник фото: ${input.diskUrl}`,
    duplicates.length
      ? `Возможные дубли: ${duplicates.join(", ")}. Проверьте перед подтверждением.`
      : "Совпадений по адресу, комнатам и площади не найдено.",
    "Объект появится в РМ ОС. Публикация на сайте и площадках — отдельное действие.",
  ]
    .filter(Boolean)
    .join("\n");
}
