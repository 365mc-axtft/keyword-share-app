import { describe, it, expect } from "vitest";
import { computeTop10, RankablePost } from "./topN";

// 18절 검증 항목 7 "모듈/채널 필터 후 TOP10 순위 재계산, 원본 순서 보존"에 대응.

function post(overrides: Partial<RankablePost> & { id: string; originalOrder: number }): RankablePost {
  return {
    isDeletedMisrecognition: false,
    groupIncluded: true,
    groupIsPostBearing: true,
    ...overrides,
  };
}

describe("computeTop10", () => {
  it("원본 순서대로 처음 10개만 포함하고 나머지는 순위 없음으로 남긴다", () => {
    const posts = Array.from({ length: 15 }, (_, i) => post({ id: `p${i}`, originalOrder: i }));
    const ranked = computeTop10(posts);
    const included = ranked.filter((r) => r.includedInTop10);
    expect(included).toHaveLength(10);
    expect(included.map((r) => r.id)).toEqual(["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"]);
    expect(ranked.find((r) => r.id === "p9")!.analysisRank).toBe(10);
    expect(ranked.find((r) => r.id === "p10")!.analysisRank).toBeNull();
  });

  it("오인식 삭제된 게시물은 순위 계산에서 완전히 제외된다 (자리를 비우지 않고 다음 게시물이 당겨온다)", () => {
    const posts = [
      post({ id: "p0", originalOrder: 0 }),
      post({ id: "p1", originalOrder: 1, isDeletedMisrecognition: true }),
      post({ id: "p2", originalOrder: 2 }),
    ];
    const ranked = computeTop10(posts);
    expect(ranked.find((r) => r.id === "p0")!.analysisRank).toBe(1);
    expect(ranked.find((r) => r.id === "p1")!.analysisRank).toBeNull();
    expect(ranked.find((r) => r.id === "p1")!.includedInTop10).toBe(false);
    expect(ranked.find((r) => r.id === "p2")!.analysisRank).toBe(2);
  });

  it("필터로 제외된 모듈/채널 종류(groupIncluded=false)는 순위에서 빠지고 다음 게시물이 당겨온다", () => {
    const posts = [
      post({ id: "p0", originalOrder: 0, groupIncluded: false }),
      post({ id: "p1", originalOrder: 1 }),
    ];
    const ranked = computeTop10(posts);
    expect(ranked.find((r) => r.id === "p0")!.includedInTop10).toBe(false);
    expect(ranked.find((r) => r.id === "p1")!.analysisRank).toBe(1);
  });

  it("비게시물 모듈(AI 요약 등, groupIsPostBearing=false)은 애초에 후보가 아니다", () => {
    const posts = [
      post({ id: "p0", originalOrder: 0, groupIsPostBearing: false }),
      post({ id: "p1", originalOrder: 1 }),
    ];
    const ranked = computeTop10(posts);
    expect(ranked.find((r) => r.id === "p0")!.includedInTop10).toBe(false);
    expect(ranked.find((r) => r.id === "p1")!.analysisRank).toBe(1);
  });

  it("필터를 적용해도 originalOrder(필터 전 상대 순서) 값 자체는 바뀌지 않는다", () => {
    const posts = [post({ id: "p0", originalOrder: 5 }), post({ id: "p1", originalOrder: 9 })];
    const ranked = computeTop10(posts);
    expect(ranked.find((r) => r.id === "p0")!.originalOrder).toBe(5);
    expect(ranked.find((r) => r.id === "p1")!.originalOrder).toBe(9);
  });

  it("10개 미만이면 있는 만큼만 순위를 매기고 나머지 자리는 채우지 않는다 (미완료 상태)", () => {
    const posts = Array.from({ length: 3 }, (_, i) => post({ id: `p${i}`, originalOrder: i }));
    const ranked = computeTop10(posts);
    expect(ranked.filter((r) => r.includedInTop10)).toHaveLength(3);
  });
});
