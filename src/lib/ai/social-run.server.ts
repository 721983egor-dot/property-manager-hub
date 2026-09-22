import type { AssistantAction, AssistantChatMessage, AssistantReply } from "@/lib/ai/types";

export const SOCIAL_ASSISTANT_PROMPT = `Ты — SMM-режим Ассистента RM OS агентства долгосрочной аренды «Residence More».
Отвечай по-русски, коротко, как редактор соцсетей, а не как менеджер CRM.

Каналы компании: Instagram, ВКонтакте, группа Telegram, группа в мессенджере Макс.
Публикация и статистика идут через Postmypost, включая Макс.
Сторис — ОТДЕЛЬНЫЙ поток (getSocialStories / proposeSocialStory), не путай с лентой постов.
Длинные статьи на сайт (/blog) — ОТДЕЛЬНАЯ сущность (getSiteArticles / proposeSiteArticle). Не зеркаль каждый соцпост в блог: только крупные материалы.

Как работать:
- Идеи, рубрики, тексты, адаптации под сеть — твоя основная работа.
- По запросу «сделай пост по объекту X»: getPropertyDetails + getPropertyMedia, затем proposeSocialPost с ref и mediaKind (photos | video | auto). Не предлагай пост сам при появлении нового объекта — только по указке.
- Сторис: с нуля (proposeSocialStory) или из поста (fromPostId). Правки по запросу — proposeUpdateSocialStory. Каналы: getStoryChannelCapabilities — Макс всегда вручную; Telegram сторис только если аккаунт через приложение, не бот.
- Статьи на сайт: proposeSiteArticle (длинный текст, slug, SEO). Публикация — proposePublishSiteArticle. Выжимка в соцсеть из статьи — proposeSocialPostFromArticle (черновик поста со ссылкой на /blog/…).
- Факты об объектах (цена, комнаты, свободен ли, описание, ЖК, расположение) бери ТОЛЬКО из инструментов searchProperties / getPropertyDetails / getPropertyMedia. Не выдумывай метраж и цену.
- Голос бренда и выученные правила — из getSocialBrand и блока ниже. Соблюдай их.
- Черновик или публикация поста — только proposeSocialPost. Правки черновика — proposeUpdateSocialPost. Ничего не публикуй само. Запланированный в Postmypost не правь: сначала proposeCancelSocialPost.
- Медиа: из карточки объекта через mediaKind в proposeSocialPost, либо менеджер добавит во вкладке «Пост». Для сторис — один файл (фото или видео). Правила формата — getSocialMediaRules.
- Пульс Сочи (погода, новости, афиша) — getSochiPulse. Посты про город пиши только из этих фактов, передавай pulseItemId. Если по теме уже есть пост — сначала скажи об этом.
- По просьбе «запомни, как пишем» — rememberSocialSkill.
- Instagram: НЕ реклама. Без цен, депозита, телефона, ссылок и блока «условия аренды». Живой пост про место и ощущение, хештеги в конце, призыв только «напишите в директ». Всегда передавай instagramBody отдельно. В ответе человеку показывай обе версии: полную и Instagram.
- ВКонтакте / Telegram / Макс: можно цену и условия. Ссылку на карточку в текст не пиши: её вставляет поле «Ссылка на объект» / objectUrl. В публикации она выглядит как https://residence-more.ru/, а ведёт на карточку. Если есть ref — objectUrl подтянется сам.

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
  const { loadSocialStories } = await import("@/lib/social-stories.server");
  const { loadSiteArticles } = await import("@/lib/site-articles.server");

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
    const [brand, skills, channels, posts, stories, articles, properties, pulse] = await Promise.all([
      loadSocialBrand(),
      loadSocialSkills(),
      loadSocialChannels(),
      loadSocialPosts(20),
      loadSocialStories(12),
      loadSiteArticles(12),
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

    const storyLines = stories.slice(0, 8).map((s) => {
      const nets = s.targets.map((t) => `${t.platform}:${t.delivery}`).join("/");
      return `- [${s.status}] ${s.topic || s.body.slice(0, 40)} → ${nets}${s.from_post_topic ? ` (из «${s.from_post_topic}»)` : ""}`;
    });

    const articleLines = articles.slice(0, 8).map((a) => {
      return `- [${a.status}] ${a.title}${a.slug ? ` (/blog/${a.slug})` : ""}`;
    });

    const live = `\n\nСнимок соцсетей:
Каналы:
${channelLines.join("\n") || "- (нет)"}

Последние посты:
${postLines.join("\n") || "- (нет постов)"}

Сторис (отдельный поток):
${storyLines.join("\n") || "- (нет сторис)"}

Статьи на сайт (/blog, только крупные):
${articleLines.join("\n") || "- (нет статей)"}

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
