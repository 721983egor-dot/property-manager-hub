import { createOpenAI } from "@ai-sdk/openai";

/** Модель по умолчанию для Ассистента RM OS (прямой OpenAI). */
export const OPENAI_DEFAULT_MODEL = "gpt-4.1";

/**
 * Прямое подключение к OpenAI по ключу на сервере Бегета (OPENAI_API_KEY).
 * OPENAI_BASE_URL — зарубежный прокси, если api.openai.com недоступен из РФ.
 * Серверы Lovable не используются.
 */
export function createDirectOpenAiProvider(apiKey: string) {
  return createOpenAI({
    name: "openai",
    baseURL: process.env["OPENAI_BASE_URL"] || "https://api.openai.com/v1",
    apiKey,
  });
}

export type AssistantModelSetup = {
  model: ReturnType<ReturnType<typeof createOpenAI>>;
  source: "openai";
};

/**
 * Только прямой OpenAI. Без шлюза Lovable.
 */
export function resolveAssistantModel(): AssistantModelSetup | { error: string } {
  const openAiKey = (process.env["OPENAI_API_KEY"] ?? "").trim();
  if (!openAiKey) {
    return {
      error:
        "ИИ не настроен: задайте OPENAI_API_KEY на сервере Бегета (и при необходимости OPENAI_BASE_URL).",
    };
  }
  const provider = createDirectOpenAiProvider(openAiKey);
  const modelId = process.env["OPENAI_MODEL"] || OPENAI_DEFAULT_MODEL;
  return { model: provider(modelId), source: "openai" };
}

export function resolveEmployeeModel(env: Record<string, string | undefined> = process.env) {
  const key = env["OPENAI_API_KEY"]?.trim();
  if (!key) return { error: "На сервере РМ ОС отсутствует ключ OpenAI" };
  const provider = createOpenAI({
    name: "openai",
    baseURL: env["OPENAI_BASE_URL"] || "https://api.openai.com/v1",
    apiKey: key,
  });
  const model = env["AI_EMPLOYEES_OPENAI_MODEL"]?.trim() || env["OPENAI_MODEL"]?.trim() || OPENAI_DEFAULT_MODEL;
  return { model: provider(model), source: "openai" as const };
}
