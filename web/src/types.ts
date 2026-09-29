export type GlobalRole = "ADMIN" | "MEMBER";
export type TeamRole = "TEAM_ADMIN" | "MEMBER";

export interface AuthUser {
  id: string;
  companyId: string;
  email: string;
  name: string;
  globalRole: GlobalRole;
}

export interface Membership {
  teamId: string;
  teamName: string;
  role: TeamRole;
}

export interface Team {
  id: string;
  companyId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  defaultKeywordGroupId: string | null;
  defaultSearchEnv: "MOBILE" | "PC" | null;
  defaultSearchTab: "BLOG" | "INTEGRATED" | "BOTH" | null;
  myRole?: TeamRole;
}

export interface KeywordGroup {
  id: string;
  teamId: string;
  name: string;
  createdAt: string;
}

export interface Keyword {
  id: string;
  teamId: string;
  keywordGroupId: string | null;
  text: string;
  createdAt: string;
}

export type Platform = "NAVER_BLOG" | "NAVER_CAFE" | "DAUM_CAFE" | "TISTORY" | "KIN" | "OWN_HOMEPAGE" | "APP" | "OTHER";
export type ChannelSegment = "OWN_365MC" | "SUPPORTER_CUSTOMER" | "COMPETITOR" | "GENERAL_INFO" | "UNCLASSIFIED";

export interface Channel {
  id: string;
  companyId: string;
  platform: Platform;
  exposedName: string;
  internalNickname: string | null;
  channelIdOrUrl: string | null;
  normalizedKey: string;
  segment: ChannelSegment;
  brandId: string | null;
  branchId: string | null;
  branchName?: string | null;
  competitorId: string | null;
  competitorName?: string | null;
  note: string | null;
  active: boolean;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
}

export type SearchEnvironment = "MOBILE" | "PC";
export type SearchTab = "BLOG" | "INTEGRATED" | "BOTH";
export type TabType = "BLOG" | "INTEGRATED";

export interface Investigation {
  id: string;
  teamId: string;
  keywordId: string | null;
  keywordText: string;
  keywordGroupId: string | null;
  investigationDate: string;
  searchEnvironment: SearchEnvironment;
  tabsRequested: SearchTab;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  savedAt: string | null;
}

export type TabAnalysisStatus =
  | "DRAFT"
  | "UPLOADING"
  | "OCR_PROCESSING"
  | "NEEDS_REVIEW"
  | "CLASSIFYING"
  | "SAVED"
  | "FAILED";

export interface TabAnalysis {
  id: string;
  investigationId: string;
  tabType: TabType;
  status: TabAnalysisStatus;
  moduleFilterJson: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  savedAt: string | null;
  complete: boolean;
  classificationConfirmedAt: string | null;
}

export interface UploadedImage {
  id: string;
  tabAnalysisId: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  widthPx: number;
  heightPx: number;
  sequenceIndex: number;
  overlapPxWithPrev: number | null;
  ocrStatus: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  ocrError: string | null;
  createdAt: string;
}

export type GroupKind = "MODULE" | "GENERAL_SOURCE";

export interface DetectedModule {
  id: string;
  tabAnalysisId: string;
  uploadedImageId: string | null;
  kind: GroupKind;
  name: string;
  isPostBearing: boolean;
  includedByDefault: boolean;
  detectedPostCount: number;
  createdAt: string;
}

export type ChannelTypeGuess =
  | "OWN_HOMEPAGE"
  | "OWN_BLOG"
  | "CAFE"
  | "KIN"
  | "TISTORY"
  | "APP"
  | "BLOG"
  | "OTHER"
  | "UNCLASSIFIED";

export type ContentType = "BRANDED" | "REVIEW" | "INFORMATIONAL" | "COMPETITOR";
export type MatchMethod = "URL_ID" | "PLATFORM_NAME" | "ALIAS" | "FUZZY" | "MANUAL" | "NONE";
export type BranchStatus = "CONFIRMED" | "PENDING" | "NOT_APPLICABLE";

export interface Post {
  id: string;
  tabAnalysisId: string;
  uploadedImageId: string | null;
  groupId: string | null;
  originalOrder: number;
  analysisRank: number | null;
  includedInTop10: boolean;
  isDeletedMisrecognition: boolean;
  isManuallyAdded: boolean;
  channelTypeGuess: ChannelTypeGuess;
  exposedChannelName: string;
  titleText: string;
  ocrRawChannelName: string | null;
  ocrRawTitle: string | null;
  ocrConfidenceChannel: number | null;
  ocrConfidenceTitle: number | null;
  matchedChannelId: string | null;
  matchMethod: MatchMethod;
  matchConfidence: number | null;
  contentType: ContentType | null;
  related365mc: boolean | null;
  branchId: string | null;
  branchStatus: BranchStatus;
  sourceBoundsJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShareResult {
  numerator: number;
  denominator: number;
  percentage: number | null;
}

export interface AggregateResult {
  totalSlots: number;
  relatedSlots: number;
  overallShare: ShareResult;
  branchShares: Array<{ branchId: string; branchName: string; relatedSlots: number; share: ShareResult }>;
  pendingBranchSlots: number;
  contentTypeCounts: Record<string, number>;
  competitorSlots: number;
  investigationCount: number;
  tabAnalysisCount: number;
}
