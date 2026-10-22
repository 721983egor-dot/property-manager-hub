import { z } from "zod";
export const keyItemSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(160),
  form: z.enum(["Ключ", "Магнит", "Пульт", "Брелок", "Карта"]),
  mark: z.string().max(160).default(""),
  reserve: z.boolean().default(false),
});
export const keyBundleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  holder: z.string().trim().min(1).max(160),
  holderId: z.string().uuid().nullable().optional(),
  loose: z.boolean().default(false),
  items: z.array(keyItemSchema).max(100),
});
export type KeyItem = z.infer<typeof keyItemSchema>;
export type KeyBundle = z.infer<typeof keyBundleSchema>;
export type KeyPerson = { id: string; name: string; phone: string };
export type KeyActor = { id: string; role: "admin" | "manager"; name: string };
export type KeyTransfer = {
  id: string;
  bundleId: string;
  itemIds: string[];
  from: string;
  fromId: string | null;
  to: string;
  toId: string | null;
  status: "pending" | "received" | "cancelled";
  at: string;
};
export type KeyInventory = {
  required: string[];
  bundles: KeyBundle[];
  transfers: KeyTransfer[];
  history: { at: string; actor: string; text: string }[];
};
export const emptyKeyInventory = (): KeyInventory => ({
  required: [],
  bundles: [],
  transfers: [],
  history: [],
});
export const keyCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("composition"),
    required: z.array(z.string().trim().min(1).max(160)).max(30),
    bundles: z.array(keyBundleSchema).max(50),
  }),
  z.object({
    kind: z.literal("transfer"),
    bundleId: z.string().uuid(),
    itemIds: z.array(z.string().uuid()).min(1).max(100),
    recipient: z.string().trim().min(1).max(160),
    recipientId: z.string().uuid().nullable().optional(),
    handed: z.boolean().default(false),
  }),
  z.object({ kind: z.literal("receive"), transferId: z.string().uuid() }),
  z.object({ kind: z.literal("cancel"), transferId: z.string().uuid() }),
]);
export type KeyCommand = z.infer<typeof keyCommandSchema>;
export function keyReadiness(inv: KeyInventory, actorId: string) {
  const bundles = inv.bundles.filter((b) => b.holderId === actorId),
    items = bundles.flatMap((b) => b.items);
  if (!bundles.length) return { state: "none", text: "Ключей нет" };
  if (!items.length) return { state: "unknown", text: "Состав не заполнен" };
  if (!inv.required.length) return { state: "unknown", text: "Показ не настроен" };
  const have = new Set(items.filter((i) => !i.reserve).map((i) => i.label.trim().toLowerCase()));
  const missing = inv.required.filter((p) => !have.has(p.trim().toLowerCase()));
  return missing.length
    ? { state: "partial", text: "Не хватает: " + missing.join(", ") }
    : { state: "ready", text: "Всё для показа" };
}
export function applyKeyCommand(
  previous: KeyInventory,
  raw: KeyCommand,
  actor: KeyActor,
  people: KeyPerson[],
  at = new Date().toISOString(),
): KeyInventory {
  const cmd = keyCommandSchema.parse(raw),
    inv = structuredClone(previous);
  const log = (text: string) => inv.history.push({ at, actor: actor.id, text });
  const person = (name: string, id?: string | null) => {
    const matches = people.filter((p) => (id ? p.id === id : p.name === name));
    if (id && !matches.length) throw Error("Сотрудник не найден");
    if (matches.length > 1) throw Error("Выберите сотрудника однозначно");
    return matches[0] ?? null;
  };
  if (cmd.kind === "composition") {
    if (actor.role !== "admin")
      throw Error("Заполнять и исправлять состав может только администратор");
    const ids = cmd.bundles.flatMap((b) => [b.id, ...b.items.map((i) => i.id)]);
    if (new Set(ids).size !== ids.length)
      throw Error("Каждый ключ и связка должны иметь отдельный ID");
    for (const t of inv.transfers.filter((t) => t.status === "pending")) {
      const old = inv.bundles.find((b) => b.id === t.bundleId),
        next = cmd.bundles.find((b) => b.id === t.bundleId);
      if (JSON.stringify(old) !== JSON.stringify(next))
        throw Error("Сначала завершите или отмените передачу этой связки");
    }
    inv.required = [...new Set(cmd.required)];
    inv.bundles = cmd.bundles.map((b) => {
      const p = person(b.holder, b.holderId);
      return { ...b, holder: p?.name ?? b.holder, holderId: p?.id ?? null };
    });
    log("Состав ключей обновлён");
  } else if (cmd.kind === "transfer") {
    const b = inv.bundles.find((b) => b.id === cmd.bundleId);
    if (!b || b.holderId !== actor.id) throw Error("Можно передавать только свои ключи");
    if (inv.transfers.some((t) => t.bundleId === b.id && t.status === "pending"))
      throw Error("Связка уже ожидает получения");
    if (
      new Set(cmd.itemIds).size !== cmd.itemIds.length ||
      cmd.itemIds.some((id) => !b.items.some((i) => i.id === id))
    )
      throw Error("Проверьте выбранные ключи");
    const p = person(cmd.recipient, cmd.recipientId);
    if (p?.id === actor.id || (!p && cmd.recipient === b.holder))
      throw Error("Выберите другого получателя");
    if (!p && !cmd.handed) throw Error("Для получателя без аккаунта подтвердите личное вручение");
    const t: KeyTransfer = {
      id: crypto.randomUUID(),
      bundleId: b.id,
      itemIds: cmd.itemIds,
      from: b.holder,
      fromId: actor.id,
      to: p?.name ?? cmd.recipient,
      toId: p?.id ?? null,
      status: "pending",
      at,
    };
    inv.transfers.push(t);
    log(`Передача: ${t.from} → ${t.to}, ${t.itemIds.length} предметов`);
    if (!p) receive(t);
  } else {
    const t = inv.transfers.find((t) => t.id === cmd.transferId);
    if (!t || t.status !== "pending") throw Error("Эта передача уже завершена или не найдена");
    if (cmd.kind === "cancel") {
      if (t.fromId !== actor.id) throw Error("Отменить передачу может отправитель");
      t.status = "cancelled";
      log("Передача отменена");
    } else {
      if (t.toId !== actor.id) throw Error("Получение подтверждает только получатель");
      receive(t);
    }
  }
  function receive(t: KeyTransfer) {
    const b = inv.bundles.find((b) => b.id === t.bundleId);
    if (!b || b.holderId !== t.fromId || t.itemIds.some((id) => !b.items.some((i) => i.id === id)))
      throw Error("Состав или держатель изменился");
    if (t.itemIds.length === b.items.length) {
      b.holder = t.to;
      b.holderId = t.toId;
    } else {
      const moved = b.items.filter((i) => t.itemIds.includes(i.id));
      b.items = b.items.filter((i) => !t.itemIds.includes(i.id));
      inv.bundles.push({
        id: crypto.randomUUID(),
        name: "Ключи после передачи",
        holder: t.to,
        holderId: t.toId,
        loose: true,
        items: moved,
      });
    }
    t.status = "received";
    log(`Получено: ${t.from} → ${t.to}, ${t.itemIds.length} предметов`);
  }
  inv.history = inv.history.slice(-500);
  inv.transfers = inv.transfers
    .filter((t) => t.status === "pending")
    .concat(inv.transfers.filter((t) => t.status !== "pending").slice(-300));
  return inv;
}
