import { tool } from "ai";
import { z } from "zod";
import type { AssistantToolContext } from "./ai/context.server";
import { keyRequestActor, loadKeyWorkspace, mutatePropertyKeys } from "./property-keys.server";
import { keyCommandSchema, applyKeyCommand, emptyKeyInventory } from "./property-keys-model";
export const assistantKeyChangeSchema = z.object({
  propertyId: z.string().uuid(),
  expected: z.number().int().min(0),
  command: keyCommandSchema,
});
export function propertyKeyReadTools() {
  return {
    getPropertyKeys: tool({
      description:
        "Объекты РМ и ключи: реальные сотрудники, связки, отдельные/резервные ключи, обязательные проходы, текущая версия и передачи. Сначала прочти перед изменением. Без данных собственника, арендатора и управления.",
      inputSchema: z.object({ propertyId: z.string().uuid().optional() }),
      execute: async ({ propertyId }) => {
        const w = await loadKeyWorkspace(await keyRequestActor());
        return {
          actor: w.actor,
          people: w.people,
          objects: w.properties
            .filter((p) => !propertyId || p.id === propertyId)
            .map((p) => ({
              id: p.id,
              name: p.internal_name || p.title,
              ...w.inventories.find((r) => r.property_id === p.id),
              version: w.inventories.find((r) => r.property_id === p.id)?.version ?? 0,
              inventory:
                w.inventories.find((r) => r.property_id === p.id)?.inventory ?? emptyKeyInventory(),
            })),
        };
      },
    }),
  };
}
export function propertyKeyMutateTools(ctx: AssistantToolContext) {
  return {
    proposePropertyKeyChange: tool({
      description:
        "Предложить изменение ключей после getPropertyKeys. Только после подтверждения. composition доступен администратору; transfer только своих ключей; receive только получателю; cancel отправителю. UUID предметов сохраняются, новые UUID только у новых предметов. expected — версия из чтения. Внешняя передача handed=true только если пользователь явно подтвердил личное вручение.",
      inputSchema: assistantKeyChangeSchema,
      execute: async (input) => {
        const actor = await keyRequestActor();
        const w = await loadKeyWorkspace(actor);
        const p = w.properties.find((p) => p.id === input.propertyId);
        if (!p) throw Error("Объект не найден");
        const snapshot = w.inventories.find((r) => r.property_id === p.id);
        if ((snapshot?.version ?? 0) !== input.expected) throw Error("Обновите сведения о ключах");
        applyKeyCommand(snapshot?.inventory ?? emptyKeyInventory(), input.command, actor, w.people);
        const c = input.command;
        const action =
          c.kind === "composition"
            ? `Сохранить состав: ${c.bundles.map((b) => `${b.name}, у ${b.holder}, ${b.items.length} предм.`).join("; ")}; для показа: ${c.required.join(", ") || "не настроено"}`
            : c.kind === "transfer"
              ? `Передать ${c.itemIds.length} ключей: ${actor.name} → ${c.recipient}${c.handed ? "; личное вручение подтверждено" : "; ожидается подтверждение получения"}`
              : `${c.kind === "receive" ? "Подтвердить получение" : "Отменить передачу"}: ${c.transferId}`;
        const summary = `${p.internal_name || p.title}: ${action}`;
        ctx.propose({ tool: "changePropertyKeys", summary, input });
        return { proposed: true, summary };
      },
    }),
  };
}
export async function executePropertyKeyChange(raw: Record<string, unknown>) {
  const input = assistantKeyChangeSchema.parse(raw);
  await mutatePropertyKeys(
    await keyRequestActor(),
    input.propertyId,
    input.expected,
    input.command,
  );
  return "Учёт ключей обновлён";
}
