import { tool } from "ai";
import { z } from "zod";

import { propertyLabel } from "@/lib/ai/context.server";
import { socialMediaRulesText } from "@/lib/social-media";
import { objectUrlFromPost } from "@/lib/social-adapt";
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
        "Лента и календарь постов: черновики, очередь Postmypost, опубликованные. Смотри scheduledAt — это дата в календаре раздела «Соцсети». Черновик правится через proposeUpdateSocialPost.",
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
          objectUrl: objectUrlFromPost(p.body, p.targets) || undefined,
          property: p.property_title,
          media: (p.media ?? []).map((m) => ({ kind: m.kind, bytes: m.bytes })),
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

    getSochiPulse: tool({
      description:
        "Пульс Сочи: текущая погода, свежие новости и ближайшие события. Показывает, по каким темам уже есть пост. Вызывай перед текстом про город, погоду или афишу.",
      inputSchema: z.object({
        force: z.boolean().optional().describe("true — обновить источники, а не брать кэш"),
      }),
      execute: async ({ force }) => {
        const { loadSochiPulse } = await import("@/lib/sochi-pulse.server");
        const board = await loadSochiPulse({ force: Boolean(force) });
        const compact = (item: {
          id: string;
          title: string;
          summary: string;
          source: string;
          url: string;
          startsAt: string | null;
          relatedPosts: { status: string; topic: string }[];
        }) => ({
          id: item.id,
          title: item.title,
          summary: item.summary.slice(0, 280),
          source: item.source,
          url: item.url,
          when: item.startsAt,
          alreadyPosted: item.relatedPosts.map((p) => `${p.status}: ${p.topic}`),
        });
        return {
          fetchedAt: board.fetchedAt,
          weather: board.weather ? compact(board.weather) : null,
          news: board.news.slice(0, 12).map(compact),
          events: board.events.slice(0, 10).map(compact),
          errors: board.errors,
        };
      },
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

    getSocialMediaRules: tool({
      description:
        "Правила фото и видео для постов через Postmypost: JPEG до 4 МБ, кадр 4:5–1.91:1, видео MP4 до 45 МБ. Файлы добавляет менеджер во вкладке «Пост».",
      inputSchema: z.object({}),
      execute: async () => ({ rules: socialMediaRulesText() }),
    }),

    proposeSocialPost: tool({
      description:
        "Предложить черновик или публикацию. body — полная версия с ценой для VK/Telegram/Макс. instagramBody — обычный пост БЕЗ цен, телефона и оферты. Если instagramBody не передан, система сама уберёт рекламу.",
      inputSchema: z.object({
        topic: z.string().describe("Короткая тема поста"),
        body: z.string().describe("Полный текст с ценой и условиями для VK, Telegram и Макс"),
        instagramBody: z
          .string()
          .optional()
          .describe("Версия для Instagram без цен и рекламы. Если пусто — система соберёт сама."),
        objectUrl: z
          .string()
          .optional()
          .describe(
            "Адрес карточки объекта. В VK/Telegram/Макс будет видно https://residence-more.ru/, переход на этот адрес. Не вставляй ссылку в body.",
          ),
        platforms: platformsSchema,
        ref: z.string().optional().describe("Объект, если пост про конкретную квартиру/дом"),
        pulseItemId: z
          .string()
          .optional()
          .describe("id пункта Пульса Сочи, если пост по погоде, новости или событию"),
        scheduledAt: z
          .string()
          .optional()
          .describe("ISO-дата публикации, если это не «прямо сейчас»"),
        publishNow: z.boolean().optional(),
      }),
      execute: async ({ topic, body, instagramBody, platforms, ref, pulseItemId, scheduledAt, publishNow, objectUrl }) => {
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
        const igNote = platforms.includes("instagram") ? "; Instagram — без цен и оферты" : "";
        const summary = `${when[0].toUpperCase()}${when.slice(1)} пост «${topic || body.slice(0, 40)}» → ${nets}${igNote}${propertyText ? ` (${propertyText})` : ""}`;
        ctx.propose({
          tool: "createSocialPost",
          summary,
          input: {
            topic,
            body,
            platforms,
            propertyId: propertyId ?? null,
            pulseItemId: pulseItemId?.trim() || null,
            scheduledAt: scheduledAt || null,
            publish: Boolean(publishNow || scheduledAt),
            objectUrl: objectUrl?.trim() || undefined,
            variants: instagramBody?.trim() ? { instagram: instagramBody.trim() } : undefined,
          },
        });
        return { proposed: true, summary, body };
      },
    }),

    proposeUpdateSocialPost: tool({
      description:
        "Предложить правки черновика или поста с ошибкой. Запланированный в Postmypost не трогай — сначала proposeCancelSocialPost. Передавай только поля, которые меняются. Фото не затираются.",
      inputSchema: z.object({
        postId: z.string(),
        topic: z.string().optional(),
        body: z.string().optional().describe("Полный текст для VK/Telegram/Макс"),
        instagramBody: z.string().optional(),
        objectUrl: z.string().optional().describe("Адрес карточки объекта"),
        platforms: platformsSchema.optional(),
        scheduledAt: z
          .string()
          .nullable()
          .optional()
          .describe("ISO-дата или null, чтобы убрать расписание"),
        publishNow: z.boolean().optional(),
      }),
      execute: async ({ postId, topic, body, instagramBody, objectUrl, platforms, scheduledAt, publishNow }) => {
        const posts = await loadSocialPosts(80);
        const post = posts.find((p) => p.id === postId);
        if (!post) return { error: "Пост не найден" };
        if (post.status !== "draft" && post.status !== "failed") {
          return { error: "Править можно только черновик. Запланированный сначала снимите с очереди." };
        }
        const bits: string[] = [];
        if (topic != null) bits.push("тему");
        if (body != null) bits.push("текст");
        if (instagramBody != null) bits.push("Instagram");
        if (objectUrl != null) bits.push("ссылку");
        if (platforms) bits.push("сети");
        if (scheduledAt !== undefined) bits.push("дату");
        if (publishNow) bits.push("публикацию");
        const summary = `Править черновик «${post.topic || post.body.slice(0, 40)}»${bits.length ? `: ${bits.join(", ")}` : ""}`;
        ctx.propose({
          tool: "updateSocialPost",
          summary,
          input: {
            postId,
            topic,
            body,
            instagramBody,
            objectUrl,
            platforms,
            scheduledAt,
            publish: Boolean(publishNow),
          },
        });
        return { proposed: true, summary };
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
