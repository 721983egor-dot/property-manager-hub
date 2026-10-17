import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key() {
  const value = process.env["LEASE_DATA_KEY"] ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new Error("Хранилище паспортов не настроено: задайте LEASE_DATA_KEY");
  return Buffer.from(value, "hex");
}
export function sealBytes(data: Uint8Array, aad: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
}
export function openBytes(data: Uint8Array, aad: string) {
  const b = Buffer.from(data);
  if (b[0] !== 1 || b.length < 29) throw new Error("Повреждён зашифрованный файл");
  const cipher = createDecipheriv("aes-256-gcm", key(), b.subarray(1, 13));
  cipher.setAAD(Buffer.from(aad));
  cipher.setAuthTag(b.subarray(13, 29));
  return Buffer.concat([cipher.update(b.subarray(29)), cipher.final()]);
}
export const seal = (data: unknown, aad: string) =>
  sealBytes(Buffer.from(JSON.stringify(data)), aad).toString("base64");
export const unseal = <T>(data: string, aad: string): T =>
  JSON.parse(openBytes(Buffer.from(data, "base64"), aad).toString("utf8")) as T;
