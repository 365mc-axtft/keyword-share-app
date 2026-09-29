import { useRef, useState } from "react";
import { UploadedImage, TabType } from "../../types";
import { tabAnalysesApi } from "../../api";
import { apiFileUrl, getToken } from "../../api/client";
import { runOcrPipeline } from "../../ocr/tesseractEngine";
import { DetectedGroupDraft, PostDraft } from "../../ocr/types";

interface Props {
  tabAnalysisId: string;
  tabType: TabType;
  images: UploadedImage[];
  disabled: boolean;
  onRefresh: () => void;
  onOcrDone: () => void;
}

export function UploadPanel({ tabAnalysisId, tabType, images, disabled, onRefresh, onOcrDone }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; ratio: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      await tabAnalysesApi.uploadImages(tabAnalysisId, Array.from(files));
      onRefresh();
    } catch (err: any) {
      setError(err.message ?? "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteImage(imageId: string) {
    await tabAnalysesApi.deleteImage(tabAnalysisId, imageId);
    onRefresh();
  }

  async function fetchImageBlob(image: UploadedImage): Promise<Blob> {
    const res = await fetch(apiFileUrl(`/tab-analyses/${tabAnalysisId}/images/${image.id}/file`), {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    return res.blob();
  }

  async function runOcr() {
    if (images.length === 0) return;
    setError(null);
    setOcrRunning(true);
    try {
      const sorted = [...images].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
      const mergedGroups: DetectedGroupDraft[] = [];
      const mergedPosts: (PostDraft & { uploadedImageId: string })[] = [];
      let orderOffset = 0;

      for (let idx = 0; idx < sorted.length; idx++) {
        const image = sorted[idx];
        await tabAnalysesApi.setImageOcrStatus(tabAnalysisId, image.id, "PROCESSING");
        try {
          const blob = await fetchImageBlob(image);
          const { segmentation } = await runOcrPipeline(blob, tabType, (stage, p) =>
            setProgress({ stage: `${idx + 1}/${sorted.length} 이미지 · ${stage === "layout" ? "레이아웃 인식" : "채널/제목 재인식"}`, ratio: p })
          );
          const prefix = `img${idx}_`;
          for (const g of segmentation.groups) {
            mergedGroups.push({ ...g, localId: prefix + g.localId });
          }
          for (const p of segmentation.posts) {
            mergedPosts.push({
              ...p,
              groupLocalId: p.groupLocalId ? prefix + p.groupLocalId : null,
              originalOrder: p.originalOrder + orderOffset,
              uploadedImageId: image.id,
            });
          }
          orderOffset += segmentation.posts.length;
          await tabAnalysesApi.setImageOcrStatus(tabAnalysisId, image.id, "DONE");
        } catch (err: any) {
          await tabAnalysesApi.setImageOcrStatus(tabAnalysisId, image.id, "FAILED", err?.message ?? "OCR 실패");
          throw err;
        }
      }

      await tabAnalysesApi.submitOcrResults(tabAnalysisId, {
        modules: mergedGroups,
        posts: mergedPosts.map(({ uploadedImageId, ...rest }) => ({ ...rest, uploadedImageId })),
      });
      onOcrDone();
    } catch (err: any) {
      setError(err.message ?? "OCR 처리 중 오류가 발생했습니다.");
    } finally {
      setOcrRunning(false);
      setProgress(null);
    }
  }

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold">캡처 업로드</h3>
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!disabled && (
        <div
          className={`border-2 border-dashed rounded p-6 text-center text-sm cursor-pointer ${dragOver ? "border-blue-400 bg-blue-50" : "border-slate-300"}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        >
          {uploading ? "업로드 중..." : "클릭 또는 드래그하여 캡처 이미지 업로드 (PNG/JPEG/WebP, 최대 25MB)"}
          <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>
      )}

      {images.length > 0 && (
        <ul className="text-sm divide-y divide-slate-100">
          {images.sort((a, b) => a.sequenceIndex - b.sequenceIndex).map((img) => (
            <li key={img.id} className="py-2 flex items-center justify-between">
              <span>
                {img.sequenceIndex + 1}. {img.originalName} ({(img.fileSizeBytes / 1024 / 1024).toFixed(1)}MB, {img.widthPx}×{img.heightPx})
              </span>
              <span className="flex items-center gap-2">
                <span className={`badge ${ocrStatusColor(img.ocrStatus)}`}>{ocrStatusLabel(img.ocrStatus)}</span>
                {!disabled && <button className="text-red-600 underline" onClick={() => handleDeleteImage(img.id)}>삭제</button>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!disabled && images.length > 0 && (
        <div>
          <button className="btn-primary" onClick={runOcr} disabled={ocrRunning}>
            {ocrRunning ? "OCR 실행 중..." : "OCR 실행 (브라우저에서 처리)"}
          </button>
          {progress && (
            <div className="mt-2">
              <div className="text-xs text-slate-500 mb-1">{progress.stage}</div>
              <div className="w-full bg-slate-100 rounded h-2">
                <div className="bg-blue-500 h-2 rounded" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
              </div>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-2">
            무료 브라우저 OCR(Tesseract.js, 한국어+영어)로 처리하며, 이미지는 서버에 업로드된 원본을 그대로 사용합니다.
            인식 정확도는 완벽하지 않으므로 아래 검수 화면에서 반드시 확인·수정하세요.
          </p>
        </div>
      )}
    </div>
  );
}

function ocrStatusLabel(s: string) {
  switch (s) {
    case "PENDING": return "대기";
    case "PROCESSING": return "처리중";
    case "DONE": return "완료";
    case "FAILED": return "실패";
    default: return s;
  }
}
function ocrStatusColor(s: string) {
  switch (s) {
    case "DONE": return "bg-green-50 text-green-700";
    case "FAILED": return "bg-red-50 text-red-700";
    case "PROCESSING": return "bg-blue-50 text-blue-700";
    default: return "bg-slate-100 text-slate-500";
  }
}
