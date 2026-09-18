import { type ReactNode } from "react";
import { Bookmark, Heart, MessageCircle, Send } from "lucide-react";

import { PLATFORM_LABEL, type SocialPlatform } from "@/lib/social";
import { adaptPostForPlatform } from "@/lib/social-adapt";
import {
  MESSENGER_CAPTION_LIMIT,
  messengerSendsTextSeparately,
  socialMediaDisplayUrl,
  type SocialMediaItem,
} from "@/lib/social-media";
import { cn } from "@/lib/utils";

type Props = {
  body: string;
  platforms: SocialPlatform[];
  topic?: string;
  variants?: Partial<Record<SocialPlatform, string>>;
  media?: SocialMediaItem[];
  objectUrl?: string;
};

export function SocialPostPreview({ body, platforms, topic, variants, media, objectUrl }: Props) {
  const list = platforms.length ? platforms : (["instagram", "vk", "telegram", "max"] as SocialPlatform[]);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {list.map((platform) => (
        <PreviewFrame
          key={platform}
          platform={platform}
          text={adaptPostForPlatform(variants?.[platform] || body, platform, objectUrl)}
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
  const files = media ?? [];
  const split = platform === "telegram" || platform === "max" ? messengerSendsTextSeparately(text, files.length) : false;
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{PLATFORM_LABEL[platform]}</p>
        {platform === "instagram" ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
            Без цен и оферты
          </span>
        ) : platform === "telegram" || platform === "max" ? (
          <span className="text-[11px] text-muted-foreground">
            {split
              ? "Альбом, затем текст"
              : files.length > 1
                ? "Альбом с подписью"
                : "С ценой и ссылкой"}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">С ценой и ссылкой</span>
        )}
      </div>
      {platform === "instagram" ? (
        <InstagramFrame text={text} media={files} />
      ) : platform === "vk" ? (
        <VkFrame text={text} topic={topic} media={files} />
      ) : platform === "telegram" ? (
        <MessengerFrame
          name="Резиденция & Море"
          tone="telegram"
          text={text}
          media={files}
          split={split}
        />
      ) : (
        <MessengerFrame name="Резиденция & Море" tone="max" text={text} media={files} split={split} />
      )}
    </div>
  );
}

function PostText({ text, className, linkClassName }: { text: string; className?: string; linkClassName?: string }) {
  const nodes: ReactNode[] = [];
  const re = /<a href="([^"]+)">([^<]*)<\/a>/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(
      <a
        key={key++}
        href={match[1]}
        target="_blank"
        rel="noreferrer"
        className={cn("underline underline-offset-2", linkClassName ?? "text-[#2a6ea8]")}
        title={match[1]}
      >
        {match[2]}
      </a>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return (
    <p className={cn("whitespace-pre-wrap leading-snug", className)}>
      {nodes.length ? nodes : text || "Текст появится здесь"}
    </p>
  );
}

function mediaSrc(item: SocialMediaItem) {
  return item.url || socialMediaDisplayUrl(item.path);
}

function MediaThumb({ item, className }: { item: SocialMediaItem; className?: string }) {
  const src = mediaSrc(item);
  if (item.kind === "video") {
    return <video src={src} className={cn("h-full w-full object-cover", className)} muted playsInline />;
  }
  return (
    <img
      src={src}
      alt=""
      className={cn("h-full w-full object-cover", className)}
      referrerPolicy="no-referrer"
      onError={(event) => {
        const fallback = socialMediaDisplayUrl(item.path);
        if (event.currentTarget.src.includes(fallback)) return;
        event.currentTarget.src = fallback;
      }}
    />
  );
}

/** Раскладка альбома как в Telegram / Postmypost, не карусель Instagram. */
function albumRows(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [1];
  if (count === 2) return [2];
  if (count === 3) return [2, 1];
  if (count === 4) return [2, 2];
  if (count === 5) return [2, 3];
  if (count === 6) return [3, 3];
  if (count === 7) return [2, 2, 3];
  if (count === 8) return [2, 3, 3];
  if (count === 9) return [3, 3, 3];
  return [2, 3, 3, 2];
}

