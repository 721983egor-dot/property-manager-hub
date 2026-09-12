import { tool } from "ai";
import { z } from "zod";

import { propertyLabel } from "@/lib/ai/context.server";
import {
  addSocialSkill,
  loadSocialBrand,
  loadSocialChannels,
  loadSocialPosts,
  loadSocialSkills,
  removeSocialSkill,
} from "@/lib/social.server";

import type { AssistantToolContext } from "@/lib/ai/context.server";

const platformsSchema = z
  .array(z.enum(["instagram", "vk", "telegram", "max"]))
  .min(1)
  .describe("Сети: instagram, vk, telegram, max");

/**
 * Соцсети: чтение ленты/статистики и предложения публикаций.
 * Изменения только через propose* — менеджер подтверждает кнопкой.
 */
export function createSocialTools(ctx: AssistantToolContext) {
  const label = async (ref: string) => {
    const p = await ctx.findProperty(ref);
    if (!p) return null;
    return { id: p["id"] as string, text: propertyLabel(p as never), row: p };
  };

  return {
    getSocialChannels: tool({
      description:
        "Каналы соцсетей RM OS: Instagram, ВКонтакте, Telegram, Макс. Видно, подключён ли аккаунт Postmypost.",
      inputSchema: z.object({}),
      execute: async () => {
        const channels = await loadSocialChannels();
        return channels.map((c) => ({
          platform: c.platform,
          name: c.name,
          enabled: c.enabled,
          connected: Boolean(c.postmypost_account_id),
          error: c.last_error || undefined,
        }));
      },
    }),

    getSocialPosts: tool({
      description:
        "Лента постов соцсетей: черновики, очередь, опубликованные. Можно фильтровать по статусу.",
      inputSchema: z.object({
        status: z
          .enum(["draft", "scheduled", "publishing", "published", "failed", "cancelled"])
          .optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ status, limit }) => {
        const posts = await loadSocialPosts(limit && limit > 0 ? Math.min(limit, 80) : 40);
        const filtered = status ? posts.filter((p) => p.status === status) : posts;
        return filtered.map((p) => ({
          id: p.id,
          status: p.status,
          topic: p.topic,
          body: p.body.slice(0, 400),
          platforms: p.targets.map((t) => t.platform),
          scheduledAt: p.scheduled_at,
          publishedAt: p.published_at,
          property: p.property_title,
          error: p.last_error || undefined,
        }));
      },
    }),

    getSocialStats: tool({
      description: "Сводка охватов и реакций по Instagram, VK, Telegram и Макс за последние дни.",
      inputSchema: z.object({ days: z.number().optional() }),
      execute: async ({ days }) => {
        const period = days && days > 0 ? Math.min(days, 90) : 30;
        const from = new Date(Date.now() - period * 86400000).toISOString().slice(0, 10);
        const { data, error } = await ctx.admin
          .from("social_post_stats")
          .select("platform, views, likes, comments, shares, reach")
          .gte("date", from);
        if (error) return { error: error.message };
        const totals: Record<string, { views: number; likes: number; comments: number; shares: number; reach: number }> =
          {};
        for (const row of data ?? []) {
          const cur = (totals[row.platform] ??= { views: 0, likes: 0, comments: 0, shares: 0, reach: 0 });
          cur.views += row.views;
          cur.likes += row.likes;
          cur.comments += row.comments;
          cur.shares += row.shares;
          cur.reach += row.reach;
        }
        return { days: period, totals };
      },
    }),

    getSocialBrand: tool({
      description: "Голос бренда и правила публикаций Residence More для соцсетей.",
      inputSchema: z.object({}),
      execute: async () => ({
        brand: await loadSocialBrand(),
        skills: await loadSocialSkills(),
      }),
    }),

    rememberSocialSkill: tool({
      description:
        "Запомнить правило именно для соцсетей (тон, хештеги, что не писать, как адаптировать текст под Instagram/VK/Telegram/Макс). Вызывай, когда менеджер просит «запомни», «всегда так», «больше так не пиши» в контексте постов.",
      inputSchema: z.object({
        text: z.string().describe("Правило одной фразой, по-русски, в повелительном наклонении"),
      }),
      execute: async ({ text }) => {
        try {
          await addSocialSkill(text);
          return { saved: true, text };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Не удалось сохранить правило" };
        }
      },
    }),

    forgetSocialSkill: tool({
      description: "Забыть правило соцсетей. Укажи фрагмент текста.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const removed = await removeSocialSkill(query);
        return removed ? { removed } : { error: "Такое правило не найдено" };
      },
    }),

    proposeSocialPost: tool({
      description:
        "Предложить черновик или публикацию поста в соцсети. Текст уже напиши в голосе бренда. Требует подтверждения менеджера. Макс Postmypost пока не публикует — для него сохранится текст для копирования.",
      inputSchema: z.object({
        topic: z.string().describe("Короткая тема поста"),
        body: z.string().describe("Готовый текст поста"),
        platforms: platformsSchema,
        ref: z.string().optional().describe("Объект, если пост про конкретную квартиру/дом"),
        scheduledAt: z
          .string()
          .optional()
          .describe("ISO-дата публикации, если это не «прямо сейчас»"),
        publishNow: z.boolean().optional(),
      }),
      execute: async ({ topic, body, platforms, ref, scheduledAt, publishNow }) => {
        let propertyId: string | undefined;
        let propertyText = "";
        if (ref) {
          const p = await label(ref);
          if (!p) return { error: `Объект «${ref}» не найден` };
          propertyId = p.id;
          propertyText = p.text;
        }
        const when = publishNow ? "опубликовать сейчас" : scheduledAt ? `запланировать на ${scheduledAt}` : "сохранить черновик";
        const nets = platforms.join(", ");
        const summary = `${when[0].toUpperCase()}${when.slice(1)} пост «${topic || body.slice(0, 40)}» → ${nets}${propertyText ? ` (${propertyText})` : ""}`;
        ctx.propose({
          tool: "createSocialPost",
          summary,
          input: {
            topic,
            body,
            platforms,
            propertyId: propertyId ?? null,
            scheduledAt: scheduledAt || null,
            publish: Boolean(publishNow || scheduledAt),
          },
        });
        return { proposed: true, summary, body };
      },
    }),

    proposePublishSocialPost: tool({
      description: "Предложить отправить уже сохранённый черновик в Postmypost (сейчас или по расписанию поста).",
      inputSchema: z.object({
        postId: z.string(),
        immediate: z.boolean().optional(),
      }),
      execute: async ({ postId, immediate }) => {
        const posts = await loadSocialPosts(80);
        const post = posts.find((p) => p.id === postId);
        if (!post) return { error: "Пост не найден" };
        const summary = `${immediate ? "Опубликовать сейчас" : "Отправить в очередь"} «${post.topic || post.body.slice(0, 40)}»`;
        ctx.propose({ tool: "publishSocialPost", summary, input: { postId, immediate: Boolean(immediate) } });
        return { proposed: true, summary };
      },
    }),

    proposeCancelSocialPost: tool({
      description: "Предложить отменить запланированный пост.",
      inputSchema: z.object({ postId: z.string() }),
      execute: async ({ postId }) => {
        const posts = await loadSocialPosts(80);
        const post = posts.find((p) => p.id === postId);
        if (!post) return { error: "Пост не найден" };
        const summary = `Отменить пост «${post.topic || post.body.slice(0, 40)}»`;
        ctx.propose({ tool: "cancelSocialPost", summary, input: { postId } });
        return { proposed: true, summary };
      },
    }),

    proposeSaveSocialBrand: tool({
      description: "Предложить обновить голос бренда для соцсетей. Передавай только поля, которые нужно изменить.",
      inputSchema: z.object({
        voice: z.string().optional(),
        audience: z.string().optional(),
        hashtags: z.string().optional(),
        forbidden: z.string().optional(),
        cta: z.string().optional(),
        examples: z.string().optional(),
      }),
      execute: async (fields) => {
        const current = await loadSocialBrand();
        const next = { ...current, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null)) };
        const summary = "Обновить голос бренда для соцсетей";
        ctx.propose({ tool: "saveSocialBrand", summary, input: next });
        return { proposed: true, summary };
      },
    }),
  };
}
