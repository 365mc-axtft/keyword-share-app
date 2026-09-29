import { describe, it, expect } from "vitest";
import { computeShare, computeMomDiff } from "./share";

// 18절 검증 항목 10 "0분모·비교 불가 전월 처리"에 대응.

describe("computeShare", () => {
  it("정상적인 분자/분모로 퍼센트를 계산한다", () => {
    expect(computeShare(3, 10)).toEqual({ numerator: 3, denominator: 10, percentage: 30 });
  });

  it("분모가 0이면 0%로 단정하지 않고 percentage=null(집계 전)을 반환한다", () => {
    const r = computeShare(0, 0);
    expect(r.percentage).toBeNull();
  });

  it("분모가 음수인 비정상 입력도 0%로 단정하지 않는다", () => {
    const r = computeShare(0, -1);
    expect(r.percentage).toBeNull();
  });

  it("소수점은 첫째 자리까지 반올림한다", () => {
    const r = computeShare(1, 3);
    expect(r.percentage).toBe(33.3);
  });
});

describe("computeMomDiff", () => {
  it("이번달/전달 모두 집계되어 있으면 %p 차이를 계산한다", () => {
    const current = computeShare(3, 10); // 30%
    const previous = computeShare(2, 10); // 20%
    const mom = computeMomDiff(current, previous);
    expect(mom.comparable).toBe(true);
    expect(mom.diffPp).toBe(10);
  });

  it("전월 데이터가 아예 없으면(null) 비교 불가로 처리하고 단정하지 않는다", () => {
    const current = computeShare(3, 10);
    const mom = computeMomDiff(current, null);
    expect(mom.comparable).toBe(false);
    expect(mom.diffPp).toBeNull();
    expect(mom.note).toBeTruthy();
  });

  it("전월이 집계 전(percentage=null)이어도 비교 불가로 처리한다", () => {
    const current = computeShare(3, 10);
    const previous = computeShare(0, 0); // percentage: null
    const mom = computeMomDiff(current, previous);
    expect(mom.comparable).toBe(false);
  });

  it("이번달이 집계 전이면(분모 0) 전월이 있어도 비교 불가로 처리한다", () => {
    const current = computeShare(0, 0);
    const previous = computeShare(2, 10);
    const mom = computeMomDiff(current, previous);
    expect(mom.comparable).toBe(false);
  });
});
