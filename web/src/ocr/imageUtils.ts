import { BBox } from "./types";

export function loadImageFromFile(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

export function drawToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/**
 * 9절: 2차 인식을 위해 채널명/제목 영역만 잘라 확대·여백·대비 처리한다.
 * 내부 crop은 OCR 입력용일 뿐 화면 표시는 바꾸지 않는다.
 */
export function cropRegion(sourceCanvas: HTMLCanvasElement, bbox: BBox, opts?: { paddingRatio?: number; scale?: number }): HTMLCanvasElement {
  const paddingRatio = opts?.paddingRatio ?? 0.25;
  const scale = opts?.scale ?? 2.5;
  const w = bbox.x1 - bbox.x0;
  const h = bbox.y1 - bbox.y0;
  const padX = w * paddingRatio;
  const padY = h * paddingRatio;

  const sx = Math.max(0, bbox.x0 - padX);
  const sy = Math.max(0, bbox.y0 - padY);
  const sw = Math.min(sourceCanvas.width - sx, w + padX * 2);
  const sh = Math.min(sourceCanvas.height - sy, h + padY * 2);

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  const ctx = out.getContext("2d")!;
  // 흰 배경 위에 확대 — 대비를 높여 작은 글자 인식률을 개선한다 (9절).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

/**
 * 색상 기반 보조 신호: 해당 줄 영역의 평균 밝기/채도를 계산해 "진한 제목" vs "옅은 회색 본문"을
 * 구분하는 데 참고한다. 이 값 하나만으로 확정하지 않고 간격 등 다른 신호와 함께 쓴다 (8절).
 */
export function sampleLineDarkness(sourceCanvas: HTMLCanvasElement, bbox: BBox): number {
  const ctx = sourceCanvas.getContext("2d")!;
  const x = Math.max(0, Math.round(bbox.x0));
  const y = Math.max(0, Math.round(bbox.y0));
  const w = Math.max(1, Math.min(sourceCanvas.width - x, Math.round(bbox.x1 - bbox.x0)));
  const h = Math.max(1, Math.min(sourceCanvas.height - y, Math.round(bbox.y1 - bbox.y0)));
  const data = ctx.getImageData(x, y, w, h).data;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    // 매우 밝은(배경) 픽셀은 제외하고 글자로 추정되는 어두운 픽셀만 평균
    if (luminance < 200) {
      sum += luminance;
      count++;
    }
  }
  if (count === 0) return 255; // 글자를 못 찾음 (거의 빈 줄)
  return sum / count;
}
