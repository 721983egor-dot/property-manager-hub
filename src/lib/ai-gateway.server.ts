import { createOpenAI } from "@ai-sdk/openai";

/**
 * Провайдер AI SDK, подключённый к шлюзу Lovable AI (Responses API).
 * Только сервер. Модель Astra поддерживает вызов инструментов только через /v1/responses.
 */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAI({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

/** Модель по умолчанию для Ассистента RM OS (шлюз Lovable AI). */
export const ASSISTANT_MODEL = "openai/gpt-6-astra";

/** Модель по умолчанию при прямом подключении к OpenAI по ключу клиента. */
export const OPENAI_DEFAULT_MODEL = "gpt-4.1";

/** Параметры провайдера для модели Ассистента. */
export const ASSISTANT_PROVIDER_OPTIONS = {};

/**
 * Прямое подключение к OpenAI по ключу клиента (OPENAI_API_KEY).
 * OPENAI_BASE_URL позволяет направить запросы через зарубежный прокси,
 * если сервер находится в России и api.openai.com недоступен.
 */
export function createDirectOpenAiProvider(apiKey: string) {
  return createOpenAI({
    name: "openai",
    baseURL: process.env["OPENAI_BASE_URL"] || "https://api.openai.com/v1",
    apiKey,
  });
}

export type AssistantModelSetup = {
  /** Готовая модель AI SDK. */
  model: ReturnType<ReturnType<typeof createOpenAI>>;
  /** Какой канал используется: прямой OpenAI или шлюз Lovable. */
  source: "openai" | "lovable";
};

/**
 * Выбирает канал для Ассистента: если задан OPENAI_API_KEY — идём напрямую
 * в OpenAI, иначе используем шлюз Lovable AI.
 */
export function resolveAssistantModel(): AssistantModelSetup | { error: string } {
  const openAiKey = process.env["OPENAI_API_KEY"];
  if (openAiKey) {
    const provider = createDirectOpenAiProvider(openAiKey);
    const modelId = process.env["OPENAI_MODEL"] || OPENAI_DEFAULT_MODEL;
    return { model: provider(modelId), source: "openai" };
  }

  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) return { error: "ИИ не настроен: нет ключа доступа." };

  const gateway = createLovableAiGatewayProvider(lovableKey);
  return { model: gateway(ASSISTANT_MODEL), source: "lovable" };
}
