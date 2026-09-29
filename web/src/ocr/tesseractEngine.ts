import { createWorker, PSM, type Worker } from "tesseract.js";
import { LayoutResult, OcrLine, SegmentationResult } from "./types";
import { loadImageFromFile, drawToCanvas, cropRegion, sampleLineDarkness } from "./imageUtils";
import { segmentBlogPosts, segmentIntegratedResults, clusterLinesIntoBlocks, LineStyle } from "./segmentation";
import { stripDateAndDots } from "./textCleanup";

let workerPromise: Promise<Worker> | null = null;

/**
 * 9절: 초기 무료 모드는 브라우저 OCR(Tesseract.js, kor+eng). 워커/코어/언어데이터를
 * 전부 이 서버(정적 파일)에서 직접 서빙하므로 외부 CDN 없이도 동작한다.
 * (엔진 인터페이스를 분리해 두었으므로, 나중에 유료 OCR로 교체하려면 이 모듈만 바꾸면 된다.)
 */
async function getWorker(onProgress?: (p: number) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("kor+eng", 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/",
      langPath: "/tesseract/lang-data",
      gzip: true,
      logger: (m) => {
        if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
      },
    });
  }
  return workerPromise;
}

export async function preloadOcrEngine(onProgress?: (p: number) => void): Promise<void> {
  await getWorker(onProgress);
}

function toLayoutResult(data: any, width: number, height: number): LayoutResult {
  const lines: OcrLine[] = (data.lines ?? [])
    .filter((l: any) => l.text && l.text.trim())
    .map((l: any) => ({
      text: l.text.trim(),
      confidence: l.confidence ?? 0,
      bbox: { x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1 },
    }));
  return { lines, imageWidth: width, imageHeight: height };
}

/** 1차: 전체 이미지 레이아웃 인식 (게시물 위치 파악용, PSM 6 — 단일 블록 가정). */
export async function recognizeLayout(image: HTMLImageElement, onProgress?: (p: number) => void): Promise<LayoutResult> {
  const worker = await getWorker(onProgress);
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  const { data } = await worker.recognize(image);
  return toLayoutResult(data, image.naturalWidth, image.naturalHeight);
}

/** 2차: 채널명(한 줄) 영역만 재인식. */
async function recognizeChannelRegion(worker: Worker, canvas: HTMLCanvasElement): Promise<{ text: string; confidence: number }> {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  const { data } = await worker.recognize(canvas);
  return { text: (data.text ?? "").trim(), confidence: data.confidence ?? 0 };
}

/** 2차: 제목(여러 줄 가능) 영역만 재인식. */
async function recognizeTitleRegion(worker: Worker, canvas: HTMLCanvasElement): Promise<{ text: string; confidence: number }> {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  const { data } = await worker.recognize(canvas);
  return { text: (data.text ?? "").trim().replace(/\s*\n\s*/g, " "), confidence: data.confidence ?? 0 };
}

export interface OcrPipelineResult {
  layout: LayoutResult;
  segmentation: SegmentationResult;
}

/**
 * 전체 파이프라인: 1차 레이아웃 인식 → (블로그탭/통합탭에 맞는) 블록 분할 →
 * 각 블록의 채널명/제목 영역만 잘라 2차 재인식 → 낮은 신뢰도/빈 결과면 1차 값을 보존.
 * (9절: 2차 결과가 빈 값/낮은 신뢰도이면 기존 결과 보존)
 */
export async function runOcrPipeline(
  file: File | Blob,
  tabType: "BLOG" | "INTEGRATED",
  onProgress?: (stage: string, p: number) => void
): Promise<OcrPipelineResult> {
  const img = await loadImageFromFile(file);
  const canvas = drawToCanvas(img);
  const worker = await getWorker();

  onProgress?.("layout", 0);
  const layout = await recognizeLayout(img, (p) => onProgress?.("layout", p));
  onProgress?.("layout", 1);

  // 색상 기반 보조 분류기: 같은 블록 내 첫 텍스트줄(헤더 제외) 대비 상대적으로 더 옅은(밝은) 줄을
  // 본문으로 잠정 판단한다. 절대 밝기 하나만으로 확정하지 않고, segmentation.ts에서 줄 간격과
  // 함께 사용된다 (8절: "색상/날짜 하나만으로 판정하지 말고 ... 함께 사용").
  const classifyStyle = (line: OcrLine): LineStyle => {
    const darkness = sampleLineDarkness(canvas, line.bbox);
    // 어두울수록(값이 작을수록) 진한 글씨. 임계값은 보수적으로 잡아 애매하면 unknown 반환 →
    // 간격 기반 휴리스틱으로 자연스럽게 폴백된다.
    if (darkness < 90) return "title";
    if (darkness > 150) return "body";
    return "unknown";
  };

  let segmentation: SegmentationResult;
  if (tabType === "BLOG") {
    segmentation = segmentBlogPosts(layout, { classifyStyle });
  } else {
    segmentation = segmentIntegratedResults(layout, { classifyStyle });
  }

  onProgress?.("detail", 0);
  const total = segmentation.posts.length || 1;
  for (let i = 0; i < segmentation.posts.length; i++) {
    const post = segmentation.posts[i];
    const headerCanvas = cropRegion(canvas, post.sourceBounds.headerBBox);
    const channelResult = await recognizeChannelRegion(worker, headerCanvas);
    if (channelResult.text && channelResult.confidence >= post.ocrConfidenceChannel - 15) {
      const cleaned = stripDateAndDots(channelResult.text);
      if (cleaned) {
        post.exposedChannelName = cleaned;
        post.ocrRawChannelName = channelResult.text;
        post.ocrConfidenceChannel = channelResult.confidence;
      }
    }

    if (post.sourceBounds.titleBBox) {
      const titleCanvas = cropRegion(canvas, post.sourceBounds.titleBBox);
      const titleResult = await recognizeTitleRegion(worker, titleCanvas);
      if (titleResult.text && titleResult.confidence >= post.ocrConfidenceTitle - 15) {
        post.titleText = titleResult.text;
        post.ocrRawTitle = titleResult.text;
        post.ocrConfidenceTitle = titleResult.confidence;
      }
    }
    onProgress?.("detail", (i + 1) / total);
  }

  return { layout, segmentation };
}
