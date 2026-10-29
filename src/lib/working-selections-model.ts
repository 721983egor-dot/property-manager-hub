import { z } from "zod";
export const outcomeLabels = {
  pending: "Не показан",
  shown: "Показан",
  liked: "Понравился",
  thinking: "Под вопросом",
  rejected: "Не подошёл",
} as const;
export const selectionItemSchema = z.object({
  propertyId: z.string().uuid(),
  outcome: z.enum(["pending", "shown", "liked", "thinking", "rejected"]),
  note: z.string().max(3000),
  feedback: z.string().max(3000),
});
export const workingSelectionSchema = z.object({
  id: z.string().uuid(),
  expected: z.number().int().min(0),
  name: z.string().trim().min(1).max(160),
  publicComment: z.string().max(3000),
  dealId: z.string().uuid().nullable(),
  showingDate: z
    .string()
    .refine(
      (v) =>
        v === "" ||
        (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
          !Number.isNaN(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v),
      "Проверьте дату",
    ),
  items: z
    .array(selectionItemSchema)
    .min(1)
    .max(100)
    .refine(
      (items) => new Set(items.map((i) => i.propertyId)).size === items.length,
      "Объекты не должны повторяться",
    ),
});
export type WorkingSelectionInput = z.infer<typeof workingSelectionSchema>;
export type WorkingSelectionItem = z.infer<typeof selectionItemSchema>;
export type WorkingSelection = Omit<WorkingSelectionInput, "expected"> & {
  version: number;
  code: string;
  updatedAt: string;
};
export const managerNoteSchema = z.object({
  propertyId: z.string().uuid(),
  expected: z.number().int().min(0),
  note: z.string().max(5000),
});
export function reorderSelection<T extends { propertyId: string }>(
  items: T[],
  source: string,
  target: string,
  after: boolean,
): T[] {
  const from = items.find((i) => i.propertyId === source);
  if (!from || source === target || !items.some((i) => i.propertyId === target)) return items;
  const next = items.filter((i) => i !== from);
  next.splice(next.findIndex((i) => i.propertyId === target) + (after ? 1 : 0), 0, from);
  return next;
}
