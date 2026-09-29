import { describe, it, expect } from "vitest";
import { suggestClassification } from "./classificationSuggestion";

// 12절: "자사 출처 여부(channelTypeGuess)와 365mc 관련 여부(related365mc)는 서로 다른 개념이므로
// 절대 동일시하지 않는다"는 핵심 규칙을 검증한다.

describe("suggestClassification", () => {
  it("자사 채널(OWN_365MC)은 브랜디드/관련=true이며, 지점이 연결돼 있으면 지점이 확정된다", () => {
    const r = suggestClassification({ channelSegment: "OWN_365MC", channelBranchId: "branch-1" });
    expect(r.contentType).toBe("BRANDED");
    expect(r.related365mc).toBe(true);
    expect(r.branchId).toBe("branch-1");
    expect(r.branchStatus).toBe("CONFIRMED");
  });

  it("자사 채널인데 지점이 아직 연결 안 됐으면 지점 확인중으로 남긴다 (지점 없다고 관련 자체를 false로 만들지 않음)", () => {
    const r = suggestClassification({ channelSegment: "OWN_365MC", channelBranchId: null });
    expect(r.related365mc).toBe(true);
    expect(r.branchStatus).toBe("PENDING");
  });

  it("고객/서포터즈 채널은 자사 출처가 아니어도 365mc 관련은 true로 제안한다 (자사 출처 ≠ 관련 여부)", () => {
    const r = suggestClassification({ channelSegment: "SUPPORTER_CUSTOMER", channelBranchId: null });
    expect(r.contentType).toBe("REVIEW");
    expect(r.related365mc).toBe(true);
    expect(r.branchStatus).toBe("PENDING");
  });

  it("경쟁업체 채널은 타업체/관련=false이며 지점 개념 자체가 해당없음이다", () => {
    const r = suggestClassification({ channelSegment: "COMPETITOR", channelBranchId: null });
    expect(r.contentType).toBe("COMPETITOR");
    expect(r.related365mc).toBe(false);
    expect(r.branchStatus).toBe("NOT_APPLICABLE");
  });

  it("일반 정보성 채널은 정보성/관련=false로 제안한다", () => {
    const r = suggestClassification({ channelSegment: "GENERAL_INFO", channelBranchId: null });
    expect(r.contentType).toBe("INFORMATIONAL");
    expect(r.related365mc).toBe(false);
  });

  it("미분류/매칭 실패 채널은 아무것도 단정하지 않고 전부 null로 사람 판단에 맡긴다", () => {
    const r = suggestClassification({ channelSegment: "UNCLASSIFIED", channelBranchId: null });
    expect(r.contentType).toBeNull();
    expect(r.related365mc).toBeNull();
    expect(r.branchStatus).toBe("NOT_APPLICABLE");
  });

  it("채널 정보가 아예 없을 때(null)도 안전하게 전부 null을 반환한다", () => {
    const r = suggestClassification({ channelSegment: null, channelBranchId: null });
    expect(r.contentType).toBeNull();
    expect(r.related365mc).toBeNull();
  });
});
