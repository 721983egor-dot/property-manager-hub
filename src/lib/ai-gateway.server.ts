import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/** Модель по умолчанию для Ассистента RM OS (прямой OpenAI). */
export const OPENAI_DEFAULT_MODEL = "gpt-4.1";
export const YANDEX_DEFAULT_MODEL = "aliceai-llm-flash";

type AiEnvironment = Record<string, string | undefined>;

/** Server-only configuration. Never return credentials to a client or log them. */
export function assistantConnection(env: AiEnvironment = process.env) {
  const selected = (env["ASSISTANT_PROVIDER"] || "openai").trim().toLowerCase();
  if (selected === "yandex") {
    const apiKey = (env["YANDEX_AI_API_KEY"] || "").trim();
    const folder = (env["YANDEX_AI_FOLDER_ID"] || "").trim();
    const model = (env["YANDEX_AI_MODEL"] || YANDEX_DEFAULT_MODEL).trim();
    if (!apiKey || !folder) {
      return {
        error:
          "Яндекс ИИ не настроен: нужны YANDEX_AI_API_KEY и YANDEX_AI_FOLDER_ID на сервере РМ ОС.",
      };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(folder) || !/^[a-zA-Z0-9._/-]+$/.test(model)) {
      return {
        error:
          "Проверьте ID каталога и название модели Яндекса. Укажите название модели без gpt://.",
      };
    }
    return {
      source: "yandex" as const,
      // Fixed endpoint: the Yandex key must never go to OPENAI_BASE_URL.
      baseURL: "https://ai.api.cloud.yandex.net/v1",
      modelId: `gpt://${folder}/${model}`,
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        "OpenAI-Project": folder,
        "x-data-logging-enabled": "false",
      },
    };
  }
  if (selected !== "openai")
    return { error: "Неизвестный ASSISTANT_PROVIDER. Выберите yandex или openai." };
  const apiKey = (env["OPENAI_API_KEY"] || "").trim();
  if (!apiKey)
    return {
      error:
        "ИИ не настроен: выберите ASSISTANT_PROVIDER=yandex и настройте доступ к Яндексу либо задайте OPENAI_API_KEY.",
    };
  return {
    source: "openai" as const,
    baseURL: env["OPENAI_BASE_URL"] || "https://api.openai.com/v1",
    modelId: env["OPENAI_MODEL"] || OPENAI_DEFAULT_MODEL,
    headers: { Authorization: `Bearer ${apiKey}` },
  };
}

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
  model: LanguageModel;
  source: "openai" | "yandex";
};

/**
 * Explicit provider selection, without automatic fallback to another company.
 * Photo analysis and speech have separate integrations; this selects text models.
 */
export function resolveAssistantModel(
  env: AiEnvironment = process.env,
  requestFetch?: typeof fetch,
): AssistantModelSetup | { error: string } {
  const connection = assistantConnection(env);
  if ("error" in connection) return { error: connection.error! };
  if (connection.source === "yandex") {
    const provider = createOpenAICompatible({
      name: "yandex",
      baseURL: connection.baseURL,
      headers: connection.headers,
      supportsStructuredOutputs: true,
      ...(requestFetch ? { fetch: requestFetch } : {}),
    });
    return { model: provider.chatModel(connection.modelId), source: "yandex" };
  }
  const provider = createOpenAI({
    name: "openai",
    baseURL: connection.baseURL,
    headers: connection.headers,
    apiKey: env["OPENAI_API_KEY"]!.trim(),
    ...(requestFetch ? { fetch: requestFetch } : {}),
  });
  return { model: provider(connection.modelId), source: "openai" };
}

type EmployeeModelSetup = {
  model: LanguageModel;
  source: AssistantModelSetup["source"] | "gateway";
};

export function resolveEmployeeModel(
  env: AiEnvironment = process.env,
  requestFetch?: typeof fetch,
): EmployeeModelSetup | { error: string } {
  const provider = env["AI_EMPLOYEES_PROVIDER"]?.trim().toLowerCase() || "openai";
  if (provider === "gateway") {
    const address = URL.parse(env["AI_EMPLOYEES_GATEWAY_URL"]?.trim() || "");
    const apiKey = env["AI_EMPLOYEES_GATEWAY_KEY"]?.trim();
    const model = env["AI_EMPLOYEES_OPENAI_MODEL"]?.trim();
    if (
      !address ||
      address.protocol !== "https:" ||
      address.username ||
      address.password ||
      address.search ||
      address.hash
    ) {
      return {
        error: "Укажите HTTPS-адрес API шлюза ИИ-сотрудников без параметров и учётных данных.",
      };
    }
    if (!apiKey || !model) {
      return { error: "Для шлюза ИИ-сотрудников нужны отдельный ключ и имя модели." };
    }
    const gateway = createOpenAI({
      name: "openai",
      baseURL: address.href.replace(/\/+$/, ""),
      apiKey,
      ...(requestFetch ? { fetch: requestFetch } : {}),
    });
    return { model: gateway.chat(model), source: "gateway" };
  }
  if (provider !== "openai" && provider !== "yandex") {
    return { error: "Для ИИ-сотрудников выберите провайдера gateway, openai или yandex." };
  }
  return resolveAssistantModel(
    {
      ...env,
      ASSISTANT_PROVIDER: provider,
      OPENAI_MODEL: env["AI_EMPLOYEES_OPENAI_MODEL"]?.trim() || env["OPENAI_MODEL"]?.trim(),
    },
    requestFetch,
  );
}
