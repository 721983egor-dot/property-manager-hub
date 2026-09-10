import { tool } from "ai";
import { z } from "zod";

import { addAssistantSkill, loadAssistantSkills, removeAssistantSkill } from "@/lib/ai/skills.server";

/**
 * Навыки Ассистента: менеджер может научить его правилу словами,
 * правило сохраняется и применяется во всех следующих диалогах.
 */
export function createSkillTools() {
  return {
    rememberSkill: tool({
      description:
        "Запомнить новое правило работы, которому научил менеджер (например: «когда отправляешь подборку, всегда давай ссылку»). Сохраняется навсегда и применяется во всех диалогах, включая Telegram. Вызывай, когда пользователь просит запомнить, всегда так делать или больше так не делать.",
      inputSchema: z.object({
        text: z.string().describe("Правило одной фразой, в повелительном наклонении, по-русски"),
      }),
      execute: async ({ text }) => {
        try {
          await addAssistantSkill(text);
          return { saved: true, text };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Не удалось сохранить правило" };
        }
      },
    }),

    forgetSkill: tool({
      description: "Забыть ранее сохранённое правило. Укажи фрагмент текста правила.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const removed = await removeAssistantSkill(query);
        return removed ? { removed } : { error: "Такое правило не найдено" };
      },
    }),

    listSkills: tool({
      description: "Показать все правила, которым научил менеджер.",
      inputSchema: z.object({}),
      execute: async () => ({ skills: await loadAssistantSkills() }),
    }),
  };
}
