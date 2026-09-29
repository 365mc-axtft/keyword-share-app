export interface RankablePost {
  id: string;
  originalOrder: number;
  isDeletedMisrecognition: boolean;
  groupIncluded: boolean; // 소속 모듈/일반출처 그룹이 현재 필터에서 포함되어 있는가
  groupIsPostBearing: boolean; // 비게시물 모듈(AI요약/이미지묶음 등)은 후보 자체가 아님
}

export interface RankedResult {
  id: string;
  originalOrder: number;
  analysisRank: number | null;
  includedInTop10: boolean;
}

/**
 * 14절 TOP10 규칙: 포함 모듈·일반 채널 종류 필터 적용 → 원본 위에서 아래로 정렬 → 처음 10개.
 * originalOrder(필터 전 상대 순서)와 analysisRank(필터 후 1~10)를 분리해서 반환한다.
 */
export function computeTop10(posts: RankablePost[], topN = 10): RankedResult[] {
  const eligible = posts
    .filter((p) => !p.isDeletedMisrecognition && p.groupIncluded && p.groupIsPostBearing)
    .sort((a, b) => a.originalOrder - b.originalOrder);

  const rankById = new Map<string, number>();
  eligible.slice(0, topN).forEach((p, idx) => rankById.set(p.id, idx + 1));

  return posts.map((p) => {
    const rank = rankById.get(p.id) ?? null;
    return {
      id: p.id,
      originalOrder: p.originalOrder,
      analysisRank: rank,
      includedInTop10: rank !== null,
    };
  });
}
