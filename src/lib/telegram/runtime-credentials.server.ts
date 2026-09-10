import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const CREDENTIALS_PATH = "/data/runtime-secrets/telegram.json";
const CREDENTIALS_RELAY_URL =
  "https://project--759489f7-e642-4293-83bd-48dbce5c55ee-dev.lovable.app/api/public/system/telegram-credentials";

export type TelegramRuntimeCredentials = {
  lovableApiKey: string;
  telegramApiKey: string;
};

function encryptionKey() {
  const token = process.env["DEPLOY_AGENT_TOKEN"];
  if (!token) throw new Error("DEPLOY_AGENT_TOKEN is not configured");
  return createHash("sha256").update(`rm-os-runtime:${token}`).digest();
}

export async function saveTelegramRuntimeCredentials(credentials: TelegramRuntimeCredentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  const payload = JSON.stringify({
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  });
  await mkdir("/data/runtime-secrets", { recursive: true });
  await writeFile(CREDENTIALS_PATH, payload, { mode: 0o600 });
}

export async function loadTelegramRuntimeCredentials(): Promise<TelegramRuntimeCredentials | null> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const telegramApiKey = process.env["TELEGRAM_API_KEY"];
  if (lovableApiKey && telegramApiKey) return { lovableApiKey, telegramApiKey };

  try {
    const payload = JSON.parse(await readFile(CREDENTIALS_PATH, "utf8")) as {
      iv: string;
      tag: string;
      data: string;
    };
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(payload.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.data, "base64")),
      decipher.final(),
    ]);
    const credentials = JSON.parse(decrypted.toString("utf8")) as TelegramRuntimeCredentials;
    if (!credentials.lovableApiKey || !credentials.telegramApiKey) return null;
    return credentials;
  } catch {
    const token = process.env["DEPLOY_AGENT_TOKEN"];
    if (!token) return null;
    try {
      const response = await fetch(CREDENTIALS_RELAY_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const parsed = (await response.json()) as Partial<TelegramRuntimeCredentials>;
      if (!parsed.lovableApiKey || !parsed.telegramApiKey) return null;
      const credentials = {
        lovableApiKey: parsed.lovableApiKey,
        telegramApiKey: parsed.telegramApiKey,
      };
      await saveTelegramRuntimeCredentials(credentials);
      return credentials;
    } catch {
      return null;
    }
  }
}