import { useEffect, useRef, useState } from "react";

import { resolvePropertyVideo, youtubeEmbedSrc } from "@/lib/property-video";
import { cn } from "@/lib/utils";

type Props = {
  videoUrl: string | null | undefined;
  fileSrc?: string | null;
  title: string;
  className?: string;
  /** На сайте: старт, когда блок попал в экран (только компьютер). */
  autoplayOnView?: boolean;
};

function withEmbedAutoplay(src: string) {
  try {
    const url = new URL(src);
    if (url.hostname.includes("youtube.com") || url.hostname.includes("youtube-nocookie.com")) {
      const id = url.pathname.split("/").filter(Boolean).pop() ?? "";
      return youtubeEmbedSrc(id, { autoplay: true, origin: window.location.origin });
    }
    url.searchParams.set("autoplay", "1");
    if (url.hostname.includes("vk.com")) url.searchParams.set("js_api", "1");
    return url.toString();
  } catch {
    return src;
  }
}

function isDesktopViewport() {
  return window.matchMedia("(min-width: 1024px)").matches;
}

/** Плеер объекта. Если видео нет — ничего не рисует (пустого окна нет). */
export function PropertyVideoPlayer({
  videoUrl,
  fileSrc,
  title,
  className,
  autoplayOnView = false,
}: Props) {
  const playback = resolvePropertyVideo(videoUrl, fileSrc);
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [autoplay, setAutoplay] = useState(false);

  useEffect(() => {
    if (!autoplayOnView) return;
    setAutoplay(isDesktopViewport());
  }, [autoplayOnView]);

  useEffect(() => {
    if (!autoplay || !rootRef.current) return;
    const node = rootRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [autoplay]);

  useEffect(() => {
    if (!inView || !videoRef.current) return;
    const el = videoRef.current;
    el.muted = true;
    void el.play().catch(() => undefined);
  }, [inView]);

  if (!playback) return null;

  if (playback.kind === "embed") {
    const src = autoplay && inView ? withEmbedAutoplay(playback.src) : playback.src;
    return (
      <div ref={rootRef} className="size-full">
        <iframe
          src={src}
          title={title}
          className={cn("size-full border-0", className)}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="size-full">
      <video
        ref={videoRef}
        src={playback.src}
        controls
        playsInline
        muted={autoplay}
        preload="metadata"
        className={cn("size-full bg-black object-contain", className)}
      />
    </div>
  );
}
