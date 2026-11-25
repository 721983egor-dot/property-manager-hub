import { z } from "zod";

export const showingRuleTemplates = {
  answer_showing: {
    title: "Сначала ответить на вопрос о просмотре",
    text: "Если клиент спрашивает о просмотре, начни ответ с возможности показа в нужный день. Если доступ или время ещё не проверены, назови, что надо уточнить. Продолжай подбор только если он нужен для просмотра.",
  },
  offer_windows: {
    title: "Предложить два доступных окна",
    text: "Если клиент просит подобрать время и проверены два подходящих окна, предложи оба в одном коротком сообщении. Если подтверждено только одно окно, предложи его и уточни, подходит ли оно.",
  },
} as const;

export const decideShowingRuleInput = z.object({
  key: z.enum(["answer_showing", "offer_windows"]),
  showingId: z.string().uuid().nullable(),
  text: z.string().trim().min(20).max(400),
  decision: z.enum(["approved", "dismissed", "revoke"]),
});
