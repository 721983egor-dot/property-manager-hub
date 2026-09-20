import { resolvePropertyVideo } from "@/lib/property-video";
import { cn } from "@/lib/utils";

type Props = {
  videoUrl: string | null | undefined;
  fileSrc?: string | null;
  title: string;
  className?: string;
};

/** Плеер объекта. Если видео нет — ничего не рисует (пустого окна нет). */
export function PropertyVideoPlayer({ videoUrl, fileSrc, title, className }: Props) {
  const playback = resolvePropertyVideo(videoUrl, fileSrc);
  if (!playback) return null;
  if (playback.kind === "embed") {
    return (
      <iframe
        src={playback.src}
        title={title}
        className={cn("size-full border-0", className)}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    );
  }
  return (
    <video
      src={playback.src}
      controls
      playsInline
      preload="metadata"
      className={cn("size-full bg-black object-contain", className)}
    />
  );
}
