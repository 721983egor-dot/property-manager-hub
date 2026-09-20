import {
  PHOTO_WATERMARK_OPACITY,
  PHOTO_WATERMARK_PUBLIC_PATH,
  PHOTO_WATERMARK_WIDTH_RATIO,
} from "@/lib/photo-watermark-style";

let markImage: Promise<HTMLImageElement> | null = null;

function loadWatermarkImage() {
  if (!markImage) {
    markImage = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        markImage = null;
        reject(new Error("не удалось загрузить водяной знак"));
      };
      img.src = PHOTO_WATERMARK_PUBLIC_PATH;
    });
  }
  return markImage;
}

/** Рисует полупрозрачный логотип в центре уже подготовленного кадра. */
export async function drawCenteredPhotoWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const mark = await loadWatermarkImage();
  const markW = Math.max(1, Math.round(width * PHOTO_WATERMARK_WIDTH_RATIO));
  const markH = Math.max(1, Math.round(markW * (mark.naturalHeight / Math.max(1, mark.naturalWidth))));
  ctx.save();
  ctx.globalAlpha = PHOTO_WATERMARK_OPACITY;
  ctx.drawImage(mark, (width - markW) / 2, (height - markH) / 2, markW, markH);
  ctx.restore();
}
