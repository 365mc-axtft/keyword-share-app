/**
 * 12절: 채널 리스트/게시물 정보로 "초기값"을 제안하고 사람이 수정 가능해야 한다.
 * 자사 출처 여부(channelTypeGuess)와 365mc 관련 여부(related365mc)는 서로 다른 개념이므로
 * 절대 동일시하지 않는다 — 예: 고객 후기(SUPPORTER_CUSTOMER)는 자사 출처가 아니어도 관련은 true일 수 있다.
 */
export interface ClassificationSuggestion {
  contentType: "BRANDED" | "REVIEW" | "INFORMATIONAL" | "COMPETITOR" | null;
  related365mc: boolean | null;
  branchId: string | null;
  branchStatus: "CONFIRMED" | "PENDING" | "NOT_APPLICABLE";
}

export function suggestClassification(params: {
  channelSegment: "OWN_365MC" | "SUPPORTER_CUSTOMER" | "COMPETITOR" | "GENERAL_INFO" | "UNCLASSIFIED" | null;
  channelBranchId: string | null;
}): ClassificationSuggestion {
  const { channelSegment, channelBranchId } = params;

  switch (channelSegment) {
    case "OWN_365MC":
      return {
        contentType: "BRANDED",
        related365mc: true,
        branchId: channelBranchId,
        branchStatus: channelBranchId ? "CONFIRMED" : "PENDING",
      };
    case "SUPPORTER_CUSTOMER":
      return {
        contentType: "REVIEW",
        related365mc: true,
        branchId: channelBranchId,
        branchStatus: channelBranchId ? "CONFIRMED" : "PENDING",
      };
    case "COMPETITOR":
      return { contentType: "COMPETITOR", related365mc: false, branchId: null, branchStatus: "NOT_APPLICABLE" };
    case "GENERAL_INFO":
      return { contentType: "INFORMATIONAL", related365mc: false, branchId: null, branchStatus: "NOT_APPLICABLE" };
    default:
      return { contentType: null, related365mc: null, branchId: null, branchStatus: "NOT_APPLICABLE" };
  }
}
