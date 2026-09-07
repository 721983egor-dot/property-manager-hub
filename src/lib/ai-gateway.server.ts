import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Провайдер AI SDK, подключённый к шлюзу Lovable AI. Только сервер. */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable-ai-gateway",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
  });
}

/** Модель по умолчанию для помощника RM OS. */
export const ASSISTANT_MODEL = "google/gemini-3.7-flash";
