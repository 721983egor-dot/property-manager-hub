import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  PHOTO_ASPECT_PRESETS,
  clampCrop,
  coverCrop,
  type SocialMediaCrop,
} from "@/lib/social-media";

type Props = {
  open: boolean;
  file: File | null;
  busy?: boolean;
  onCancel: () => void;
  onApply: (crop: SocialMediaCrop) => void;
};

export function SocialPhotoCropper({ open, file, busy, onCancel, onApply }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [url, setUrl] = useState("");
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [aspect, setAspect] = useState(4 / 5);
  const [crop, setCrop] = useState<SocialMediaCrop>({ x: 0, y: 0, w: 1, h: 1 });
  const drag = useRef<{ px: number; py: number; crop: SocialMediaCrop } | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  useEffect(() => {
    if (!open) return;
    setAspect(4 / 5);
  }, [open, file]);

  const onImageLoad = (img: HTMLImageElement) => {
    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    setNatural({ w, h });
    setCrop(coverCrop(w, h, aspect));
  };

  const changeAspect = (value: number) => {
    setAspect(value);
    setCrop(coverCrop(natural.w, natural.h, value));
  };

  const zoom = crop.w;
  const setZoom = (nextW: number) => {
    const ratio = crop.h / crop.w;
    const w = Math.min(1, Math.max(0.18, nextW));
    const h = Math.min(1, w * ratio);
    const cx = crop.x + crop.w / 2;
    const cy = crop.y + crop.h / 2;
    setCrop(
      clampCrop({
        w,
        h,
        x: cx - w / 2,
        y: cy - h / 2,
      }),
    );
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { px: event.clientX, py: event.clientY, crop };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dx = (event.clientX - drag.current.px) / rect.width;
    const dy = (event.clientY - drag.current.py) / rect.height;
    setCrop(
      clampCrop({
        ...drag.current.crop,
        x: drag.current.crop.x + dx,
        y: drag.current.crop.y + dy,
      }),
    );
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Кадр для соцсетей</DialogTitle>
          <DialogDescription>
            Instagram принимает фото от 4:5 до широкого 1.91:1. Двигайте рамку, чтобы выбрать нужную
            часть снимка.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {PHOTO_ASPECT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => changeAspect(preset.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                Math.abs(aspect - preset.value) < 0.01
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="flex justify-center overflow-hidden rounded-lg bg-black">
          <div className="relative inline-block max-h-[60vh] max-w-full">
            {url ? (
              <img
                ref={imgRef}
                src={url}
                alt=""
                className="block max-h-[60vh] max-w-full select-none"
                draggable={false}
                onLoad={(e) => onImageLoad(e.currentTarget)}
              />
            ) : null}
            {url ? (
              <>
                <div
                  className="pointer-events-none absolute bg-black/55"
                  style={{ left: 0, top: 0, right: 0, height: `${crop.y * 100}%` }}
                />
                <div
                  className="pointer-events-none absolute bg-black/55"
                  style={{ left: 0, bottom: 0, right: 0, height: `${(1 - crop.y - crop.h) * 100}%` }}
                />
                <div
                  className="pointer-events-none absolute bg-black/55"
                  style={{
                    left: 0,
                    top: `${crop.y * 100}%`,
                    width: `${crop.x * 100}%`,
                    height: `${crop.h * 100}%`,
                  }}
                />
                <div
                  className="pointer-events-none absolute bg-black/55"
                  style={{
                    right: 0,
                    top: `${crop.y * 100}%`,
                    width: `${(1 - crop.x - crop.w) * 100}%`,
                    height: `${crop.h * 100}%`,
                  }}
                />
                <div
                  className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.w * 100}%`,
                    height: `${crop.h * 100}%`,
                  }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
              </>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Масштаб рамки</p>
          <Slider value={[zoom]} min={0.18} max={1} step={0.01} onValueChange={(v) => setZoom(v[0] ?? zoom)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
          <Button disabled={busy} onClick={() => onApply(clampCrop(crop))}>
            Применить кадр
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
