import photoWatermarkUrl from "@/assets/site/photo-watermark.png";

import { PHOTO_WATERMARK_OPACITY, PHOTO_WATERMARK_WIDTH_RATIO } from "@/lib/photo-watermark-style";

let markImage: Promise<HTMLImageElement> | null = null;

function loadWatermarkImage() {
  if (!markImage) {
    markImage = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth < 8 || img.naturalHeight < 8) {
          markImage = null;
          reject(new Error("водяной знак пустой"));
          return;
        }
        resolve(img);
      };
      img.onerror = () => {
        markImage = null;
        reject(new Error("не удалось загрузить водяной знак"));
      };
      img.src = photoWatermarkUrl;
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
