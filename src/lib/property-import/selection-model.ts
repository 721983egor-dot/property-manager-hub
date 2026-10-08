import { z } from "zod";
import { MAX_IMPORT_PHOTOS } from "./model.ts";

export const photoAssessmentSchema = z.object({
  photos: z
    .array(
      z.object({
        id: z.number().int(),
        suitable: z.boolean(),
        score: z.number().min(0).max(100),
        scene: z.string().max(500),
        reason: z.string().max(300),
      }),
    )
    .max(8),
});
export type PhotoAssessment = z.infer<typeof photoAssessmentSchema>["photos"][number];
export const photoChoiceSchema = z.object({
  ids: z.array(z.number().int()).min(1).max(MAX_IMPORT_PHOTOS),
});

/** Never silently accept missing assessments, foreign IDs or repeated IDs from a model. */
export function validateAssessments(ids: number[], photos: PhotoAssessment[]) {
  if (
    photos.length !== ids.length ||
    new Set(photos.map((p) => p.id)).size !== ids.length ||
    photos.some((p) => !ids.includes(p.id))
  )
    throw new Error("ИИ не оценил все фотографии. Повторите отбор.");
  return photos;
}
export function validatePhotoChoice(photos: PhotoAssessment[], ids: number[]) {
  if (
    !ids.length ||
    ids.length > MAX_IMPORT_PHOTOS ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !photos.some((p) => p.id === id && p.suitable))
  )
    throw new Error("ИИ вернул некорректный отбор фотографий. Повторите отбор.");
  return ids;
}

/** Resolve only previously approved paths, in the approved cover-first order. Legacy proposals are bounded. */
export function approvedPhotos<T extends { path: string }>(files: T[], paths?: string[]) {
  if (!paths) {
    if (files.length > MAX_IMPORT_PHOTOS)
      throw new Error("Нужен новый отбор фото. Отправьте ссылку повторно.");
    return files;
  }
  if (!paths.length || paths.length > MAX_IMPORT_PHOTOS || new Set(paths).size !== paths.length)
    throw new Error("Некорректный состав выбранных фото");
  return paths.map((path) => {
    const photo = files.find((file) => file.path === path);
    if (!photo) throw new Error("Выбранное фото отсутствует. Отправьте ссылку повторно.");
    return photo;
  });
}
