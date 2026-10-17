import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { crmAccess } from "@/lib/crm-results.server";
import { seal, unseal, sealBytes, openBytes } from "./crypto.server";
import {
  identitySchema,
  identityMissing,
  blankIdentity,
  leaseInputSchema,
  validateLease,
  type Identity,
  type LeaseInput,
  type LeaseSnapshot,
  type LeaseTemplate,
} from "./model";
const db = supabaseAdmin as unknown as SupabaseClient;
export async function leaseActor(input?: Record<string, unknown>) {
  const access = await crmAccess(input);
  if (access.actor) return access.actor;
  const user = await access.db.auth.getUser();
  if (user.error || !user.data.user) throw new Error("Требуется вход администратора");
  return user.data.user.id;
}
function check<T extends { error: unknown }>(r: T) {
  if (r.error) throw new Error("Не удалось сохранить или прочитать данные договора");
  return r;
}
export async function leaseAudit(actor: string, event: string, id?: string) {
  check(
    await db.from("activity_log").insert({
      table_name: "lease_documents",
      record_id: id ?? null,
      action: event,
      summary: "Документы аренды: " + event,
      changes: { actor_id: actor },
    }),
  );
}
async function identity(clientId: string) {
  const r = check(
    await db.from("lease_identities").select("cipher").eq("client_id", clientId).maybeSingle(),
  );
  return r.data
    ? identitySchema.parse(unseal(r.data.cipher, "identity:" + clientId))
    : blankIdentity();
}
export async function leaseContext(
  params: {
    bookingId?: string | undefined;
    dealId?: string | undefined;
    propertyId?: string | undefined;
    clientId?: string;
  },
  actor: string,
) {
  let propertyId = params.propertyId,
    clientId = params.clientId,
    bookingId = params.bookingId;
  let deal = null;
  if (params.dealId) {
    const r = check(
      await db
        .from("deals")
        .select("id,title,pipeline,client_id,property_id,closed_property_id,booking_id")
        .eq("id", params.dealId)
        .single(),
    );
    deal = r.data;
    if (!deal) throw new Error("Сделка не найдена");
    if (deal.pipeline !== "rental") throw new Error("Выберите сделку аренды");
    propertyId = deal.closed_property_id || deal.property_id;
    clientId = deal.client_id;
    bookingId = bookingId || deal.booking_id;
  }
  let booking = null;
  if (bookingId) {
    booking = check(
      await db
        .from("bookings")
        .select("*,booking_price_periods(start_date,end_date,price_month)")
        .eq("id", bookingId)
        .single(),
    ).data;
    if (
      (propertyId && booking.property_id !== propertyId) ||
      (clientId && booking.client_id !== clientId)
    )
      throw new Error("Бронь относится к другому объекту или клиенту");
    propertyId = booking.property_id;
    clientId = booking.client_id;
  }
  const [templates, clients, profile] = await Promise.all([
    db.from("lease_templates").select("*").order("name"),
    db.from("clients").select("id,full_name,party_kind").order("full_name").limit(1000),
    db.from("lease_company_profile").select("cipher").eq("id", 1).maybeSingle(),
  ]);
  check(templates);
  check(clients);
  check(profile);
  let property = null,
    bookings: unknown[] = [];
  if (propertyId) {
    property = check(
      await db
        .from("properties")
        .select("id,title,internal_name,address,service_type,portfolio")
        .eq("id", propertyId)
        .single(),
    ).data;
    if (!property) throw new Error("Объект не найден");
    if (property.portfolio !== "rm") throw new Error("Договоры пока доступны для объектов РМ ОС");
    let q = db
      .from("bookings")
      .select("id,start_date,end_date,client_id,clients(full_name)")
      .eq("property_id", propertyId)
      .eq("stay_kind", "long_term")
      .neq("status", "cancelled")
      .order("start_date", { ascending: false })
      .limit(100);
    if (clientId) q = q.eq("client_id", clientId);
    bookings = check(await q).data ?? [];
  }
  let draft = null,
    documents: unknown[] = [];
  if (bookingId) {
    const d = check(
      await db.from("lease_drafts").select("cipher").eq("booking_id", bookingId).maybeSingle(),
    );
    draft = d.data ? unseal(d.data.cipher, "draft:" + bookingId) : null;
    documents =
      check(
        await db
          .from("lease_documents")
          .select("id,booking_id,version,status,files,created_at,template_revision")
          .eq("booking_id", bookingId)
          .order("version", { ascending: false }),
      ).data ?? [];
    if (!deal) {
      deal = check(
        await db.from("deals").select("id,title").eq("booking_id", bookingId).maybeSingle(),
      ).data;
    }
  }
  await leaseAudit(actor, "OPEN", bookingId || clientId);
  return {
    property,
    booking,
    bookings,
    deal,
    clientId,
    tenant: clientId ? await identity(clientId) : blankIdentity(),
    templates: templates.data as LeaseTemplate[],
    clients: clients.data,
    profile: profile.data ? unseal(profile.data.cipher, "company:1") : null,
    draft,
    documents,
  };
}
export async function saveLeaseIdentity(actor: string, clientId: string, data: unknown) {
  const p = identitySchema.parse(data);
  const c = check(await db.from("clients").select("id").eq("id", clientId).single());
  if (!c.data) throw new Error("Клиент не найден");
  check(
    await db.from("lease_identities").upsert({
      client_id: clientId,
      cipher: seal(p, "identity:" + clientId),
      last_four: p.number.slice(-4),
      updated_at: new Date().toISOString(),
    }),
  );
  await leaseAudit(actor, "SAVE_IDENTITY", clientId);
  return { saved: true };
}
export async function readLeaseIdentity(actor: string, clientId: string) {
  await leaseAudit(actor, "READ_IDENTITY", clientId);
  return identity(clientId);
}
export async function saveLeaseDraft(actor: string, input: unknown) {
  const p = input as { bookingId: string };
  if (!p.bookingId) throw new Error("Сначала выберите бронь");
  check(await db.from("bookings").select("id").eq("id", p.bookingId).single());
  check(
    await db.from("lease_drafts").upsert({
      booking_id: p.bookingId,
      cipher: seal(input, "draft:" + p.bookingId),
      updated_at: new Date().toISOString(),
    }),
  );
  await leaseAudit(actor, "SAVE_DRAFT", p.bookingId);
  return { saved: true };
}
export async function saveLeaseTemplate(actor: string, data: Record<string, unknown>) {
  const { z } = await import("zod");
  const v = z
    .object({
      id: z.string().uuid(),
      revision: z.number().int(),
      name: z.string().min(1).max(200),
      body: z.string().min(50).max(80000),
      pets_clause: z.string().max(20000),
      act_body: z.string().max(40000),
      inventory_body: z.string().max(40000),
      approved: z.boolean(),
    })
    .parse(data);
  if (v.approved) {
    for (const macro of [
      "tenant_passport",
      "landlord",
      "address",
      "start",
      "end",
      "rent",
      "deposit",
      "payment_day",
    ])
      if (!v.body.includes("{{" + macro + "}}"))
        throw new Error("В шаблоне отсутствует обязательное поле {{" + macro + "}}");
    if (/ПРОЕКТ ШАБЛОНА|\[Вставьте/i.test(v.body + v.pets_clause))
      throw new Error("Сначала замените демонстрационный текст своим шаблоном");
  }
  const { id, revision, ...row } = v;
  const r = check(
    await db
      .from("lease_templates")
      .update({ ...row, revision: revision + 1, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("revision", revision)
      .select("id")
      .single(),
  );
  if (!r.data) throw new Error("Шаблон уже изменён. Обновите страницу");
  await leaseAudit(actor, "SAVE_TEMPLATE", id);
  return { saved: true };
}
export async function saveLeaseProfile(actor: string, data: unknown) {
  const p = leaseInputSchema.shape.company.parse(data);
  check(
    await db
      .from("lease_company_profile")
      .upsert({ id: 1, cipher: seal(p, "company:1"), updated_at: new Date().toISOString() }),
  );
  await leaseAudit(actor, "SAVE_COMPANY");
  return { saved: true };
}
export async function storePassportDraft(
  actor: string,
  chatId: number | null,
  candidate: Partial<Identity>,
  sourceKey: string,
) {
  await db.from("lease_passport_drafts").delete().lt("expires_at", new Date().toISOString());
  let q = db
    .from("lease_passport_drafts")
    .select("id,cipher")
    .eq("actor_id", actor)
    .eq("source_key", sourceKey)
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(1);
  q = chatId === null ? q.is("chat_id", null) : q.eq("chat_id", chatId);
  const prev = check(await q.maybeSingle()).data;
  const id = prev?.id || randomUUID();
  const old = prev ? unseal<Identity>(prev.cipher, "passport:" + id) : blankIdentity();
  if (
    (candidate.series && old.series && candidate.series !== old.series) ||
    (candidate.number && old.number && candidate.number !== old.number)
  )
    throw new Error(
      "В одном альбоме обнаружены разные паспорта. Отправьте страницы каждого человека отдельным альбомом",
    );
  const p = identitySchema.parse({
    ...old,
    ...Object.fromEntries(
      Object.entries(candidate).filter(([, v]) => typeof v === "string" && v.trim()),
    ),
  });
  check(
    await db.from("lease_passport_drafts").upsert({
      id,
      actor_id: actor,
      chat_id: chatId,
      source_key: sourceKey,
      cipher: seal(p, "passport:" + id),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    }),
  );
  return { id, identity: p, missing: identityMissing(p) };
}
export async function passportDraft(actor: string, id: string) {
  const d = check(
    await db
      .from("lease_passport_drafts")
      .select("cipher")
      .eq("id", id)
      .eq("actor_id", actor)
      .gt("expires_at", new Date().toISOString())
      .single(),
  ).data;
  if (!d) throw new Error("Черновик паспорта истёк");
  return identitySchema.parse(unseal(d.cipher, "passport:" + id));
}
export async function buildLeaseSnapshot(raw: unknown, actor: string) {
  const i = leaseInputSchema.parse(raw);
  if (i.passportDraftId) i.tenant = await passportDraft(actor, i.passportDraftId);
  const context = await leaseContext(
    { bookingId: i.bookingId, ...(i.dealId ? { dealId: i.dealId } : {}) },
    actor,
  );
  const t = context.templates.find((t) => t.id === i.templateId);
  if (!t || !context.booking || !context.property) throw new Error("Выберите бронь и шаблон");
  if (context.booking.updated_at !== i.bookingVersion || t.revision !== i.templateVersion)
    throw new Error("Бронь или шаблон изменились. Обновите форму и проверьте условия");
  return {
    input: i,
    template: t,
    booking: context.booking,
    property: {
      id: context.property.id,
      address: context.property.address || "",
      title: context.property.internal_name || context.property.title,
      service_type: context.property.service_type,
    },
    createdOn: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" }),
    number: "РМ-" + i.requestId.slice(0, 8).toUpperCase(),
  } satisfies LeaseSnapshot;
}
export async function generateLease(raw: unknown, actor: string) {
  const s = await buildLeaseSnapshot(raw, actor);
  validateLease(s);
  const id = s.input.requestId;
  const hash = createHash("sha256").update(JSON.stringify(s)).digest("hex");
  const identities = [
    {
      client_id: s.booking.client_id,
      cipher: seal(s.input.tenant, "identity:" + s.booking.client_id),
      last_four: s.input.tenant.number.slice(-4),
    },
  ];
  if (s.input.ownerClientId && s.input.signerMode !== "company")
    identities.push({
      client_id: s.input.ownerClientId,
      cipher: seal(s.input.owner, "identity:" + s.input.ownerClientId),
      last_four: s.input.owner.number.slice(-4),
    });
  const reserved = check(
    await db.rpc("lease_begin_document", {
      p_id: id,
      p_request: id,
      p_booking: s.booking.id,
      p_deal: s.input.dealId,
      p_template: s.template.id,
      p_revision: s.template.revision,
      p_hash: hash,
      p_snapshot: seal(s, "document:" + id),
      p_booking_updated: s.booking.updated_at,
      p_identities: identities,
      p_actor: actor,
    }),
  ).data;
  if (reserved.existing) return { id: reserved.id, version: reserved.version, status: "existing" };
  try {
    const { renderLeaseFiles } = await import("./render.server");
    const files = await renderLeaseFiles(s);
    for (const [kind, bytes] of Object.entries(files)) {
      const path = id + "/" + kind + ".bin";
      const result = await db.storage
        .from("lease-private")
        .upload(path, sealBytes(bytes, "file:" + id + ":" + kind), {
          upsert: true,
          contentType: "application/octet-stream",
        });
      if (result.error) throw new Error("Не удалось сохранить файл договора");
    }
    check(
      await db
        .from("lease_documents")
        .update({
          status: s.template.approved ? "prepared" : "draft",
          files: { pdf: true, docx: true },
        })
        .eq("id", id)
        .eq("status", "building"),
    );
    await leaseAudit(actor, "GENERATE", id);
    return { id, version: reserved.version, status: s.template.approved ? "prepared" : "draft" };
  } catch (e) {
    await db
      .from("lease_documents")
      .update({ status: "failed" })
      .eq("id", id)
      .eq("status", "building");
    throw e;
  }
}
export async function leaseFile(actor: string, id: string, format: string) {
  if (!["pdf", "docx", "signed"].includes(format)) throw new Error("Неподдерживаемый формат");
  const d = check(
    await db.from("lease_documents").select("id,status,version,files").eq("id", id).single(),
  ).data;
  if (!d) throw new Error("Документ не найден");
  if (!["draft", "prepared", "signed"].includes(d.status) || !d.files?.[format])
    throw new Error("Файл ещё не готов");
  const file = await db.storage.from("lease-private").download(id + "/" + format + ".bin");
  if (file.error || !file.data) throw new Error("Файл не найден");
  await leaseAudit(actor, "DOWNLOAD", id);
  return {
    bytes: openBytes(new Uint8Array(await file.data.arrayBuffer()), "file:" + id + ":" + format),
    filename: `RM-lease-v${d.version}.${format === "signed" ? "pdf" : format}`,
    type:
      format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf",
  };
}
export async function saveSignedLease(actor: string, id: string, bytes: Buffer) {
  if (bytes.length > 15 * 1024 * 1024 || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw new Error("Загрузите подписанный PDF до 15 МБ");
  const d = check(
    await db.from("lease_documents").select("id,status,files").eq("id", id).single(),
  ).data;
  if (!d) throw new Error("Документ не найден");
  if (d.status !== "prepared")
    throw new Error(
      "Подписанный экземпляр добавляется к сформированному договору по утверждённому шаблону",
    );
  const upload = await db.storage
    .from("lease-private")
    .upload(id + "/signed.bin", sealBytes(bytes, "file:" + id + ":signed"), {
      upsert: false,
      contentType: "application/octet-stream",
    });
  if (upload.error) throw new Error("Подписанный экземпляр уже загружен или хранилище недоступно");
  check(
    await db
      .from("lease_documents")
      .update({ status: "signed", files: { ...d.files, signed: true } })
      .eq("id", id)
      .eq("status", "prepared"),
  );
  await leaseAudit(actor, "SIGNED_UPLOAD", id);
  return { saved: true };
}
export async function leaseAssistantContext(
  params: { bookingId?: string | undefined; dealId?: string | undefined; propertyId?: string },
  actor: string,
) {
  const c = await leaseContext(params, actor);
  const masked = {
    name: c.tenant.full_name,
    passport: c.tenant.number ? "••••••" + c.tenant.number.slice(-4) : "Не заполнен",
    missing: identityMissing(c.tenant),
  };
  return {
    ...c,
    tenant: masked,
    profile: c.profile ? { configured: true } : null,
    draft: null,
    templates: c.templates.map((t) => ({
      id: t.id,
      name: t.name,
      approved: t.approved,
      revision: t.revision,
    })),
    documents: c.documents,
  };
}
export async function proposeLeasePreparation(params: Record<string, unknown>, actor: string) {
  const bookingId = String(params["bookingId"]);
  const c = await leaseContext(
    { bookingId, ...(params["dealId"] ? { dealId: String(params["dealId"]) } : {}) },
    actor,
  );
  const t = c.templates.find((t) => t.id === params["templateId"]) || c.templates[0];
  if (!c.booking || !c.property || !t) throw new Error("Сначала выберите бронь и шаблон");
  const mode =
    params["signerMode"] || (c.property.service_type === "management" ? "company" : "owner");
  const ownerId = params["ownerClientId"] as string | undefined;
  const input = leaseInputSchema.parse({
    requestId: randomUUID(),
    bookingId,
    bookingVersion: c.booking.updated_at,
    templateId: t.id,
    templateVersion: t.revision,
    dealId: c.deal?.id || null,
    tenant: c.tenant,
    ownerClientId: ownerId || null,
    owner: ownerId ? await identity(ownerId) : blankIdentity(),
    signerMode: mode,
    company: c.profile || {},
    representative: params["representative"] || "",
    authority: params["authority"] || "",
    pets: params["pets"] === true,
    petKind: params["petKind"] || "",
    petCount: params["petCount"] || 0,
    extra: params["extra"] || "",
    residents: params["residents"] || "",
    inventory: params["inventory"] || "",
    includeAct: params["includeAct"] !== false,
    includeInventory: params["includeInventory"] === true,
    passportDraftId: params["passportDraftId"] || null,
    verified: true,
  });
  const s = await buildLeaseSnapshot(input, actor);
  validateLease(s);
  check(
    await db.from("lease_proposals").insert({
      id: input.requestId,
      actor_id: actor,
      cipher: seal(input, "proposal:" + input.requestId),
    }),
  );
  return {
    requestRef: input.requestId,
    summary: `Сформировать ${t.approved ? "договор" : "черновик договора"}: ${s.property.title}, ${s.input.tenant.full_name}, ${s.booking.start_date} — ${s.booking.end_date}; подписант: ${mode === "company" ? "моё ИП" : mode === "representative" ? "по доверенности" : "собственник"}${input.pets ? "; животное: " + input.petKind + ", " + input.petCount : ""}. Связать со сделкой (создать новую, если её нет); PDF и Word сохранить в брони и отправить в этот личный чат. Распознанные паспортные данные проверьте в документе перед подписанием.`,
  };
}
export async function executeLeasePreparation(input: Record<string, unknown>) {
  const actor = await leaseActor(input);
  const ref = String(input["requestRef"]);
  const p = check(
    await db
      .from("lease_proposals")
      .select("cipher")
      .eq("id", ref)
      .eq("actor_id", actor)
      .gt("expires_at", new Date().toISOString())
      .single(),
  ).data;
  if (!p) throw new Error("Предложение истекло");
  const data = unseal<LeaseInput>(p.cipher, "proposal:" + ref);
  const result = await generateLease(data, actor);
  const chatId = Number(input["_telegramChatId"]);
  if (chatId) {
    const { reminderAccount } = await import("@/lib/reminders/actor.server");
    const recipient = await reminderAccount(Number(input["_telegramUserId"]), chatId);
    if (recipient.user_id !== actor)
      throw new Error("Документ можно отправить только в личный чат автора запроса");
    const { sendLeaseDocument } = await import("@/lib/telegram/api.server");
    for (const format of ["pdf", "docx"]) {
      const file = await leaseFile(actor, result.id, format);
      await sendLeaseDocument(chatId, file.bytes, file.filename);
    }
  }
  return `Документы сохранены в брони, версия ${result.version}. ${result.status === "draft" ? "Это черновик: добавьте и проверьте свой текст шаблона. " : ""}https://rm-os.residence-more.ru/leases?bookingId=${data.bookingId}`;
}
export async function stageLeaseSetting(actor: string, operation: string, data: unknown) {
  const id = randomUUID();
  check(
    await db
      .from("lease_proposals")
      .insert({ id, actor_id: actor, cipher: seal({ operation, data }, "proposal:" + id) }),
  );
  return id;
}
export async function executeLeaseSetting(input: Record<string, unknown>) {
  const actor = await leaseActor(input),
    id = String(input["requestRef"]);
  const r = check(
    await db
      .from("lease_proposals")
      .select("cipher")
      .eq("id", id)
      .eq("actor_id", actor)
      .gt("expires_at", new Date().toISOString())
      .single(),
  ).data;
  if (!r) throw new Error("Предложение истекло");
  const p = unseal<{ operation: string; data: Record<string, unknown> }>(
    r.cipher,
    "proposal:" + id,
  );
  if (p.operation === "company") await saveLeaseProfile(actor, p.data);
  else if (p.operation === "template") await saveLeaseTemplate(actor, p.data);
  else throw new Error("Неизвестная настройка договора");
  return "Настройки договоров сохранены";
}
export async function executeSavePassport(input: Record<string, unknown>) {
  const actor = await leaseActor(input);
  await saveLeaseIdentity(
    actor,
    String(input["clientId"]),
    await passportDraft(actor, String(input["passportDraftId"])),
  );
  return "Паспортные данные сохранены в закрытом разделе клиента";
}
