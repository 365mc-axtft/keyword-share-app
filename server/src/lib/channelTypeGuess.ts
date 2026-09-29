/**
 * 11절 "출처 채널 종류 판정" 규칙을 코드화한 최초 제안값 생성기.
 * 어디까지나 사람이 검수 화면에서 바꿀 수 있는 "제안"이며, 이 값만으로 확정하지 않는다.
 */
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

const KNOWN_CAFE_NAMES = ["여우야", "지살사", "다이렉트"];

export function guessChannelType(params: {
  exposedChannelName: string;
  channelIdOrUrl?: string | null;
  ownBrandKeyword?: string; // 예: "365mc" — 실제 출처 도메인 판정용
}): ChannelTypeGuess {
  const name = (params.exposedChannelName || "").trim();
  const url = (params.channelIdOrUrl || "").trim().toLowerCase();
  const brand = (params.ownBrandKeyword || "365mc").toLowerCase();

  if (!name && !url) return "UNCLASSIFIED";

  if (url.includes("cafe.naver") || url.includes("cafe.daum")) return "CAFE";
  if (KNOWN_CAFE_NAMES.some((n) => name.includes(n))) return "CAFE";

  if (url.includes("kin.naver.com")) return "KIN";
  if (url.includes("tistory.com")) return "TISTORY";

  // 자사 홈페이지: 실제 출처 도메인 자체에 브랜드 키워드 포함 (제목/URL 경로만으로는 불인정)
  const domainOnly = url.replace(/^https?:\/\//, "").split("/")[0];
  if (domainOnly && domainOnly.includes(brand) && !domainOnly.includes("blog.naver.com")) {
    return "OWN_HOMEPAGE";
  }

  // 자사 블로그: 도메인 없는 채널명에 브랜드 포함, 또는 네이버 블로그 URL + 채널명 조합
  if (name.toLowerCase().includes(brand)) {
    return "OWN_BLOG";
  }

  if (domainOnly.includes("blog.naver.com")) return "BLOG";
  if (url) return "OTHER"; // 알 수 없는 외부 웹사이트
  return "BLOG"; // URL 정보가 없고 이름만 있는 일반 블로거 게시물로 잠정 처리
}
