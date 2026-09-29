/**
 * 14절 점유율 계산: 조건에 맞는 TOP10 슬롯 수 ÷ 조사 범위의 전체 TOP10 슬롯 수 × 100.
 * 분모가 0이면 0%로 단정하지 않고 '집계 전/자료 없음'을 반환한다.
 */
export interface ShareResult {
  numerator: number;
  denominator: number;
  percentage: number | null; // null = 집계 전/자료 없음
}

export function computeShare(numerator: number, denominator: number): ShareResult {
  if (denominator <= 0) {
    return { numerator, denominator, percentage: null };
  }
  return { numerator, denominator, percentage: Math.round((numerator / denominator) * 1000) / 10 };
}

/** 전월 대비는 %p(퍼센트포인트) 차이. 둘 중 하나라도 집계 전이면 비교 불가. */
export interface MomResult {
  diffPp: number | null;
  comparable: boolean;
  note?: string;
}

export function computeMomDiff(current: ShareResult, previous: ShareResult | null): MomResult {
  if (!previous || previous.percentage === null || current.percentage === null) {
    return { diffPp: null, comparable: false, note: "비교할 전월 자료가 없습니다." };
  }
  return {
    diffPp: Math.round((current.percentage - previous.percentage) * 10) / 10,
    comparable: true,
  };
}
