import { describe, it, expect } from "vitest";
import { segmentBlogPosts, segmentIntegratedResults, clusterLinesIntoBlocks } from "./segmentation";
import { OcrLine, LayoutResult } from "./types";

function line(text: string, y0: number, height = 20, x0 = 10, width = 200): OcrLine {
  return { text, confidence: 90, bbox: { x0, y0, x1: x0 + width, y1: y0 + height } };
}

// 18절 검증 항목 1~6에 대응하는 합성(가짜) 레이아웃 테스트.
// 실제 네이버 캡처 기반 정확도는 사용자가 제공하는 실제 이미지로 별도 검증해야 한다 (18절 마지막 문단).

describe("segmentBlogPosts", () => {
  it("한 게시물을 채널명+제목(2줄)+본문으로 올바르게 블록화한다", () => {
    const layout: LayoutResult = {
      imageWidth: 400,
      imageHeight: 600,
      lines: [
        line("씨아르 1991 · 3주 전", 100),
        line("여름철 하체 부기 빼는 법 총정리", 128),
        // 제목과의 간격(32)은 제목 결합 기준(28)보다 크지만 새 게시물 기준(38)보다는 작아
        // "같은 블록의 본문"으로 남는다 — 다음 헤더가 더 큰 간격 뒤에 와야 새 게시물로 분리된다.
        line("오늘 알려드릴 내용은...", 180),
        line("#다이어트 #하체부종", 208),
      ],
    };
    const result = segmentBlogPosts(layout);
    expect(result.posts).toHaveLength(1);
    const p = result.posts[0];
    expect(p.exposedChannelName).toBe("씨아르 1991"); // 날짜 제거, 숫자는 보존 (8절)
    expect(p.titleText).toBe("여름철 하체 부기 빼는 법 총정리");
  });

  it("두 게시물을 하나로 합치지 않는다 (큰 간격 기준 분리)", () => {
    const layout: LayoutResult = {
      imageWidth: 400,
      imageHeight: 900,
      lines: [
        line("채널A", 100),
        line("첫 번째 게시물 제목", 128),
        line("본문 내용입니다", 180),
        // 큰 간격 (다음 헤더까지, 새 블록 기준 초과)
        line("채널A", 260), // 같은 채널명이라도 다른 게시물은 각각 유지 (8절)
        line("두 번째 게시물 제목", 288),
      ],
    };
    const result = segmentBlogPosts(layout);
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0].titleText).toBe("첫 번째 게시물 제목");
    expect(result.posts[1].titleText).toBe("두 번째 게시물 제목");
    expect(result.posts[0].exposedChannelName).toBe(result.posts[1].exposedChannelName);
  });

  it("제목이 두 줄이면 하나의 제목으로 결합한다", () => {
    const layout: LayoutResult = {
      imageWidth: 400,
      imageHeight: 400,
      lines: [line("채널B", 100), line("첫 줄 제목", 128), line("이어지는 둘째 줄", 150)],
    };
    const result = segmentBlogPosts(layout);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].titleText).toBe("첫 줄 제목 이어지는 둘째 줄");
  });

  it("상단 메뉴/옵션 줄은 게시물로 만들지 않는다", () => {
    const layout: LayoutResult = {
      imageWidth: 400,
      imageHeight: 800,
      lines: [
        line("블로그", 5),
        line("옵션", 5, 20, 250),
        line("채널C", 100),
        line("실제 게시물 제목", 128),
      ],
    };
    const result = segmentBlogPosts(layout);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].exposedChannelName).toBe("채널C");
  });

  it("작은 프로필 아이콘/점으로 인한 조각이 다음 헤더를 놓쳐 두 게시물을 합치지 않는다", () => {
    const layout: LayoutResult = {
      imageWidth: 400,
      imageHeight: 900,
      lines: [
        line("채널D", 100),
        line("게시물1 제목", 128),
        // 헤더 사이 간격이 충분히 크면(>1.9배) 새 블록으로 분리됨
        line("채널E", 260),
        line("게시물2 제목", 288),
      ],
    };
    const result = segmentBlogPosts(layout);
    expect(result.posts).toHaveLength(2);
  });

  it("줄 간격이 균일해 애매할 때는 색상 기반 스타일 분류기(classifyStyle)로 제목/본문을 구분할 수 있다", () => {
    // 실제 캡처는 제목이 진하고 본문이 옅은 회색인 경우가 많다 — 그 신호를 흉내낸 분류기.
    const lines = [
      line("채널F", 100),
      line("제목 둘째 줄까지 이어짐", 128), // 간격만으로는 본문과 구분 불가(균일 간격)
      line("본문 첫 줄", 156),
      line("본문 둘째 줄", 184),
    ];
    const classifyStyle = (l: any) => (l.text.includes("본문") ? "body" : "title");
    const blocks = clusterLinesIntoBlocks(lines, { classifyStyle });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].titleLines.map((l) => l.text)).toEqual(["제목 둘째 줄까지 이어짐"]);
    expect(blocks[0].bodyLines).toHaveLength(2);
  });

  it("18절 4항: 색상 신호 없이 간격만으로 제목 둘째 줄을 인정한 경우 검수 필요로 표시한다 (본문이 섞였을 위험)", () => {
    // classifyStyle을 넘기지 않으면(실제 이미지의 본문 명암이 애매한 경우를 흉내) 순수 간격 휴리스틱만
    // 사용되는데, 이때 조용히 두 번째 제목 줄로 합치는 대신 needsReview로 표시해 사람이 확인하게 한다.
    const layout: LayoutResult = {
      imageWidth: 400,
      imageHeight: 400,
      lines: [line("채널G", 100), line("첫 줄 제목", 128), line("본문일 수도 있는 둘째 줄", 150)],
    };
    const result = segmentBlogPosts(layout);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].needsReview).toBe(true);
    expect(result.posts[0].needsReviewReason).toMatch(/본문/);
  });

  it("색상 분류기가 명확히 'title'이라고 판단하면 둘째 줄을 합쳐도 검수 필요로 표시하지 않는다", () => {
    const layout: LayoutResult = {
      imageWidth: 400,
      imageHeight: 400,
      lines: [line("채널H", 100), line("첫 줄 제목", 128), line("확실히 진한 제목 둘째 줄", 150)],
    };
    const result = segmentBlogPosts(layout, { classifyStyle: () => "title" });
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].titleText).toBe("첫 줄 제목 확실히 진한 제목 둘째 줄");
    expect(result.posts[0].needsReview).toBe(false);
  });
});

