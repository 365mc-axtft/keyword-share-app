import { LayoutResult, OcrLine, DetectedGroupDraft, PostDraft, SegmentationResult } from "./types";
import { isLikelyChromeLine, stripDateAndDots } from "./textCleanup";
import { matchModuleKeyword } from "./moduleKeywords";

interface Block {
  headerLine: OcrLine;
  titleLines: OcrLine[];
  bodyLines: OcrLine[];
  topY: number;
  bottomY: number;
  needsReview: boolean;
  needsReviewReason: string | null;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 20;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * 8절 게시물 경계 규칙의 핵심 클러스터링: "채널명 행 → 제목(여러 줄 결합) → 본문/사진(무시) →
 * 다음 헤더 직전까지"를 줄 간격(gap) 기반으로 나눈다. 색상 정보가 없는 순수 텍스트+좌표 신호만
 * 사용하므로, 애매한 경우는 needsReview로 표시하고 사람이 검수 화면에서 고치도록 한다.
 */
export type LineStyle = "header" | "title" | "body" | "unknown";

export interface ClusterOptions {
  /**
   * 선택적 스타일 분류기. DOM 레이어(tesseractEngine)는 실제 픽셀 색상/굵기를 샘플링해
   * "이 줄이 제목처럼 보이는지 본문처럼 보이는지"를 넘겨줄 수 있다. 순수 기하 정보(줄 간격)만으로는
   * 균일한 줄간격의 캡처에서 제목 2번째 줄과 본문 1번째 줄을 구분하지 못하는 경우가 있기 때문이다.
   * 넘기지 않으면(순수 유닛테스트 등) 간격 기반 휴리스틱만 사용한다.
   */
  classifyStyle?: (line: OcrLine) => LineStyle;
}

export function clusterLinesIntoBlocks(lines: OcrLine[], opts: ClusterOptions = {}): Block[] {
  if (lines.length === 0) return [];
  const sorted = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const heights = sorted.map((l) => l.bbox.y1 - l.bbox.y0).filter((h) => h > 0);
  const lineH = median(heights);
  const NEW_BLOCK_GAP = lineH * 1.9; // 이 이상 벌어지면 새 게시물 헤더로 간주
  const TITLE_MERGE_GAP = lineH * 1.4; // 이 이하 간격이면 같은 제목(여러 줄)으로 결합

  const blocks: Block[] = [];
  let current: OcrLine[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const line = sorted[i];
    if (current.length === 0) {
      current.push(line);
      continue;
    }
    const prev = current[current.length - 1];
    const gap = line.bbox.y0 - prev.bbox.y1;
    if (gap > NEW_BLOCK_GAP) {
      blocks.push(buildBlock(current, TITLE_MERGE_GAP, opts));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(buildBlock(current, TITLE_MERGE_GAP, opts));

  return blocks;
}

function buildBlock(lines: OcrLine[], titleMergeGap: number, opts: ClusterOptions): Block {
  const headerLine = lines[0];
  const titleLines: OcrLine[] = [];
  const bodyLines: OcrLine[] = [];
  let needsReview = false;
  let needsReviewReason: string | null = null;

  const headerStripped = stripDateAndDots(headerLine.text);
  if (!headerStripped) {
    needsReview = true;
    needsReviewReason = "채널명 줄에서 날짜/기호를 제외하니 텍스트가 비었습니다.";
  }

  const MAX_TITLE_LINES = 2; // 제목은 보통 1~2줄 (8절: 두 줄 이상이면 결합)
  let collectingTitle = true;
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const line = lines[i];
    const gap = line.bbox.y0 - prev.bbox.y1;
    const style = opts.classifyStyle?.(line) ?? "unknown";

    let isTitleLine: boolean;
    if (style === "body") {
      isTitleLine = false;
    } else if (style === "title") {
      isTitleLine = collectingTitle && titleLines.length < MAX_TITLE_LINES;
    } else {
      isTitleLine = collectingTitle && titleLines.length < MAX_TITLE_LINES && gap <= titleMergeGap;
      // 18절 4항: 본문/사진 속 글자가 제목에 섞이면 안 됨. 색상 신호가 없어("unknown") 줄 간격만으로
      // 두 번째 제목 줄을 인정하는 경우는 본문일 가능성도 있으므로, 조용히 합치지 않고 검수 필요로
      // 표시해 사람이 검수 화면(10절)에서 직접 확인하게 한다 (특히 첫 줄은 채널명 바로 다음 줄이라
      // 제목일 확률이 매우 높으므로 그대로 두고, 두 번째 줄부터만 표시한다).
      if (isTitleLine && titleLines.length === 1) {
        needsReview = true;
        needsReviewReason = needsReviewReason ?? "제목 두 번째 줄이 본문일 수 있습니다 (자동 판정 모호) — 확인해 주세요.";
      }
    }

    if (isTitleLine) {
      titleLines.push(line);
    } else {
      collectingTitle = false;
      bodyLines.push(line);
    }
  }

  if (titleLines.length === 0 && lines.length > 1) {
    // 헤더 바로 다음 줄과의 간격이 넓어 제목을 못 찾음 — 확인 필요
    needsReview = true;
    needsReviewReason = needsReviewReason ?? "헤더 다음 제목 줄을 명확히 구분하지 못했습니다.";
  }

  const allLines = [headerLine, ...titleLines, ...bodyLines];
  return {
    headerLine,
    titleLines,
    bodyLines,
    topY: Math.min(...allLines.map((l) => l.bbox.y0)),
    bottomY: Math.max(...allLines.map((l) => l.bbox.y1)),
    needsReview,
    needsReviewReason,
  };
}

function blockToPostDraft(block: Block, order: number, groupLocalId: string | null): PostDraft {
  const exposedChannelName = stripDateAndDots(block.headerLine.text);
  const titleText = block.titleLines.map((l) => l.text.trim()).join(" ").trim();
  const confChannel = block.headerLine.confidence;
  const confTitle = block.titleLines.length
    ? block.titleLines.reduce((s, l) => s + l.confidence, 0) / block.titleLines.length
    : 0;
  return {
    groupLocalId,
    originalOrder: order,
    exposedChannelName,
    titleText,
    channelIdOrUrlGuess: null,
    ocrRawChannelName: block.headerLine.text,
    ocrRawTitle: block.titleLines.map((l) => l.text).join("\n"),
    ocrConfidenceChannel: confChannel,
    ocrConfidenceTitle: confTitle,
    sourceBounds: {
      headerBBox: block.headerLine.bbox,
      titleBBox: block.titleLines[0]
        ? {
            x0: Math.min(...block.titleLines.map((l) => l.bbox.x0)),
            y0: Math.min(...block.titleLines.map((l) => l.bbox.y0)),
            x1: Math.max(...block.titleLines.map((l) => l.bbox.x1)),
            y1: Math.max(...block.titleLines.map((l) => l.bbox.y1)),
          }
        : null,
      blockTop: block.topY,
      blockBottom: block.bottomY,
    },
    needsReview: block.needsReview,
    needsReviewReason: block.needsReviewReason,
  };
}

/** 블로그탭: 모듈 개념 없이 전체를 하나의 목록으로 보고 게시물 블록만 추출한다 (8절). */
export function segmentBlogPosts(layout: LayoutResult, opts: ClusterOptions = {}): SegmentationResult {
  const usable = layout.lines.filter(
    (l) => !isLikelyChromeLine(l.text, l.bbox.y0 / Math.max(1, layout.imageHeight))
  );
  const blocks = clusterLinesIntoBlocks(usable, opts);
  const posts = blocks.map((b, idx) => blockToPostDraft(b, idx + 1, null));
  return { groups: [], posts };
}

/**
 * 통합검색탭: 실제로 감지된 헤더 텍스트만으로 모듈/일반출처 그룹을 만든다 (7절).
 * 헤더가 전혀 감지되지 않으면 전체를 하나의 "일반 검색결과" 그룹으로 취급한다.
 */
export function segmentIntegratedResults(layout: LayoutResult, opts: ClusterOptions = {}): SegmentationResult {
  const usable = layout.lines
    .filter((l) => !isLikelyChromeLine(l.text, l.bbox.y0 / Math.max(1, layout.imageHeight)))
    .sort((a, b) => a.bbox.y0 - b.bbox.y0);

  type Section = { def: ReturnType<typeof matchModuleKeyword>; headerText: string; lines: OcrLine[] };
  const sections: Section[] = [];
  let current: Section = { def: null, headerText: "일반 검색결과", lines: [] };

  for (const line of usable) {
    const def = matchModuleKeyword(line.text);
    if (def) {
      if (current.lines.length > 0 || current.def) sections.push(current);
      current = { def, headerText: line.text.trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);

  const groups: DetectedGroupDraft[] = [];
  const posts: PostDraft[] = [];
  let order = 0;

  sections.forEach((section, sIdx) => {
    if (section.lines.length === 0) return;
    const localId = `g${sIdx}`;
    const def = section.def;
    groups.push({
      localId,
      kind: def?.kind ?? "GENERAL_SOURCE",
      name: section.headerText,
      isPostBearing: def?.isPostBearing ?? true,
      includedByDefault: def?.includedByDefault ?? true,
      detectedPostCount: 0, // 아래에서 갱신
    });

    const blocks = clusterLinesIntoBlocks(section.lines, opts);
    for (const block of blocks) {
      order += 1;
      posts.push(blockToPostDraft(block, order, localId));
    }
    groups[groups.length - 1].detectedPostCount = blocks.length;
  });

  return { groups, posts };
}
