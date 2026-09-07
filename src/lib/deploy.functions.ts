import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const deployResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string().optional(),
  message: z.string(),
});

async function callDeployAgent(path: string, body?: unknown) {
  const agentUrl = process.env["DEPLOY_AGENT_URL"];
  const token = process.env["DEPLOY_AGENT_TOKEN"];

  if (!agentUrl || !token) {
    throw new Error("Deploy-агент не настроен. Добавьте DEPLOY_AGENT_URL и DEPLOY_AGENT_TOKEN в переменные окружения сервера.");
  }

  const res = await fetch(`${agentUrl.replace(/\/$/, "")}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Deploy-агент вернул не JSON: ${text.slice(0, 200)}`);
  }

  const parsed = deployResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Некорректный ответ от deploy-агента: ${text.slice(0, 200)}`);
  }

  if (!res.ok || !parsed.data.ok) {
    throw new Error(parsed.data.message || "Ошибка deploy-агента");
  }

  return parsed.data;
}

/** Информация о текущей и последней доступной версии приложения. */
export const getDeployStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return callDeployAgent("/deploy", { source: "rm-os-ui" });
  });

/** Откатывает сайт на предыдущую версию. */
export const triggerRollback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return callDeployAgent("/rollback", { source: "rm-os-ui" });
  });