describe("segmentIntegratedResults", () => {
  it("실제 감지된 헤더만 모듈로 만들고, 없는 모듈은 만들어내지 않는다", () => {
    const layout: LayoutResult = {
      imageWidth: 400,
      imageHeight: 900,
      lines: [
        line("AI 브리핑", 20),
        line("요약된 답변 내용", 48),
        line("카페", 200),
        line("카페채널", 228),
        line("카페 게시물 제목", 256),
      ],
    };
    const result = segmentIntegratedResults(layout);
    const names = result.groups.map((g) => g.name);
    expect(names).not.toContain("쇼핑"); // 화면에 없던 모듈을 임의로 만들지 않음
    expect(names.some((n) => n.includes("AI"))).toBe(true);
    expect(names).toContain("카페");
  });

  it("비게시물 모듈(AI브리핑)은 게시물 후보로 취급하지 않는다", () => {
    const layout: LayoutResult = {
      imageWidth: 400,
      imageHeight: 300,
      lines: [line("AI 브리핑", 20), line("요약된 답변 내용", 48)],
    };
    const result = segmentIntegratedResults(layout);
    const aiGroup = result.groups.find((g) => g.name.includes("AI"));
    expect(aiGroup?.isPostBearing).toBe(false);
    expect(aiGroup?.includedByDefault).toBe(false);
  });
});
