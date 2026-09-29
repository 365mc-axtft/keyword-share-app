import { describe, it, expect } from "vitest";
import { guessChannelType } from "./channelTypeGuess";

// 11절 "출처 채널 종류 판정" — 어디까지나 초기 제안값이며 사람이 검수 화면에서 바꿀 수 있어야 한다.

describe("guessChannelType", () => {
  it("네이버/다음 카페 URL은 카페로 판정한다", () => {
    expect(guessChannelType({ exposedChannelName: "아무개 카페", channelIdOrUrl: "https://cafe.naver.com/xyz" })).toBe("CAFE");
  });

  it("지식iN URL은 KIN으로 판정한다", () => {
    expect(guessChannelType({ exposedChannelName: "질문자", channelIdOrUrl: "https://kin.naver.com/qna/1" })).toBe("KIN");
  });

  it("티스토리 URL은 TISTORY로 판정한다", () => {
    expect(guessChannelType({ exposedChannelName: "블로거", channelIdOrUrl: "https://foo.tistory.com" })).toBe("TISTORY");
  });

  it("채널명에 브랜드 키워드가 있고 URL이 없으면 자사 블로그로 제안한다 (도메인 근거 없이 자사 홈페이지로 단정하지 않음)", () => {
    expect(guessChannelType({ exposedChannelName: "365mc 강남점 블로그" })).toBe("OWN_BLOG");
  });

  it("도메인 자체에 브랜드가 포함된 경우에만 자사 홈페이지로 판정한다", () => {
    expect(guessChannelType({ exposedChannelName: "365mc", channelIdOrUrl: "https://365mc.co.kr/event" })).toBe("OWN_HOMEPAGE");
  });

  it("네이버 블로그 URL인데 브랜드명이 없으면 일반 블로그(BLOG)로 제안한다", () => {
    expect(guessChannelType({ exposedChannelName: "일반 블로거", channelIdOrUrl: "https://blog.naver.com/someone" })).toBe("BLOG");
  });

  it("이름도 URL도 없으면 미분류를 반환한다", () => {
    expect(guessChannelType({ exposedChannelName: "" })).toBe("UNCLASSIFIED");
  });

  it("알 수 없는 외부 사이트 URL은 기타(OTHER)로 제안한다", () => {
    expect(guessChannelType({ exposedChannelName: "어떤 사이트", channelIdOrUrl: "https://example.com/post/1" })).toBe("OTHER");
  });
});
