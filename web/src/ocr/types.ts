export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrLine {
  text: string;
  confidence: number; // 0~100
  bbox: BBox;
}

export interface LayoutResult {
  lines: OcrLine[];
  imageWidth: number;
  imageHeight: number;
}

export type ChannelTypeGuessClient =
  | "OWN_HOMEPAGE"
  | "OWN_BLOG"
  | "CAFE"
  | "KIN"
  | "TISTORY"
  | "APP"
  | "BLOG"
  | "OTHER"
  | "UNCLASSIFIED";

export interface DetectedGroupDraft {
  localId: string;
  kind: "MODULE" | "GENERAL_SOURCE";
  name: string;
  isPostBearing: boolean;
  includedByDefault: boolean;
  detectedPostCount: number;
}

export interface PostDraft {
  groupLocalId: string | null;
  originalOrder: number;
  exposedChannelName: string;
  titleText: string;
  channelIdOrUrlGuess: string | null;
  ocrRawChannelName: string;
  ocrRawTitle: string;
  ocrConfidenceChannel: number;
  ocrConfidenceTitle: number;
  sourceBounds: { headerBBox: BBox; titleBBox: BBox | null; blockTop: number; blockBottom: number };
  needsReview: boolean;
  needsReviewReason: string | null;
}

export interface SegmentationResult {
  groups: DetectedGroupDraft[];
  posts: PostDraft[];
}
