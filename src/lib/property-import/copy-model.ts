import { z } from "zod";

export const rentalCopyInputSchema = z.object({
  diskUrl: z.string(),
  address: z.string().trim().min(5).max(500),
  title: z.string().max(200).optional(),
  type: z.enum(["apartment", "aparts", "house", "villa", "townhouse"]).optional(),
  rooms: z.number().int().nonnegative().optional(),
  area: z.number().positive().optional(),
  priceMonth: z.number().positive().optional(),
  description: z.string().max(10000).optional(),
  locationDescription: z.string().max(5000).optional(),
  locationNotes: z
    .string()
    .max(3000)
    .optional()
    .describe(
      "Только сведения о районе, сообщённые владельцем: ориентиры, инфраструктура, транспорт",
    ),
});
export type RentalCopyInput = z.infer<typeof rentalCopyInputSchema>;
export const visionCopySchema = z.object({
  description: z.string().min(1).max(5000),
  visibleFeatures: z.array(z.string().max(300)).max(15),
  questions: z.array(z.string().max(300)).max(10),
});
export const locationResearchSchema = z.object({
  addressMatched: z.boolean(),
  // URI format is unsupported by the configured strict-output API; URLs are checked against real search sources below.
  facts: z.array(z.object({ text: z.string().max(500), sourceUrl: z.string().max(1000) })).max(5),
  questions: z.array(z.string().max(300)).max(5),
});

export function searchSourceUrls(output: unknown): string[] {
  const parsed = z
    .object({
      sources: z.array(z.object({ type: z.string(), url: z.string().url().optional() })).optional(),
    })
    .safeParse(output);
  return parsed.success
    ? (parsed.data.sources ?? []).flatMap((source) =>
        source.type === "url" && source.url ? [source.url] : [],
      )
    : [];
}

export function samplePhotoIndexes(count: number, maximum = 6): number[] {
  const n = Math.min(count, maximum);
  if (n <= 0) return [];
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => Math.round((i * (count - 1)) / (n - 1)));
}

export function locationSearchAddress(address: string): string {
  return address.replace(/[,;]?\s*(?:кв\.?|квартира)\s*\d+[а-яa-z/-]*.*$/i, "").trim();
}

export function fallbackRentalDescription(input: RentalCopyInput): string {
  const home = input.type === "house" || input.type === "villa" || input.type === "townhouse";
  return [
    home
      ? "Жилой дом для долгосрочной аренды."
      : input.rooms === 0
        ? "Студия для долгосрочной аренды."
        : input.rooms
          ? `${input.rooms}-комнатная квартира для долгосрочной аренды.`
          : "Объект для долгосрочной аренды.",
    input.area ? `Площадь — ${input.area} м².` : "",
    input.priceMonth
      ? `Стоимость аренды — ${input.priceMonth.toLocaleString("ru-RU")} ₽ в месяц.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Only retain claims with a URL actually cited by the provider's search result. */
export function groundedLocationCopy(
  input: RentalCopyInput,
  research: z.infer<typeof locationResearchSchema> | null,
  citedUrls: string[],
) {
  const allowed = new Set(citedUrls.filter((url) => /^https?:\/\//.test(url)));
  const facts = research?.addressMatched
    ? research.facts.filter((f) => allowed.has(f.sourceUrl))
    : [];
  const description = [
    `Расположение: ${locationSearchAddress(input.address)}.`,
    input.locationNotes?.trim(),
    ...facts.map((f) => f.text),
  ]
    .filter(Boolean)
    .join(" ");
  return {
    description,
    sources: [...new Set(facts.map((f) => f.sourceUrl))],
    verified: facts.length > 0,
    questions: facts.length
      ? research!.questions
      : input.locationNotes?.trim()
        ? []
        : [
            "Уточните ориентиры рядом, транспорт и инфраструктуру: достоверных сведений по адресу пока недостаточно.",
          ],
  };
}
