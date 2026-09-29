/**
 * 7절: 통합검색 모듈 구분. 고정된 목록을 감지 결과인 것처럼 보여주지 말라는 지시에 따라
 * 이 목록은 "실제 화면에 이 텍스트가 보일 때 어떤 종류로 잠정 분류할지"를 위한 후보 사전일 뿐,
 * 화면에 없는 모듈을 임의로 만들어내지 않는다 — 감지된 헤더 텍스트만 그룹으로 만든다.
 */
export interface ModuleKeywordDef {
  match: RegExp;
  kind: "MODULE" | "GENERAL_SOURCE";
  isPostBearing: boolean;
  includedByDefault: boolean;
}

export const MODULE_KEYWORD_DEFS: ModuleKeywordDef[] = [
  // 비게시물/추천/광고성 영역 — 기본 제외 제안
  { match: /^AI\s?브리핑$/, kind: "MODULE", isPostBearing: false, includedByDefault: false },
  { match: /^이미지$/, kind: "MODULE", isPostBearing: false, includedByDefault: false },
  { match: /^함께\s?많이\s?찾는/, kind: "MODULE", isPostBearing: false, includedByDefault: false },
  { match: /^함께\s?보면\s?좋은/, kind: "MODULE", isPostBearing: false, includedByDefault: false },
  { match: /광고$/, kind: "MODULE", isPostBearing: false, includedByDefault: false },
  { match: /^파워링크/, kind: "MODULE", isPostBearing: false, includedByDefault: false },
  { match: /^연관\s?검색어/, kind: "MODULE", isPostBearing: false, includedByDefault: false },

  // 쇼핑/뉴스/동영상 — 실제 화면 그룹 구조에 따라 사람이 포함/제외 선택 (기본은 제외 제안)
  { match: /^쇼핑$/, kind: "MODULE", isPostBearing: true, includedByDefault: false },
  { match: /^뉴스$/, kind: "MODULE", isPostBearing: true, includedByDefault: false },
  { match: /^동영상$/, kind: "MODULE", isPostBearing: true, includedByDefault: false },

  // 일반 게시글 출처 그룹 — 기본 포함
  { match: /^지식[iI][nN]$/, kind: "GENERAL_SOURCE", isPostBearing: true, includedByDefault: true },
  { match: /^카페$/, kind: "GENERAL_SOURCE", isPostBearing: true, includedByDefault: true },
  { match: /^블로그$/, kind: "GENERAL_SOURCE", isPostBearing: true, includedByDefault: true },
  { match: /^인플루언서$/, kind: "GENERAL_SOURCE", isPostBearing: true, includedByDefault: true },
];

export function matchModuleKeyword(headerText: string): ModuleKeywordDef | null {
  const t = headerText.trim();
  for (const def of MODULE_KEYWORD_DEFS) {
    if (def.match.test(t)) return def;
  }
  return null;
}
