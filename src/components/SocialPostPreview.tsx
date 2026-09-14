import { Heart, MessageCircle, Send, Bookmark } from "lucide-react";

import { PLATFORM_LABEL, type SocialPlatform } from "@/lib/social";
import { adaptPostForPlatform } from "@/lib/social-adapt";
import type { SocialMediaItem } from "@/lib/social-media";

type Props = {
  body: string;
  platforms: SocialPlatform[];
  topic?: string;
  variants?: Partial<Record<SocialPlatform, string>>;
  media?: SocialMediaItem[];
};

export function SocialPostPreview({ body, platforms, topic, variants, media }: Props) {
  const list = platforms.length ? platforms : (["instagram", "vk", "telegram", "max"] as SocialPlatform[]);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {list.map((platform) => (
        <PreviewFrame
          key={platform}
          platform={platform}
          text={adaptPostForPlatform(variants?.[platform] || body, platform)}
          topic={topic}
          media={media}
        />
      ))}
    </div>
  );
}

function PreviewFrame({
  platform,
  text,
  topic,
  media,
}: {
  platform: SocialPlatform;
  text: string;
  topic?: string;
  media?: SocialMediaItem[];
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{PLATFORM_LABEL[platform]}</p>
        {platform === "instagram" ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
            Без цен и оферты
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">С ценой и ссылкой</span>
        )}
      </div>
      {platform === "instagram" ? (
        <InstagramFrame text={text} media={media} />
      ) : platform === "vk" ? (
        <VkFrame text={text} topic={topic} media={media} />
      ) : platform === "telegram" ? (
        <TelegramFrame text={text} media={media} />
      ) : (
        <MaxFrame text={text} media={media} />
      )}
    </div>
  );
}

function MediaSlot({ media }: { media?: SocialMediaItem[] }) {
  const first = media?.[0];
  if (!first?.url) {
    return (
      <div className="grid aspect-[4/5] place-items-center bg-gradient-to-br from-sky-100 via-stone-100 to-teal-100 text-xs text-muted-foreground">
        Фото или видео
      </div>
    );
  }
  return (
    <div className="relative aspect-[4/5] bg-black">
      {first.kind === "video" ? (
        <video src={first.url} className="h-full w-full object-cover" muted playsInline />
      ) : (
        <img src={first.url} alt="" className="h-full w-full object-cover" />
      )}
      {media && media.length > 1 ? (
        <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          1/{media.length}
        </span>
      ) : first.kind === "video" ? (
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">видео</span>
      ) : null}
    </div>
  );
}

function InstagramFrame({ text, media }: { text: string; media?: SocialMediaItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white text-[13px] shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="grid size-8 place-items-center rounded-full bg-[#1b365d] text-[10px] font-semibold text-white">
          РМ
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">residence_more</p>
          <p className="text-[11px] text-muted-foreground">Сочи</p>
        </div>
      </div>
      <MediaSlot media={media} />
      <div className="flex items-center gap-3 px-3 py-2">
        <Heart className="size-5" />
        <MessageCircle className="size-5" />
        <Send className="size-5" />
        <Bookmark className="ml-auto size-5" />
      </div>
      <p className="whitespace-pre-wrap px-3 pb-3 leading-snug">
        <span className="font-semibold">residence_more </span>
        {text || "Текст появится здесь"}
      </p>
    </div>
  );
}

function VkFrame({ text, topic, media }: { text: string; topic?: string; media?: SocialMediaItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white text-[13px] shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="grid size-9 place-items-center rounded-lg bg-[#0077ff] text-[10px] font-bold text-white">
          VK
        </span>
        <div>
          <p className="font-semibold">РЕЗИДЕНЦИЯ & МОРЕ</p>
          <p className="text-[11px] text-muted-foreground">только что</p>
        </div>
      </div>
      {topic ? <p className="px-3 text-sm font-medium">{topic}</p> : null}
      <p className="whitespace-pre-wrap px-3 py-2 leading-snug">{text || "Текст появится здесь"}</p>
      <div className="mx-3 mb-3 overflow-hidden rounded-lg border border-border">
        <MediaSlot media={media} />
        <p className="bg-muted px-3 py-2 text-[12px] text-muted-foreground">residence-more.ru</p>
      </div>
      <div className="flex gap-4 border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
        <span>Нравится</span>
        <span>Комментировать</span>
        <span>Поделиться</span>
      </div>
    </div>
  );
}

function TelegramFrame({ text, media }: { text: string; media?: SocialMediaItem[] }) {
  return (
    <div className="rounded-xl border border-border bg-[#e7f0f8] p-3 shadow-sm">
      <p className="mb-2 text-[12px] font-medium text-[#2a6ea8]">Резиденция & Море</p>
      <div className="overflow-hidden rounded-2xl rounded-tl-sm bg-white text-[13px] shadow-sm">
        {media?.length ? <MediaSlot media={media} /> : null}
        <div className="px-3 py-2">
          <p className="whitespace-pre-wrap leading-snug">{text || "Текст появится здесь"}</p>
          <p className="mt-1 text-right text-[10px] text-muted-foreground">сейчас</p>
        </div>
      </div>
    </div>
  );
}

function MaxFrame({ text, media }: { text: string; media?: SocialMediaItem[] }) {
  return (
    <div className="rounded-xl border border-border bg-[#f4f1ea] p-3 shadow-sm">
      <p className="mb-2 text-[12px] font-medium text-[#5b4636]">Макс · Резиденция & Море</p>
      <div className="overflow-hidden rounded-2xl rounded-tl-sm bg-white text-[13px] shadow-sm">
        {media?.length ? <MediaSlot media={media} /> : null}
        <div className="px-3 py-2">
          <p className="whitespace-pre-wrap leading-snug">{text || "Текст появится здесь"}</p>
          <p className="mt-1 text-right text-[10px] text-muted-foreground">сейчас</p>
        </div>
      </div>
    </div>
  );
}
