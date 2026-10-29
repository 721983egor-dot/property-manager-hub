import { createHmac, timingSafeEqual } from "node:crypto";
import { sealedActionSchema, type SealedAction } from "./model";
function key() {
  const value = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!value) throw Error("Отложенные поручения не настроены на сервере");
  return value;
}
function signature(payload: string) {
  return createHmac("sha256", key())
    .update("rm-scheduled-action-v1\n" + payload)
    .digest("hex");
}
export function sealAction(action: SealedAction) {
  const payload = JSON.stringify(sealedActionSchema.parse(action));
  if (Buffer.byteLength(payload) > 100000)
    throw Error("Поручение слишком большое для отложенного выполнения");
  return { payload, signature: signature(payload) };
}
export function unsealAction(input: Record<string, unknown>, now = Date.now()) {
  const payload = String(input["payload"] ?? ""),
    supplied = String(input["signature"] ?? "");
  if (Buffer.byteLength(payload) > 100000 || !/^[a-f0-9]{64}$/.test(supplied))
    throw Error("Подготовьте поручение заново");
  if (!timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(signature(payload), "hex")))
    throw Error("Параметры поручения изменились. Подготовьте его заново");
  const action = sealedActionSchema.parse(JSON.parse(payload));
  if (now - action.issuedAt > 86400000 || action.issuedAt > now + 60000)
    throw Error("Подтверждение устарело. Подготовьте поручение заново");
  return action;
}

export function unsealForActor(input: Record<string, unknown>, actor: string, now = Date.now()) {
  const action = unsealAction(input, now);
  if (action.actorId !== actor) throw Error("Подтвердить поручение может только его автор");
  return action;
}
