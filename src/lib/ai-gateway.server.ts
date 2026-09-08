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

/** Модель по умолчанию для Ассистента RM OS. */
export const ASSISTANT_MODEL = "openai/gpt-6-astra";

/** Параметры провайдера для модели Ассистента. */
export const ASSISTANT_PROVIDER_OPTIONS = {};
