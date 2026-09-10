import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-user-middleware";

const deployResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string().optional(),
  message: z.string(),
});

const deployErrorSchema = z.object({
  detail: z.string(),
});

const PRODUCTION_URL = "https://rm-os.residence-more.ru";

async function callDeployAgent(path: string, body?: unknown) {
  const agentUrl = process.env["DEPLOY_AGENT_URL"];
  const token = process.env["DEPLOY_AGENT_TOKEN"];

  if (!agentUrl || !token) {
    throw new Error("Deploy-агент не настроен. Добавьте DEPLOY_AGENT_URL и DEPLOY_AGENT_TOKEN в переменные окружения сервера.");
  }

  const init: RequestInit = {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${agentUrl.replace(/\/$/, "")}${path}`, init);

  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Deploy-агент вернул не JSON: ${text.slice(0, 200)}`);
  }

  const parsed = deployResponseSchema.safeParse(json);
  if (!parsed.success) {
    const parsedError = deployErrorSchema.safeParse(json);
    if (parsedError.success) {
      throw new Error(parsedError.data.detail);
    }
    throw new Error(`Некорректный ответ от deploy-агента: ${text.slice(0, 500)}`);
  }

  if (!res.ok || !parsed.data.ok) {
    throw new Error(parsed.data.message || "Ошибка deploy-агента");
  }

  return parsed.data;
}

async function configureProductionTelegram() {
  const telegramApiKey = process.env["TELEGRAM_API_KEY"];
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const deployToken = process.env["DEPLOY_AGENT_TOKEN"];
  if (!telegramApiKey || !lovableApiKey || !deployToken) {
    throw new Error("Не удалось передать подключение Telegram рабочему RM OS");
  }
  const response = await fetch(`${PRODUCTION_URL}/api/public/system/telegram-bootstrap`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deployToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ telegramApiKey, lovableApiKey }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Telegram не переключён: ${text.slice(0, 200)}`);
}

async function waitForProductionTelegramEndpoint(timeoutMs = 5 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await configureProductionTelegram();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Рабочий RM OS не ответил при подключении Telegram");
}

/** Информация о текущей и последней доступной версии приложения. */
export const getDeployStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async () => {
    try {
      const status = await callDeployAgent("/status");
      return status;
    } catch (err) {
      return {
        ok: false,
        version: "unknown",
        message: err instanceof Error ? err.message : "Не удалось получить статус",
      };
    }
  });

/** Запускает обновление сайта до последней версии из GitHub. */
export const triggerDeploy = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => {
    const result = await callDeployAgent("/deploy", {
      source: "rm-os-ui",
    });
    await waitForProductionTelegramEndpoint();
    return result;
  });

/** Откатывает сайт на предыдущую версию. */
export const triggerRollback = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => {
    return callDeployAgent("/rollback", { source: "rm-os-ui" });
  });
