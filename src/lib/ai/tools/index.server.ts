import { createReadTools } from "@/lib/ai/tools/read.server";
import { createMutateTools } from "@/lib/ai/tools/mutate.server";
import { createSkillTools } from "@/lib/ai/tools/skills.server";
import { createSocialTools } from "@/lib/ai/tools/social.server";

import type { AssistantToolContext } from "@/lib/ai/context.server";

/**
 * Единый реестр инструментов Ассистента.
 *
 * ПРАВИЛО ПРОЕКТА: каждая новая функция RM OS одновременно с интерфейсом
 * получает инструмент здесь (чтение — в read.server.ts, изменение —
 * в mutate.server.ts + исполнитель в executors.server.ts). Тогда при
 * обновлении системы Ассистент сразу умеет пользоваться новой функцией.
 */
export function buildAssistantTools(ctx: AssistantToolContext) {
  return {
    ...createReadTools(ctx),
    ...createMutateTools(ctx),
    ...createSkillTools(),
    ...createSocialTools(ctx),
  };
}
