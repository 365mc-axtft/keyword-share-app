/**
 * 8절: 날짜/상대시간 표기는 채널명·제목에서 제외하고 별도 분석 필드로 출력하지 않는다.
 * 예: 2026.07.01., 3주 전, 2일 전, 방금 전, 5시간 전, 가운데 점(·) 구분자.
 */
const DATE_TOKEN_PATTERNS: RegExp[] = [
  /^\d{4}\.\d{1,2}\.\d{1,2}\.?$/, // 2026.07.01.
  /^\d{1,2}\.\d{1,2}\.?$/, // 07.01.
  /^\d+\s?년\s?전$/,
  /^\d+\s?개월\s?전$/,
  /^\d+\s?주\s?전$/,
  /^\d+\s?일\s?전$/,
  /^\d+\s?시간\s?전$/,
  /^\d+\s?분\s?전$/,
  /^방금\s?전$/,
  /^어제$/,
];

// 실제 네이버 캡처 검증(2026-09-29) 중 발견: 네이버 UI가 실제로 쓰는 구분점은
// 한글 자모 "ㆍ"(U+318D, HANGUL LETTER ARAEA)이며, 이는 기존 목록의 가운데점(U+00B7 등)과
// 다른 코드포인트라 여기 없으면 전혀 매치되지 않는다. 합성 테스트(segmentation.test.ts)는
// "·"(U+00B7)만 사용해서 이 버그를 잡지 못했다 — 그 결과 실제 캡처에서는 모든 게시물의
// 채널명 뒤에 날짜/상대시간이 그대로 붙어 나왔다(8절 위반). "・"(U+30FB, 전각 가운뎃점)도
// 시각적으로 동일해 자주 혼동되므로 함께 방어적으로 추가한다.
const MIDDLE_DOT_RE = /[·•∙⋅ㆍ・]/g;

export function isDateToken(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  return DATE_TOKEN_PATTERNS.some((re) => re.test(t));
}

// 공백이 포함된 구( "3주 전", "2 일 전" )도 통째로 인식하기 위한 패턴 (내부 공백 허용).
const DATE_PHRASE_PATTERNS: RegExp[] = [
  /^\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.?$/,
  /^\d{1,2}\.\s?\d{1,2}\.?$/,
  /^\d+\s?년\s?전$/,
  /^\d+\s?개월\s?전$/,
  /^\d+\s?주\s?전$/,
  /^\d+\s?일\s?전$/,
  /^\d+\s?시간\s?전$/,
  /^\d+\s?분\s?전$/,
  /^방금\s?전$/,
  /^어제$/,
];

// 실제 네이버 캡처 검증(2026-09-29) 중 발견: 날짜/상대시간 구 뒤에 의미 없는 기호
// (":", ";", "：", "。", "、")가 OCR 잡음으로 거의 매번 붙어 나온다 — 이어지는
// "더보기"/공유 아이콘 등이 문자로 오인식된 결과로 보인다. 날짜 구 자체의 마침표는
// 그대로 두고, 후행 잡음만 제거한 뒤 판별한다.
const TRAILING_OCR_NOISE_RE = /[\s:：;。、]+$/;

function isDatePhrase(phrase: string): boolean {
  const t = phrase.trim().replace(TRAILING_OCR_NOISE_RE, "");
  if (!t) return false;
  return DATE_PHRASE_PATTERNS.some((re) => re.test(t));
}

/**
 * 채널명 행에서 가운데 점(·) 뒤의 날짜/상대시간 구를 제거하되, "씨아르 1991"처럼
 * 채널명 속 숫자는 보존한다. 형식은 보통 "채널명 · 날짜"이지만, 점 없이 공백만으로
 * 이어지는 경우("채널명 2일 전")에도 끝부분의 날짜 구를 인식해 제거한다.
 */
export function stripDateAndDots(line: string): string {
  const hasDot = MIDDLE_DOT_RE.test(line);
  MIDDLE_DOT_RE.lastIndex = 0;

  let chunks: string[];
  if (hasDot) {
    chunks = line.split(MIDDLE_DOT_RE).map((c) => c.trim());
  } else {
    chunks = [line.trim()];
  }
  let kept = chunks.filter((c) => c && !isDatePhrase(c));

  // 점 구분자가 없는 경우, 끝에서부터 1~2개 토큰이 날짜 구인지 확인해 제거한다.
  if (!hasDot && kept.length === 1) {
    let tokens = kept[0].split(/\s+/).filter(Boolean);
    for (const take of [2, 1]) {
      if (tokens.length > take) {
        const suffix = tokens.slice(-take).join(" ");
        if (isDatePhrase(suffix)) {
          tokens = tokens.slice(0, -take);
          break;
        }
      }
    }
    kept = [tokens.join(" ")];
  }

  return kept.join(" ").replace(/\s+/g, " ").trim();
}

/** 상단 검색창/카테고리 메뉴/정렬 옵션 — 게시물이 아니다 (8절). */
const CHROME_EXACT = new Set([
  "블로그",
  "AI",
  "카페",
  "클립",
  "이미지",
  "지식iN",
  "지식in",
  "동영상",
  "옵션",
  "관련도순",
  "최신순",
  "뉴스",
  "쇼핑",
  "인플루언서",
  "VIEW",
  "view",
  "전체",
  "더보기",
]);

export function isLikelyChromeLine(text: string, yRatio: number): boolean {
  const t = text.trim();
  if (!t) return true;
  if (yRatio < 0.1) {
    if (CHROME_EXACT.has(t)) return true;
    // 메뉴바처럼 짧은 단어 여러 개가 공백으로만 구성된 라인 (예: "블로그 카페 이미지")
    const tokens = t.split(/\s+/);
    if (tokens.length >= 2 && tokens.every((tok) => CHROME_EXACT.has(tok))) return true;
  }
  return false;
}