function AlbumGrid({ media, compact }: { media: SocialMediaItem[]; compact?: boolean }) {
  if (!media.length) return null;
  if (media.length === 1) {
    const item = media[0];
    const portrait = item.width && item.height ? item.width / item.height <= 1.05 : true;
    return (
      <div className={cn("relative overflow-hidden bg-black", portrait ? "aspect-[4/5]" : "aspect-video")}>
        <MediaThumb item={item} />
        {item.kind === "video" ? (
          <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">видео</span>
        ) : null}
      </div>
    );
  }
  const rows = albumRows(media.length);
  let index = 0;
  const rowHeight = compact ? "h-[72px] sm:h-[88px]" : "h-[86px] sm:h-[104px]";
  return (
    <div className="flex flex-col gap-px bg-black">
      {rows.map((cols, rowIndex) => {
        const slice = media.slice(index, index + cols);
        index += cols;
        return (
          <div key={rowIndex} className="grid gap-px" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {slice.map((item) => (
              <div key={item.path} className={cn("relative overflow-hidden bg-neutral-900", rowHeight)}>
                <MediaThumb item={item} />
                {item.kind === "video" ? (
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">видео</span>
                ) : null}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function InstagramFrame({ text, media }: { text: string; media: SocialMediaItem[] }) {
  const first = media[0];
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
      {first ? (
        <div className="relative aspect-[4/5] bg-neutral-900">
          <MediaThumb item={first} />
          {media.length > 1 ? (
            <span className="absolute right-2 top-2 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
              1/{media.length}
            </span>
          ) : first.kind === "video" ? (
            <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">видео</span>
          ) : null}
        </div>
      ) : (
        <div className="grid aspect-[4/5] place-items-center bg-gradient-to-br from-sky-100 via-stone-100 to-teal-100 text-xs text-muted-foreground">
          Фото или видео
        </div>
      )}
      {media.length > 1 ? (
        <div className="flex gap-1 overflow-x-auto px-3 pt-2">
          {media.map((item, index) => (
            <div key={item.path} className="relative h-10 w-10 shrink-0 overflow-hidden rounded-sm bg-neutral-200">
              <MediaThumb item={item} />
              <span className="absolute bottom-0 right-0 bg-black/55 px-1 text-[9px] text-white">{index + 1}</span>
            </div>
          ))}
        </div>
      ) : null}
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

function VkFrame({ text, topic, media }: { text: string; topic?: string; media: SocialMediaItem[] }) {
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
      <PostText text={text} className="px-3 py-2" />
      {media.length ? (
        <div className="mx-3 mb-3 overflow-hidden rounded-lg">
          <AlbumGrid media={media} />
        </div>
      ) : null}
      <div className="flex gap-4 border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
        <span>Нравится</span>
        <span>Комментировать</span>
        <span>Поделиться</span>
      </div>
    </div>
  );
}

function MessengerFrame({
  name,
  tone,
  text,
  media,
  split,
}: {
  name: string;
  tone: "telegram" | "max";
  text: string;
  media: SocialMediaItem[];
  split: boolean;
}) {
  const telegram = tone === "telegram";
  const caption = split ? "" : text;
  return (
    <div className={cn("rounded-xl border border-border p-3 shadow-sm", telegram ? "bg-[#e7f0f8]" : "bg-[#f4f1ea]")}>
      <p className={cn("mb-2 text-[12px] font-medium", telegram ? "text-[#2a6ea8]" : "text-[#5b4636]")}>{name}</p>
      {media.length ? (
        <div className="overflow-hidden rounded-2xl rounded-tl-sm bg-white text-[13px] shadow-sm">
          <AlbumGrid media={media} compact />
          {caption ? (
            <div className="px-3 py-2">
              <PostText text={caption} />
              <p className="mt-1 text-right text-[10px] text-muted-foreground">сейчас</p>
            </div>
          ) : (
            <p className="px-3 py-1.5 text-right text-[10px] text-muted-foreground">сейчас</p>
          )}
        </div>
      ) : null}
      {split || !media.length ? (
        <div
          className={cn(
            "overflow-hidden rounded-2xl rounded-tl-sm bg-white text-[13px] shadow-sm",
            media.length ? "mt-2" : "",
          )}
        >
          <div className="px-3 py-2">
            <PostText text={text} />
            <p className="mt-1 text-right text-[10px] text-muted-foreground">сейчас</p>
          </div>
        </div>
      ) : null}
      {split && media.length ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          {media.length > 1
            ? `Так уйдёт в ${telegram ? "Telegram" : "Макс"} через Postmypost: альбом, затем текст отдельным сообщением (подпись длиннее ${MESSENGER_CAPTION_LIMIT} символов).`
            : `Текст длиннее ${MESSENGER_CAPTION_LIMIT} символов — уйдёт следующим сообщением, как в Postmypost.`}
        </p>
      ) : null}
    </div>
  );
}
