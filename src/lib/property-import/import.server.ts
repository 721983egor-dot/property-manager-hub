import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { overlayPhotoWatermark } from "@/lib/photo-watermark.server";
import { approvedPhotos } from "./selection-model";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { inspectDiskPhotos, downloadDiskPhoto } from "./disk.server";
import { matchingRentalObjects, rentalImportSchema, rentalImportSummary } from "./model";

async function possibleDuplicates(input: z.infer<typeof rentalImportSchema>) {
  const rows: { id: string; title: string; address: string; rooms: number; area: number | null }[] =
    [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin
      .from("properties")
      .select("id,title,address,rooms,area")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
  }
  return matchingRentalObjects(input, rows);
}

export async function prepareRentalImport(raw: unknown) {
  let input = rentalImportSchema.parse(raw);
  const inspection = await inspectDiskPhotos(input.diskUrl);
  const { selectRentalPhotos } = await import("./selection.server");
  const photoSelection = await selectRentalPhotos(inspection);
  const selectedFiles = approvedPhotos(inspection.files, photoSelection.selectedPaths);
  let copyReview: Awaited<ReturnType<typeof import("./copy.server").draftRentalCopy>> | null = null;
  if (!input.description?.trim() || !input.locationDescription?.trim()) {
    const { draftRentalCopy } = await import("./copy.server");
    copyReview = await draftRentalCopy(input, { ...inspection, files: selectedFiles });
    input = {
      ...input,
      description: input.description?.trim() || copyReview.description,
      locationDescription: input.locationDescription?.trim() || copyReview.locationDescription,
    };
  }
  const duplicates = await possibleDuplicates(input);
  return {
    input: {
      ...input,
      importId: crypto.randomUUID(),
      fingerprint: inspection.fingerprint,
      duplicateIds: duplicates.map((p) => p.id),
      duplicateTitles: duplicates.map((p) => p.title),
      selectedPaths: photoSelection.selectedPaths,
      photoSelection,
      ...(copyReview ? { copyReview } : {}),
    },
    summary: rentalImportSummary(
      input,
      selectedFiles,
      duplicates.map((p) => p.title),
    ),
  };
}

/** Called only by the confirmed action executor. All photos must succeed before the object is created. */
export async function executeRentalImport(raw: unknown): Promise<string> {
  const request = getRequest();
  if (new URL(request.url).pathname === "/api/public/telegram/webhook") {
    const { webhookSecret } = await import("@/lib/telegram/api.server");
    const expected = await webhookSecret();
    if (!expected || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== expected)
      throw new Error("Нет доступа");
    const actor = z
      .object({ _telegramUserId: z.number().int(), _telegramChatId: z.number().int() })
      .parse(raw);
    const { data: account } = await supabaseAdmin
      .from("telegram_accounts")
      .select("user_id,active")
      .eq("telegram_user_id", actor._telegramUserId)
      .maybeSingle();
    if (!account?.active || !account.user_id) throw new Error("Нет доступа");
    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", account.user_id)
      .in("role", ["admin", "manager"]);
    if (error || !roles?.length) throw new Error("Нет доступа");
  } else {
    const { ownerFinanceAdminClient } = await import("@/lib/finance-owner-access.server");
    await ownerFinanceAdminClient();
  }
  const input = rentalImportSchema.parse(raw);
  const confirmation = z
    .object({
      importId: z.string().uuid(),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      duplicateIds: z.array(z.string().uuid()),
      selectedPaths: z.array(z.string()).min(1).max(20).optional(),
    })
    .parse(raw);
  const resultText = (id: string) =>
    `Объект долгосрочной аренды создан в РМ ОС:\nhttps://rm-os.residence-more.ru/objects/${id}\nПубликация на сайте и площадках не включена.`;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("properties")
    .select("id")
    .eq("id", confirmation.importId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return resultText(existing.id);
  const inspection = await inspectDiskPhotos(input.diskUrl);
  if (inspection.fingerprint !== confirmation.fingerprint)
    throw new Error("Состав фото изменился после подтверждения. Отправьте ссылку повторно.");
  const duplicates = await possibleDuplicates(input);
  if (duplicates.some((p) => !confirmation.duplicateIds.includes(p.id)))
    throw new Error(
      "За время проверки появился похожий объект. Отправьте данные повторно для проверки дублей.",
    );
  const selectedFiles = approvedPhotos(inspection.files, confirmation.selectedPaths);
  const paths: string[] = [];
  let insertAttempted = false;
  try {
    for (const file of selectedFiles) {
      const source = await downloadDiskPhoto(input.diskUrl, file);
      const marked = await overlayPhotoWatermark(source);
      const path = `uploads/${crypto.randomUUID()}-logo.jpg`;
      const { error } = await supabaseAdmin.storage
        .from("property-photos")
        .upload(path, marked.bytes, {
          contentType: marked.contentType,
          cacheControl: "3600",
          upsert: false,
        });
      if (error) throw new Error(error.message);
      paths.push(path);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: last, error: refError } = await supabaseAdmin
        .from("properties")
        .select("ref_id")
        .order("ref_id", { ascending: false })
        .limit(1);
      if (refError) throw new Error(refError.message);
      insertAttempted = true;
      const { error } = await supabaseAdmin.from("properties").insert({
        id: confirmation.importId,
        ref_id: (last?.[0]?.ref_id ?? 1000) + 1,
        title: input.title,
        internal_name: input.internalName ?? "",
        type: input.type,
        address: input.address,
        rooms: input.rooms,
        area: input.area,
        price_month: input.priceMonth,
        bathrooms: input.bathrooms ?? 1,
        floor: input.floor ?? null,
        total_floors: input.totalFloors ?? null,
        complex_name: input.complexName ?? "",
        deposit: input.deposit ?? null,
        commission: input.commission ?? null,
        description: input.description ?? "",
        location_description: input.locationDescription ?? "",
        photos: paths.map((path) => ({ path })),
        status: "free",
        published: false,
        portfolio: "rm",
        for_rent: true,
      } as never);
      if (!error) return resultText(confirmation.importId);
      if (error.code !== "23505" || attempt === 2) throw new Error(error.message);
      const { data: concurrent } = await supabaseAdmin
        .from("properties")
        .select("id")
        .eq("id", confirmation.importId)
        .maybeSingle();
      if (concurrent) {
        await supabaseAdmin.storage.from("property-photos").remove(paths);
        return resultText(concurrent.id);
      }
    }
    throw new Error("Не удалось присвоить номер объекту. Повторите попытку.");
  } catch (error) {
    // A lost insert response may mean the object was committed. Never remove its photos.
    if (insertAttempted) {
      const { data: committed, error: checkError } = await supabaseAdmin
        .from("properties")
        .select("id,photos")
        .eq("id", confirmation.importId)
        .maybeSingle();
      if (checkError) throw error;
      if (committed) {
        const used = new Set((committed.photos as { path: string }[]).map((photo) => photo.path));
        const unused = paths.filter((path) => !used.has(path));
        if (unused.length) await supabaseAdmin.storage.from("property-photos").remove(unused);
        return resultText(committed.id);
      }
    }
    if (paths.length) await supabaseAdmin.storage.from("property-photos").remove(paths);
    throw error;
  }
}
