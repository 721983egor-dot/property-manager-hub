import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { SocialPhotoCropper } from "@/components/SocialPhotoCropper";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cropAndCompressPhoto, readImageSize, readVideoMeta } from "@/lib/social-media-browser";
import {
  SOCIAL_MEDIA_MAX_ITEMS,
  VIDEO_MAX_SECONDS,
  VIDEO_MIN_SECONDS,
  VIDEO_UPLOAD_MAX_BYTES,
  formatBytes,
  isHeicFile,
  isPhotoFile,
  isVideoFile,
  socialMediaDisplayUrl,
  type SocialMediaCrop,
  type SocialMediaItem,
} from "@/lib/social-media";

type PendingPhoto = { file: File; width: number; height: number };

export function SocialMediaPicker({
  items,
  onChange,
}: {
  items: SocialMediaItem[];
  onChange: (items: SocialMediaItem[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const blobUrls = useRef(new Map<string, string>());
  const [busy, setBusy] = useState(false);
  const [cropQueue, setCropQueue] = useState<PendingPhoto[]>([]);
  const cropFile = cropQueue[0] ?? null;

  useEffect(() => {
    return () => {
      blobUrls.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrls.current.clear();
    };
  }, []);

  useEffect(() => {
    const keep = new Set(items.map((item) => item.path));
    for (const [path, url] of blobUrls.current) {
      if (keep.has(path)) continue;
      URL.revokeObjectURL(url);
      blobUrls.current.delete(path);
    }
  }, [items]);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const commitItems = (next: SocialMediaItem[]) => {
    const ordered = next.map((item, index) => ({ ...item, sortOrder: index }));
    const keep = new Set(ordered.map((item) => item.path));
    for (const [path, url] of blobUrls.current) {
      if (keep.has(path)) continue;
      URL.revokeObjectURL(url);
      blobUrls.current.delete(path);
    }
    itemsRef.current = ordered;
    onChange(ordered);
  };

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    commitItems(next);
  };

  const addPrepared = async (
    file: File,
    kind: "photo" | "video",
    extra?: { width?: number; height?: number; durationSec?: number },
  ) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Нужно войти в систему");
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("kind", kind);
    if (extra?.width) form.append("width", String(extra.width));
    if (extra?.height) form.append("height", String(extra.height));
    if (extra?.durationSec) form.append("durationSec", String(extra.durationSec));
    const response = await fetch("/api/social-media-upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const payload = (await response.json().catch(() => null)) as SocialMediaItem & { error?: string } | null;
    if (!response.ok || !payload || payload.error) {
      throw new Error(payload?.error || "Не удалось загрузить файл");
    }
    const previewUrl = URL.createObjectURL(file);
    blobUrls.current.set(payload.path, previewUrl);
    const current = itemsRef.current;
    commitItems([
      ...current,
      {
        id: payload.path,
        kind: payload.kind,
        path: payload.path,
        mime: payload.mime,
        bytes: payload.bytes,
        width: payload.width,
        height: payload.height,
        durationSec: payload.durationSec,
        url: previewUrl,
        sortOrder: current.length,
      },
    ]);
  };

  const uploadPhoto = async (file: File, crop: SocialMediaCrop) => {
    setBusy(true);
    try {
      const prepared = await cropAndCompressPhoto(file, crop);
      await addPrepared(prepared.file, "photo", { width: prepared.width, height: prepared.height });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось подготовить фото");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const room = SOCIAL_MEDIA_MAX_ITEMS - itemsRef.current.length;
    if (room <= 0) {
      toast.error(`Можно прикрепить не больше ${SOCIAL_MEDIA_MAX_ITEMS} файлов`);
      return;
    }
    const files = Array.from(list).slice(0, room);
    const photos: PendingPhoto[] = [];
    for (const file of files) {
      if (isHeicFile(file)) {
        toast.error(`${file.name}: сохраните как JPG — HEIC Postmypost не принимает`);
        continue;
      }
      if (isPhotoFile(file)) {
        try {
          const size = await readImageSize(file);
          photos.push({ file, width: size.width, height: size.height });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : `Не удалось прочитать ${file.name}`);
        }
        continue;
      }
      if (isVideoFile(file)) {
        if (file.size > VIDEO_UPLOAD_MAX_BYTES) {
          toast.error(`${file.name}: исходник больше 80 МБ — сожмите файл и загрузите снова`);
          continue;
        }
        try {
          const meta = await readVideoMeta(file);
          if (meta.duration < VIDEO_MIN_SECONDS) {
            toast.error(`${file.name}: видео короче 3 секунд`);
            continue;
          }
          if (meta.duration > VIDEO_MAX_SECONDS) {
            toast.error(`${file.name}: длиннее 15 минут — обрежьте ролик`);
            continue;
          }
          setBusy(true);
          await addPrepared(file, "video", {
            width: meta.width,
            height: meta.height,
            durationSec: meta.duration,
          });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : `Не удалось загрузить ${file.name}`);
        } finally {
          setBusy(false);
        }
        continue;
      }
      toast.error(`${file.name}: нужен JPEG/PNG/WEBP или видео MP4/MOV`);
    }
    if (photos.length) setCropQueue((queue) => [...queue, ...photos]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Фото и видео</p>
        <span className="text-[11px] text-muted-foreground">
          JPEG до 4 МБ, видео MP4 до 45 МБ · не больше {SOCIAL_MEDIA_MAX_ITEMS}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((item, index) => (
          <div
            key={item.path}
            draggable
            onDragStart={(e) => {
              setDragIndex(index);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(index));
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverIndex(index);
            }}
            onDrop={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              move(dragIndex, index);
              setDragIndex(null);
              setOverIndex(null);
            }}
            className={`relative cursor-grab overflow-hidden rounded-lg border border-border bg-muted active:cursor-grabbing ${
              dragIndex === index ? "opacity-50" : ""
            } ${overIndex === index && dragIndex !== null && dragIndex !== index ? "ring-2 ring-primary" : ""}`}
          >
            {item.kind === "video" ? (
              <video
                src={item.url || socialMediaDisplayUrl(item.path)}
                className="pointer-events-none aspect-[4/5] w-full object-cover"
                muted
              />
            ) : (
              <img
                src={item.url || socialMediaDisplayUrl(item.path)}
                alt=""
                draggable={false}
                className="pointer-events-none aspect-[4/5] w-full object-cover"
                referrerPolicy="no-referrer"
                onError={(event) => {
                  const fallback = socialMediaDisplayUrl(item.path);
                  if (event.currentTarget.src.endsWith(fallback)) return;
                  event.currentTarget.src = fallback;
                }}
              />
            )}
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
              {item.kind === "video" ? "видео" : `${index + 1}`}
            </span>
            <span className="absolute bottom-7 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
              {formatBytes(item.bytes)}
            </span>
            <div className="absolute bottom-1 right-1 flex gap-0.5">
              <button
                type="button"
                className="rounded bg-black/60 p-1 text-white disabled:opacity-30"
                disabled={index === 0}
                aria-label="Сдвинуть влево"
                onClick={(e) => {
                  e.stopPropagation();
                  move(index, index - 1);
                }}
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <button
                type="button"
                className="rounded bg-black/60 p-1 text-white disabled:opacity-30"
                disabled={index === items.length - 1}
                aria-label="Сдвинуть вправо"
                onClick={(e) => {
                  e.stopPropagation();
                  move(index, index + 1);
                }}
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
            <button
              type="button"
              className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white"
              onClick={() => commitItems(items.filter((row) => row.path !== item.path))}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {items.length < SOCIAL_MEDIA_MAX_ITEMS ? (
          <button
            type="button"
            className="grid aspect-[4/5] place-items-center rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted/50"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            <span className="mt-1 text-[11px]">{busy ? "Готовим…" : "Добавить"}</span>
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />
      <p className="text-[11px] text-muted-foreground">
        Формат и вес — как у Postmypost: фото JPEG, кадр от 4:5 до широкого. Для каждого снимка
        откроется рамка. Порядок в альбоме — перетащите снимок или стрелки. Видео больше лимита
        сожмём на сервере.
      </p>
      {items.some((item) => item.kind === "video") ? (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Video className="size-3" />
          Видео уйдёт как MP4 H.264 — Telegram через Postmypost принимает до 50 МБ.
        </p>
      ) : null}
      <SocialPhotoCropper
        open={Boolean(cropFile)}
        file={cropFile?.file ?? null}
        busy={busy}
        onCancel={() => {
          if (!busy) setCropQueue((queue) => queue.slice(1));
        }}
        onApply={(crop) => {
          if (!cropFile || busy) return;
          void uploadPhoto(cropFile.file, crop).then((ok) => {
            if (ok) setCropQueue((queue) => queue.slice(1));
          });
        }}
      />
      {busy ? (
        <Button type="button" variant="ghost" size="sm" disabled>
          <Loader2 className="size-4 animate-spin" />
          Сжимаем под правила Postmypost…
        </Button>
      ) : null}
    </div>
  );
}
