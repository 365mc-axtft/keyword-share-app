import { describe, it, expect } from "vitest";
import { normalizeChannelKey, normalizeChannelName, similarity } from "./normalize";

describe("normalizeChannelKey", () => {
  it("프로토콜/www/후행 슬래시/쿼리스트링을 제거해 같은 채널을 같은 키로 만든다", () => {
    const a = normalizeChannelKey("https://www.blog.naver.com/foo/");
    const b = normalizeChannelKey("blog.naver.com/foo?query=1");
    expect(a).toBe(b);
  });

  it("빈 값은 빈 문자열을 반환한다", () => {
    expect(normalizeChannelKey("")).toBe("");
  });
});

describe("normalizeChannelName", () => {
  it("공백을 제거하고 소문자로 비교 가능한 형태로 만든다", () => {
    expect(normalizeChannelName("365mc 강남점 블로그")).toBe(normalizeChannelName("365MC강남점블로그"));
  });
});

describe("similarity", () => {
  it("동일한 이름은 유사도 1이다", () => {
    expect(similarity("365mc 강남점 블로그", "365mc 강남점 블로그")).toBe(1);
  });

  it("완전히 다른 이름은 유사도가 낮다", () => {
    expect(similarity("365mc 강남점 블로그", "전혀다른카페이름")).toBeLessThan(0.3);
  });

  it("한두 글자만 다른 이름은 유사도가 높다 (오타/띄어쓰기 수준)", () => {
    expect(similarity("365mc 강남점 블로그", "365mc강남점 블로그")).toBeGreaterThan(0.9);
  });

  it("빈 문자열과의 비교는 0이다 (매칭 후보 자체가 되지 않아야 함)", () => {
    expect(similarity("", "아무거나")).toBe(0);
  });
});
