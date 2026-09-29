import { describe, it, expect } from "vitest";
import { stripDateAndDots, isLikelyChromeLine } from "./textCleanup";

// 2026-09-29 실제 네이버 캡처 OCR 정확도 검증 중 발견한 버그의 회귀 테스트.
//
// segmentation.test.ts의 합성 테스트는 구분자로 일반 가운데점 "·"(U+00B7)만 사용했지만,
// 실제 네이버 UI가 쓰는 구분점은 한글 자모 "ㆍ"(U+318D, HANGUL LETTER ARAEA)로 다른
// 코드포인트다. 기존 MIDDLE_DOT_RE에 U+318D가 빠져 있어 stripDateAndDots가 실제 캡처에서는
// 전혀 동작하지 않았고, 그 결과 실제 4개 캡처의 게시물 62건 중 20건의 채널명에 날짜/상대
// 시간이 그대로 남아 있었다 (8절 위반) — 합성 테스트만으로는 절대 잡을 수 없었던 버그.
describe("stripDateAndDots — 실제 캡처(U+318D 'ㆍ') 회귀", () => {
  it("일반 가운데점(U+00B7)은 계속 지원한다 (기존 합성 테스트 케이스)", () => {
    expect(stripDateAndDots("씨아르 1991 · 3주 전")).toBe("씨아르 1991");
  });

  it("네이버가 실제로 쓰는 한글 자모 구분점 'ㆍ'(U+318D)도 지원한다", () => {
    expect(stripDateAndDots("뭐니해도라니ㆍ2026.08.28.")).toBe("뭐니해도라니");
  });

  it("전각 가운뎃점 '・'(U+30FB)도 지원한다", () => {
    expect(stripDateAndDots("채널명・4주 전")).toBe("채널명");
  });

  it("날짜 뒤에 OCR이 덧붙이는 잡음 기호(콜론)를 무시하고 날짜 구를 인식한다", () => {
    expect(stripDateAndDots("뭐니해도라니 ㆍ 2026.08.28. :")).toBe("뭐니해도라니");
  });

  it("날짜 뒤에 세미콜론 잡음이 붙어도 상대시간 구를 인식한다", () => {
    expect(stripDateAndDots("오늘보다 더 맛있는 내일 ㆍ 3주 전 ;")).toBe("오늘보다 더 맛있는 내일");
  });

  it("전각 콜론+마침표 등 여러 잡음 기호가 겹쳐도 날짜 구를 인식한다", () => {
    expect(stripDateAndDots("인천365mc ㆍ 2026.07.26. 。 ：:")).toBe("인천365mc");
  });

  it("실제 캡처처럼 단어 사이가 벌어진 경우에도(음절 단위 공백) 상대시간 구를 인식한다", () => {
    expect(stripDateAndDots("23 년 간 지 방 하나만, 365mc 병 원 ㆍ 4 주 전 :")).toBe("23 년 간 지 방 하나만, 365mc 병 원");
  });
});

describe("isLikelyChromeLine — 기존 회귀 확인", () => {
  it("정렬 옵션 줄은 게시물이 아니다", () => {
    expect(isLikelyChromeLine("옵션", 0.02)).toBe(true);
  });
});
