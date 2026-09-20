type Props = {
  youtubeUrl?: string | null;
  vkUrl?: string | null;
  compact?: boolean;
};

function Channel({
  name,
  url,
  compact,
}: {
  name: string;
  url?: string | null;
  compact?: boolean;
}) {
  const href = (url ?? "").trim();
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span
          className={
            "size-2 shrink-0 rounded-full " + (href ? "bg-emerald-500" : "bg-muted-foreground/30")
          }
        />
        {name}
      </span>
    );
  }
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <span className="shrink-0 text-sm font-medium">{name}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-sm text-emerald-700 hover:underline"
        >
          Выложено
        </a>
      ) : (
        <span className="text-sm text-muted-foreground">Не выложено</span>
      )}
    </div>
  );
}

/** Статус ролика на YouTube и VK Видео. */
export function VideoChannelStatus({ youtubeUrl, vkUrl, compact = false }: Props) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        <Channel name="YouTube" url={youtubeUrl} compact />
        <Channel name="VK Видео" url={vkUrl} compact />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Channel name="YouTube" url={youtubeUrl} />
      <Channel name="VK Видео" url={vkUrl} />
    </div>
  );
}
