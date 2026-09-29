import { useEffect, useState } from "react";
import { apiFileUrl, getToken } from "../api/client";

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadCachedImage(path: string): Promise<HTMLImageElement> {
  if (!imageCache.has(path)) {
    const p = fetch(apiFileUrl(path), { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((res) => res.blob())
      .then(
        (blob) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
          })
      );
    imageCache.set(path, p);
  }
  return imageCache.get(path)!;
}

/**
 * 10절: "왼쪽 게시물 전체 원본 블럭"을 보여주기 위해, 업로드된 전체 캡처 이미지에서
 * 해당 게시물의 세로 구간(blockTop~blockBottom)만 잘라 하나의 이미지로 표시한다.
 * 채널명/제목 부분만 따로 잘라 별도 이미지로 노출하지 않는다 (요구사항 그대로 유지).
 */
export function OriginalPostCrop({ imagePath, blockTop, blockBottom }: { imagePath: string; blockTop: number; blockBottom: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    loadCachedImage(imagePath)
      .then((img) => {
        if (cancelled) return;
        const pad = 10;
        const top = Math.max(0, blockTop - pad);
        const bottom = Math.min(img.naturalHeight, blockBottom + pad);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = Math.max(1, bottom - top);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, top, img.naturalWidth, bottom - top, 0, 0, img.naturalWidth, bottom - top);
        setSrc(canvas.toDataURL("image/png"));
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [imagePath, blockTop, blockBottom]);

  if (!src) return <div className="bg-slate-100 animate-pulse h-20 w-full rounded" />;
  return <img src={src} alt="게시물 원본 블록" className="w-full border border-slate-200 rounded" />;
}
