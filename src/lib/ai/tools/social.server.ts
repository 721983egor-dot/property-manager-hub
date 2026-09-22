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
import { loadSocialStories, storyPlatformHints } from "@/lib/social-stories.server";

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
        "Правила фото и видео для постов через Postmypost: JPEG до 4 МБ, кадр 4:5–1.91:1, видео MP4 до 45 МБ. Медиа можно взять из карточки объекта (getPropertyMedia / mediaKind в proposeSocialPost) или менеджер добавит во вкладке «Пост».",
      inputSchema: z.object({}),
      execute: async () => ({ rules: socialMediaRulesText() }),
    }),

    getPropertyMedia: tool({
      description:
        "Фото и видео из карточки объекта для поста в соцсети. Пути файлов — те же, что уходят в Postmypost. Вызывай перед proposeSocialPost по объекту, чтобы решить: фото или видео.",
      inputSchema: z.object({
        ref: z.string().describe("Номер объекта (ref_id), id или название"),
      }),
      execute: async ({ ref }) => {
        const p = await ctx.findProperty(ref);
        if (!p) return { error: `Объект «${ref}» не найден` };
        const { loadPropertySocialMedia } = await import("@/lib/social.server");
        const media = await loadPropertySocialMedia(String(p["id"]));
        if (!media) return { error: "Медиа объекта не найдены" };
        return {
          propertyId: media.propertyId,
          label: media.label,
          photoCount: media.photos.length,
          photos: media.photos.slice(0, 12),
          video: media.video,
          externalVideo: media.externalVideo,
          hint: media.video
            ? "Можно предложить пост с видео или с фото (mediaKind)."
            : media.photos.length
              ? "Есть фото — передай mediaKind: photos в proposeSocialPost."
              : "В карточке нет файла фото/видео — текст без медиа или менеджер добавит вручную.",
        };
      },
    }),

    proposeSocialPost: tool({
      description:
        "Предложить черновик или публикацию. По запросу «пост по объекту X»: возьми факты из getPropertyDetails, медиа через mediaKind (photos|video|auto). body — полная версия с ценой для VK/Telegram/Макс. instagramBody — обычный пост БЕЗ цен. Ничего не публикуй само.",
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
        mediaKind: z
          .enum(["photos", "video", "auto", "none"])
          .optional()
          .describe(
            "Медиа из карточки объекта: photos, video, auto (фото или видео), none. По умолчанию auto, если указан ref.",
          ),
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
      execute: async ({
        topic,
        body,
        instagramBody,
        platforms,
        ref,
        mediaKind,
        pulseItemId,
        scheduledAt,
        publishNow,
        objectUrl,
      }) => {
        let propertyId: string | undefined;
        let propertyText = "";
        let media:
          | {
              path: string;
              kind: "photo" | "video";
              mime: string;
              bytes: number;
              width?: number | null;
              height?: number | null;
              durationSec?: number | null;
            }[]
          | undefined;
        let resolvedObjectUrl = objectUrl?.trim() || "";
        if (ref) {
          const p = await label(ref);
          if (!p) return { error: `Объект «${ref}» не найден` };
          propertyId = p.id;
          propertyText = p.text;
          const { buildPropertySocialDraft } = await import("@/lib/social.server");
          const draft = await buildPropertySocialDraft(p.id, mediaKind ?? "auto");
          if (!resolvedObjectUrl) resolvedObjectUrl = draft.objectUrl;
          if ((mediaKind ?? "auto") !== "none" && draft.media.length) {
            media = draft.media.map((item) => ({
              path: item.path,
              kind: item.kind,
              mime: item.mime,
              bytes: item.bytes,
              width: item.width,
              height: item.height,
              durationSec: item.durationSec,
            }));
          }
        }
        const when = publishNow ? "опубликовать сейчас" : scheduledAt ? `запланировать на ${scheduledAt}` : "сохранить черновик";
        const nets = platforms.join(", ");
        const igNote = platforms.includes("instagram") ? "; Instagram — без цен и оферты" : "";
        const mediaNote = media?.length
          ? media[0]!.kind === "video"
            ? "; +видео из карточки"
            : `; +${media.length} фото из карточки`
          : "";
        const summary = `${when.charAt(0).toUpperCase()}${when.slice(1)} пост «${topic || body.slice(0, 40)}» → ${nets}${igNote}${mediaNote}${propertyText ? ` (${propertyText})` : ""}`;
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
            ...(resolvedObjectUrl ? { objectUrl: resolvedObjectUrl } : {}),
            ...(instagramBody?.trim() ? { variants: { instagram: instagramBody.trim() } } : {}),
            ...(media?.length ? { media } : {}),
          },
        });
        return { proposed: true, summary, body, mediaCount: media?.length ?? 0 };
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

    getSocialStories: tool({
      description:
        "Отдельный поток сторис (не лента постов): черновики, очередь, опубликованные и заготовки «опубликовать вручную».",
      inputSchema: z.object({
        status: z
          .enum(["draft", "scheduled", "publishing", "published", "failed", "cancelled"])
          .optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ status, limit }) => {
        const stories = await loadSocialStories(limit && limit > 0 ? Math.min(limit, 80) : 40);
        const filtered = status ? stories.filter((s) => s.status === status) : stories;
        return filtered.map((s) => ({
          id: s.id,
          status: s.status,
          topic: s.topic,
          body: s.body.slice(0, 200),
          platforms: s.targets.map((t) => ({
            platform: t.platform,
            delivery: t.delivery,
            status: t.status,
            note: t.last_error || undefined,
          })),
          fromPostId: s.from_post_id,
          fromPost: s.from_post_topic,
          property: s.property_title,
          mediaCount: s.media.length,
          scheduledAt: s.scheduled_at,
          error: s.last_error || undefined,
        }));
      },
    }),

    getStoryChannelCapabilities: tool({
      description:
        "Что умеет Postmypost для сторис по каналам IG/VK/TG/Макс: API или только заготовка для ручной публикации.",
      inputSchema: z.object({}),
      execute: async () => ({ channels: storyPlatformHints() }),
    }),

    proposeSocialStory: tool({
      description:
        "Предложить сторис: с нуля (topic+body+медиа) или из поста (fromPostId). Медиа для Postmypost обязательно при публикации. Макс — всегда вручную. Требует confirm.",
      inputSchema: z.object({
        topic: z.string().describe("Короткая тема сторис"),
        body: z.string().describe("Подпись сторис (коротко)"),
        platforms: platformsSchema,
        fromPostId: z
          .string()
          .optional()
          .describe("Если сторис из существующего поста — id поста; медиа и подпись можно взять из него"),
        ref: z.string().optional().describe("Объект, если сторис про квартиру"),
        mediaPaths: z
          .array(
            z.object({
              path: z.string(),
              kind: z.enum(["photo", "video"]),
              mime: z.string().optional(),
            }),
          )
          .optional()
          .describe("Один файл: path из getPropertyMedia или из поста. Если fromPostId и пусто — возьмём медиа поста."),
        scheduledAt: z.string().optional(),
        publishNow: z.boolean().optional(),
      }),
      execute: async ({ topic, body, platforms, fromPostId, ref, mediaPaths, scheduledAt, publishNow }) => {
        let propertyId: string | null = null;
        let propertyText = "";
        let resolvedTopic = topic;
        let resolvedBody = body;
        let resolvedFromPost: string | null = fromPostId?.trim() || null;
        let media:
          | {
              path: string;
              kind: "photo" | "video";
              mime: string;
              bytes: number;
              width?: number | null;
              height?: number | null;
              durationSec?: number | null;
            }[]
          | undefined;

        if (resolvedFromPost) {
          const { buildStoryDraftFromPost } = await import("@/lib/social-stories.server");
          try {
            const draft = await buildStoryDraftFromPost(resolvedFromPost);
            if (!resolvedTopic.trim()) resolvedTopic = draft.topic;
            if (!resolvedBody.trim()) resolvedBody = draft.body;
            propertyId = draft.propertyId;
            if (!mediaPaths?.length && draft.media.length) {
              media = draft.media.map((item) => ({
                path: item.path,
                kind: item.kind,
                mime: item.mime,
                bytes: item.bytes,
                width: item.width,
                height: item.height,
                durationSec: item.durationSec,
              }));
            }
          } catch (e) {
            return { error: e instanceof Error ? e.message : "Пост не найден" };
          }
        }

        if (ref) {
          const p = await label(ref);
          if (!p) return { error: `Объект «${ref}» не найден` };
          propertyId = p.id;
          propertyText = p.text;
        }

        if (mediaPaths?.length) {
          media = mediaPaths.slice(0, 1).map((item) => ({
            path: item.path,
            kind: item.kind,
            mime: item.mime || (item.kind === "video" ? "video/mp4" : "image/jpeg"),
            bytes: 0,
          }));
        }

        const when = publishNow
          ? "опубликовать сейчас"
          : scheduledAt
            ? `запланировать на ${scheduledAt}`
            : "сохранить черновик";
        const nets = platforms.join(", ");
        const fromNote = resolvedFromPost ? " из поста" : "";
        const summary = `${when.charAt(0).toUpperCase()}${when.slice(1)} сторис${fromNote} «${resolvedTopic || resolvedBody.slice(0, 40)}» → ${nets}${propertyText ? ` (${propertyText})` : ""}`;
        ctx.propose({
          tool: "createSocialStory",
          summary,
          input: {
            topic: resolvedTopic,
            body: resolvedBody,
            platforms,
            fromPostId: resolvedFromPost,
            propertyId,
            scheduledAt: scheduledAt || null,
            publish: Boolean(publishNow || scheduledAt),
            ...(media?.length ? { media } : {}),
          },
        });
        return { proposed: true, summary, body: resolvedBody, mediaCount: media?.length ?? 0 };
      },
    }),

    proposeUpdateSocialStory: tool({
      description:
        "Предложить правки черновика сторис по запросу Егора. Запланированную сначала proposeCancelSocialStory.",
      inputSchema: z.object({
        storyId: z.string(),
        topic: z.string().optional(),
        body: z.string().optional(),
        platforms: platformsSchema.optional(),
        scheduledAt: z.string().nullable().optional(),
        publishNow: z.boolean().optional(),
      }),
      execute: async ({ storyId, topic, body, platforms, scheduledAt, publishNow }) => {
        const stories = await loadSocialStories(80);
        const story = stories.find((s) => s.id === storyId);
        if (!story) return { error: "Сторис не найдена" };
        if (story.status !== "draft" && story.status !== "failed") {
          return { error: "Править можно только черновик. Запланированную сначала снимите с очереди." };
        }
        const bits: string[] = [];
        if (topic != null) bits.push("тему");
        if (body != null) bits.push("текст");
        if (platforms) bits.push("сети");
        if (scheduledAt !== undefined) bits.push("дату");
        if (publishNow) bits.push("публикацию");
        const summary = `Править сторис «${story.topic || story.body.slice(0, 40)}»${bits.length ? `: ${bits.join(", ")}` : ""}`;
        ctx.propose({
          tool: "updateSocialStory",
          summary,
          input: {
            storyId,
            topic,
            body,
            platforms,
            scheduledAt,
            publish: Boolean(publishNow),
          },
        });
        return { proposed: true, summary };
      },
    }),

    proposePublishSocialStory: tool({
      description: "Предложить отправить черновик сторис в Postmypost (или пометить как заготовку для ручной публикации).",
      inputSchema: z.object({
        storyId: z.string(),
        immediate: z.boolean().optional(),
      }),
      execute: async ({ storyId, immediate }) => {
        const stories = await loadSocialStories(80);
        const story = stories.find((s) => s.id === storyId);
        if (!story) return { error: "Сторис не найдена" };
        const summary = `${immediate ? "Опубликовать сейчас" : "Отправить в очередь"} сторис «${story.topic || story.body.slice(0, 40)}»`;
        ctx.propose({
          tool: "publishSocialStory",
          summary,
          input: { storyId, immediate: Boolean(immediate) },
        });
        return { proposed: true, summary };
      },
    }),

    proposeCancelSocialStory: tool({
      description: "Предложить отменить запланированную сторис.",
      inputSchema: z.object({ storyId: z.string() }),
      execute: async ({ storyId }) => {
        const stories = await loadSocialStories(80);
        const story = stories.find((s) => s.id === storyId);
        if (!story) return { error: "Сторис не найдена" };
        const summary = `Отменить сторис «${story.topic || story.body.slice(0, 40)}»`;
        ctx.propose({ tool: "cancelSocialStory", summary, input: { storyId } });
        return { proposed: true, summary };
      },
    }),
  };
}
