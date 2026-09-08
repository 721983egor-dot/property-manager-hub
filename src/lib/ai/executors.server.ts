import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Input = Record<string, unknown>;
type Executor = (input: Input) => Promise<string>;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode() {
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < bytes.length; i++) code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return code;
}

function must<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

async function logAction(summary: string, tool: string, input: Input) {
  await supabaseAdmin.from("activity_log").insert({
    table_name: "assistant",
    action: tool,
    source: "assistant",
    summary,
    changes: input as never,
  });
}

/** Исполнители подтверждённых действий Ассистента. Ключ = поле `tool` предложения. */
export const ASSISTANT_EXECUTORS: Record<string, Executor> = {
  setPublished: async (input) => {
    const propertyId = must(input["propertyId"] as string, "Не указан объект");
    const platform = (input["platform"] as string) || "site";
    const published = Boolean(input["publish"]);
    if (platform === "cian") {
      const { setCianPublished } = await import("@/lib/cian.functions");
      await setCianPublished({ data: { propertyId, published } });
    } else if (platform === "yandex") {
      const { setYandexPublished } = await import("@/lib/yandex-realty.functions");
      await setYandexPublished({ data: { propertyId, published } });
    } else {
      const now = new Date().toISOString();
      if (platform === "site") {
        await supabaseAdmin.from("properties").update({ published }).eq("id", propertyId);
      }
      const { error } = await supabaseAdmin.from("property_listings").upsert(
        {
          property_id: propertyId,
          platform: platform as never,
          published,
          published_at: published ? now : null,
          unpublished_at: published ? null : now,
          last_synced_at: now,
        },
        { onConflict: "property_id,platform" },
      );
      if (error) throw new Error(error.message);
    }
    return published ? "Опубликовано" : "Снято с публикации";
  },

  updateProperty: async (input) => {
    const propertyId = must(input["propertyId"] as string, "Не указан объект");
    const f = (input["fields"] ?? {}) as Input;
    const patch: Record<string, unknown> = {};
    if (f["priceMonth"] != null) patch["price_month"] = f["priceMonth"];
    if (f["status"]) patch["status"] = f["status"];
    if (f["deposit"] != null) patch["deposit"] = f["deposit"];
    if (f["commission"] != null) patch["commission"] = f["commission"];
    if (f["utilitiesMonth"] != null) patch["utilities_month"] = f["utilitiesMonth"];
    if (f["description"]) patch["description"] = f["description"];
    if (f["rentTerms"]) patch["rent_terms"] = f["rentTerms"];
    if (f["availabilityNote"]) patch["availability_note"] = f["availabilityNote"];
    if (!Object.keys(patch).length) throw new Error("Нет изменений");
    const { error } = await supabaseAdmin
      .from("properties")
      .update(patch as never)
      .eq("id", propertyId);
    if (error) throw new Error(error.message);
    return "Объект обновлён";
  },

  createProperty: async (input) => {
    const { data: last } = await supabaseAdmin
      .from("properties")
      .select("ref_id")
      .order("ref_id", { ascending: false })
      .limit(1);
    const nextRef = ((last ?? [])[0]?.ref_id ?? 1000) + 1;
    const { error } = await supabaseAdmin.from("properties").insert({
      ref_id: nextRef,
      title: (input["title"] as string) ?? "Новый объект",
      type: (input["type"] as never) ?? ("apartment" as never),
      rooms: (input["rooms"] as number) ?? 1,
      bathrooms: (input["bathrooms"] as number) ?? 1,
      address: (input["address"] as string) ?? "",
      complex_name: (input["complexName"] as string) ?? "",
      area: (input["area"] as number) ?? null,
      floor: (input["floor"] as number) ?? null,
      total_floors: (input["totalFloors"] as number) ?? null,
      price_month: (input["priceMonth"] as number) ?? null,
      deposit: (input["deposit"] as number) ?? null,
      commission: (input["commission"] as number) ?? null,
      description: (input["description"] as string) ?? "",
      status: "free" as never,
      published: false,
    });
    if (error) throw new Error(error.message);
    return `Объект создан, номер ${nextRef}`;
  },

  createSelection: async (input) => {
    const propertyIds = (input["propertyIds"] as string[]) ?? [];
    if (!propertyIds.length) throw new Error("Нет объектов");
    const code = generateCode();
    const { data: selection, error } = await supabaseAdmin
      .from("selections")
      .insert({
        code,
        name: (input["name"] as string) ?? "",
        client_name: (input["clientName"] as string) ?? "",
        comment: (input["comment"] as string) ?? "",
        saved: true,
      })
      .select("id, code")
      .single();
    if (error || !selection) throw new Error(error?.message ?? "Не удалось создать подборку");
    const { error: itemsError } = await supabaseAdmin.from("selection_items").insert(
      propertyIds.map((property_id, index) => ({
        selection_id: selection.id,
        property_id,
        position: index,
      })),
    );
    if (itemsError) throw new Error(itemsError.message);
    return `Подборка создана: /p/${selection.code}`;
  },

  createBooking: async (input) => {
    const propertyId = must(input["propertyId"] as string, "Не указан объект");
    const fullName = must(input["clientName"] as string, "Не указан клиент");
    const phone = (input["clientPhone"] as string) ?? "";
    let clientId: string | null = null;
    const term = phone || fullName;
    const { data: found } = await supabaseAdmin
      .from("clients")
      .select("id")
      .or(`full_name.ilike.%${fullName}%,phone.ilike.%${term}%`)
      .limit(1);
    if ((found ?? []).length) clientId = (found ?? [])[0]!.id;
    if (!clientId) {
      const { data: created, error } = await supabaseAdmin
        .from("clients")
        .insert({ full_name: fullName, phone })
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message ?? "Не удалось создать клиента");
      clientId = created.id;
    }
    const priceMonth = (input["priceMonth"] as number) ?? null;
    const { error } = await supabaseAdmin.from("bookings").insert({
      property_id: propertyId,
      client_id: clientId,
      start_date: input["startDate"] as string,
      end_date: input["endDate"] as string,
      price_type: "fixed" as never,
      price_month: priceMonth,
      payment_day: (input["paymentDay"] as number) ?? 1,
      deposit: (input["deposit"] as number) ?? null,
      source: (input["source"] as never) ?? null,
      status: "active" as never,
      comment: (input["comment"] as string) ?? "",
    });
    if (error) throw new Error(error.message);
    return "Бронь добавлена";
  },

  cancelBooking: async (input) => {
    const propertyId = must(input["propertyId"] as string, "Не указан объект");
    const startDate = must(input["startDate"] as string, "Не указана дата");
    const { error } = await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled" as never })
      .eq("property_id", propertyId)
      .eq("start_date", startDate);
    if (error) throw new Error(error.message);
    return "Бронь отменена";
  },

  upsertClient: async (input) => {
    const clientId = input["clientId"] as string | null;
    const patch: Record<string, unknown> = {};
    if (input["fullName"]) patch["full_name"] = input["fullName"];
    if (input["phone"] != null) patch["phone"] = input["phone"];
    if (input["comment"] != null) patch["comment"] = input["comment"];
    if (input["blacklisted"] != null) patch["blacklisted"] = input["blacklisted"];
    if (input["blacklistReason"] != null) patch["blacklist_reason"] = input["blacklistReason"];
    if (clientId) {
        const { error } = await supabaseAdmin
        .from("clients")
        .update(patch as never)
        .eq("id", clientId);
      if (error) throw new Error(error.message);
      return "Клиент обновлён";
    }
    const { error } = await supabaseAdmin
      .from("clients")
      .insert({ full_name: (patch["full_name"] as string) ?? "", ...patch } as never);
    if (error) throw new Error(error.message);
    return "Клиент создан";
  },

  setLeadStatus: async (input) => {
    const leadId = must(input["leadId"] as string, "Не указана заявка");
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ status: input["status"] as never })
      .eq("id", leadId);
    if (error) throw new Error(error.message);
    return "Статус заявки обновлён";
  },
};

/** Выполняет подтверждённое действие и пишет его в журнал. */
export async function executeAssistantAction(
  tool: string,
  summary: string,
  rawInput: string,
): Promise<string> {
  const executor = ASSISTANT_EXECUTORS[tool];
  if (!executor) throw new Error(`Неизвестное действие: ${tool}`);
  let input: Input = {};
  try {
    input = rawInput ? (JSON.parse(rawInput) as Input) : {};
  } catch {
    throw new Error("Не удалось прочитать параметры действия");
  }
  const message = await executor(input);
  await logAction(summary, tool, input);
  return message;
}
