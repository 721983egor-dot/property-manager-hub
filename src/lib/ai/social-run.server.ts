import type { AssistantAction, AssistantChatMessage, AssistantReply } from "@/lib/ai/types";

export const SOCIAL_ASSISTANT_PROMPT = `Ты — SMM-режим Ассистента RM OS агентства долгосрочной аренды «Residence More».
Отвечай по-русски, коротко, как редактор соцсетей, а не как менеджер CRM.

Каналы компании: Instagram, ВКонтакте, группа Telegram, группа в мессенджере Макс.
Публикация и статистика идут через Postmypost, включая Макс.

Как работать:
- Идеи, рубрики, тексты, адаптации под сеть — твоя основная работа.
- Факты об объектах (цена, комнаты, свободен ли) бери ТОЛЬКО из инструментов searchProperties / getPropertyDetails. Не выдумывай метраж и цену.
- Голос бренда и выученные правила — из getSocialBrand и блока ниже. Соблюдай их.
- Черновик или публикация — только proposeSocialPost. Ничего не публикуй само.
- Фото и видео менеджер добавляет во вкладке «Пост». Правила формата и веса — getSocialMediaRules. Сам файлы не загружаешь.
- Пульс Сочи (погода, новости, афиша) — getSochiPulse. Посты про город пиши только из этих фактов, передавай pulseItemId. Если по теме уже есть пост — сначала скажи об этом.
- По просьбе «запомни, как пишем» — rememberSocialSkill.
- Instagram: НЕ реклама. Без цен, депозита, телефона, ссылок и блока «условия аренды». Живой пост про место и ощущение, хештеги в конце, призыв только «напишите в директ». Всегда передавай instagramBody отдельно. В ответе человеку показывай обе версии: полную и Instagram.
- ВКонтакте / Telegram / Макс: можно цену и условия. Ссылку на карточку в текст не пиши: её вставляет менеджер в поле «Ссылка на объект». В публикации она выглядит как https://residence-more.ru/, а ведёт на карточку. Если менеджер дал адрес карточки — передай objectUrl.

Не уходи в сделки, брони и чаты клиентов, если об этом прямо не спросили.`;

/** SMM-режим того же Ассистента: тот же движок, другой промпт и набор инструментов. */
export async function askSocialAssistantCore(messages: AssistantChatMessage[]): Promise<AssistantReply> {
  const { streamText, stepCountIs } = await import("ai");
  const { resolveAssistantModel } = await import("@/lib/ai-gateway.server");
  const { createToolContext, propertyLabel } = await import("@/lib/ai/context.server");
  const { createReadTools } = await import("@/lib/ai/tools/read.server");
  const { createSocialTools } = await import("@/lib/ai/tools/social.server");
  const {
    loadSocialBrand,
    loadSocialChannels,
    loadSocialPosts,
    loadSocialSkills,
    socialBrandPrompt,
    socialSkillsPrompt,
  } = await import("@/lib/social.server");

  const setup = resolveAssistantModel();
  if ("error" in setup) return { text: "", actions: [], error: setup.error };

  const actions: AssistantAction[] = [];
  const ctx = createToolContext(actions);
  const read = createReadTools(ctx);
  const tools = {
    searchProperties: read.searchProperties,
    getPropertyDetails: read.getPropertyDetails,
    ...createSocialTools(ctx),
  };

  try {
    const pulseMod = await import("@/lib/sochi-pulse.server");
    const [brand, skills, channels, posts, properties, pulse] = await Promise.all([
      loadSocialBrand(),
      loadSocialSkills(),
      loadSocialChannels(),
      loadSocialPosts(20),
      ctx.allProperties(),
      pulseMod.loadSochiPulse().catch(() => null),
    ]);

    const free = properties
      .filter((p) => p["status"] === "free")
      .slice(0, 20)
      .map((p) => propertyLabel(p as never));

    const channelLines = channels.map((c) => {
      const acc = c.postmypost_account_id ? "Postmypost подключён" : "нет аккаунта Postmypost";
      return `- ${c.name}: ${c.enabled ? "вкл" : "выкл"}, ${acc}${c.last_error ? `; ${c.last_error}` : ""}`;
    });

    const postLines = posts.slice(0, 12).map((p) => {
      const nets = p.targets.map((t) => t.platform).join("/");
      return `- [${p.status}] ${p.topic || p.body.slice(0, 60)} → ${nets}${p.scheduled_at ? ` (${p.scheduled_at})` : ""}`;
    });

    const live = `\n\nСнимок соцсетей:
Каналы:
${channelLines.join("\n") || "- (нет)"}

Последние посты:
${postLines.join("\n") || "- (нет постов)"}

Свободные объекты (до 20, для идей контента):
${free.map((n) => `- ${n}`).join("\n") || "- (нет)"}`;

    const pulseBlock = pulse ? pulseMod.sochiPulsePrompt(pulse) : "";

    const result = streamText({
      model: setup.model,
      system: SOCIAL_ASSISTANT_PROMPT + socialBrandPrompt(brand) + socialSkillsPrompt(skills) + live + pulseBlock,
      messages: messages.slice(-20),
      tools,
      stopWhen: stepCountIs(20),
    });
    const text = await result.text;
    return { text, actions, error: "" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка запроса к ИИ";
    console.error("askSocialAssistantCore failed", e);
    return { text: "", actions: [], error: message };
  }
}
