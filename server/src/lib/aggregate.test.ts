import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, newId } from "../db";
import { computeAggregate, previousYearMonth } from "./aggregate";

// DB에 직접 연결하는 통합 테스트 — DATABASE_URL이 가리키는 로컬/CI Postgres가 떠 있어야 한다.
// (18절 검증 항목 9 "지점 확인중 → 확정 지점 이동 시 전체 관련 점유율 불변", 10 "분자·분모 일치, 0분모
//  처리"에 대응. 실제 화면(대시보드)이 그대로 사용하는 함수를 직접 검증한다.)

describe("computeAggregate (integration)", () => {
  const companyId = `test-company-${newId()}`;
  const teamId = `test-team-${newId()}`;
  const userId = `test-user-${newId()}`;
  const branchId = `test-branch-${newId()}`;
  let investigationId: string;
  let tabAnalysisId: string;

  beforeAll(async () => {
    await db("companies").insert({ id: companyId, name: "테스트 회사 (자동테스트)", created_at: new Date() });
    await db("users").insert({
      id: userId,
      company_id: companyId,
      email: `${userId}@test.local`,
      password_hash: "x",
      name: "테스트유저",
      global_role: "MEMBER",
      created_at: new Date(),
      updated_at: new Date(),
    });
    await db("teams").insert({ id: teamId, company_id: companyId, name: "테스트팀", created_at: new Date(), updated_at: new Date() });
    await db("branches").insert({ id: branchId, company_id: companyId, name: "테스트지점", created_at: new Date() });

    investigationId = newId();
    await db("investigations").insert({
      id: investigationId,
      team_id: teamId,
      keyword_text: "테스트 키워드",
      investigation_date: "2026-09-15",
      search_environment: "MOBILE",
      tabs_requested: "BLOG",
      created_by_id: userId,
      created_at: new Date(),
      updated_at: new Date(),
      saved_at: new Date(),
    });

    tabAnalysisId = newId();
    await db("tab_analyses").insert({
      id: tabAnalysisId,
      investigation_id: investigationId,
      tab_type: "BLOG",
      status: "SAVED",
      complete: true, // 10슬롯 충족 가정
      created_at: new Date(),
      updated_at: new Date(),
      saved_at: new Date(),
    });

    // 10개 슬롯: 3개 관련(그 중 1개는 지점 확인중), 1개 경쟁업체, 나머지 무관
    const posts = [
      { related: true, branchStatus: "CONFIRMED", contentType: "BRANDED" },
      { related: true, branchStatus: "CONFIRMED", contentType: "BRANDED" },
      { related: true, branchStatus: "PENDING", contentType: "REVIEW" },
      { related: false, branchStatus: "NOT_APPLICABLE", contentType: "COMPETITOR" },
      { related: false, branchStatus: "NOT_APPLICABLE", contentType: "INFORMATIONAL" },
      { related: false, branchStatus: "NOT_APPLICABLE", contentType: "INFORMATIONAL" },
      { related: false, branchStatus: "NOT_APPLICABLE", contentType: "INFORMATIONAL" },
      { related: false, branchStatus: "NOT_APPLICABLE", contentType: "INFORMATIONAL" },
      { related: false, branchStatus: "NOT_APPLICABLE", contentType: "INFORMATIONAL" },
      { related: false, branchStatus: "NOT_APPLICABLE", contentType: "INFORMATIONAL" },
    ];
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      await db("posts").insert({
        id: newId(),
        tab_analysis_id: tabAnalysisId,
        original_order: i,
        analysis_rank: i + 1,
        included_in_top10: true,
        is_deleted_misrecognition: false,
        is_manually_added: false,
        channel_type_guess: "BLOG",
        exposed_channel_name: `채널${i}`,
        title_text: `제목${i}`,
        match_method: "NONE",
        content_type: p.contentType,
        related_365mc: p.related,
        branch_id: p.related && p.branchStatus === "CONFIRMED" ? branchId : null,
        branch_status: p.branchStatus,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  });

  afterAll(async () => {
    await db("posts").where({ tab_analysis_id: tabAnalysisId }).delete();
    await db("tab_analyses").where({ id: tabAnalysisId }).delete();
    await db("investigations").where({ id: investigationId }).delete();
    await db("branches").where({ id: branchId }).delete();
    await db("teams").where({ id: teamId }).delete();
    await db("users").where({ id: userId }).delete();
    await db("companies").where({ id: companyId }).delete();
    await db.destroy();
  });

  it("분자(관련 슬롯)·분모(전체 슬롯)가 실제 posts 행 수와 정확히 일치한다", async () => {
    const result = await computeAggregate({ teamId, yearMonth: "2026-09" });
    expect(result.totalSlots).toBe(10);
    expect(result.relatedSlots).toBe(3);
    expect(result.overallShare.percentage).toBe(30);
  });

  it("지점 확인중(PENDING) 슬롯은 관련 슬롯에는 포함되지만 지점별 집계에는 아직 반영되지 않는다", async () => {
    const result = await computeAggregate({ teamId, yearMonth: "2026-09" });
    expect(result.pendingBranchSlots).toBe(1);
    const branch = result.branchShares.find((b) => b.branchId === branchId)!;
    expect(branch.relatedSlots).toBe(2); // CONFIRMED 2건만
  });

  it("지점이 확정(PENDING→CONFIRMED)되어도 전체 관련 점유율(분자/분모)은 그대로다 (18절 항목 9)", async () => {
    const before = await computeAggregate({ teamId, yearMonth: "2026-09" });
    // PENDING이었던 게시물의 지점을 확정시킨다.
    await db("posts")
      .where({ tab_analysis_id: tabAnalysisId, branch_status: "PENDING" })
      .update({ branch_id: branchId, branch_status: "CONFIRMED" });

    const after = await computeAggregate({ teamId, yearMonth: "2026-09" });
    expect(after.overallShare.percentage).toBe(before.overallShare.percentage);
    expect(after.relatedSlots).toBe(before.relatedSlots);
    // 다만 지점별 집계는 이제 3건 모두로 늘어난다.
    const branch = after.branchShares.find((b) => b.branchId === branchId)!;
    expect(branch.relatedSlots).toBe(3);

    // 다음 테스트를 위해 원복
    await db("posts")
      .where({ tab_analysis_id: tabAnalysisId, content_type: "REVIEW" })
      .update({ branch_id: null, branch_status: "PENDING" });
  });

  it("경쟁업체 슬롯 수를 정확히 집계한다", async () => {
    const result = await computeAggregate({ teamId, yearMonth: "2026-09" });
    expect(result.competitorSlots).toBe(1);
  });

  it("콘텐츠 유형별 건수를 정확히 집계한다", async () => {
    const result = await computeAggregate({ teamId, yearMonth: "2026-09" });
    expect(result.contentTypeCounts.BRANDED).toBe(2);
    expect(result.contentTypeCounts.REVIEW).toBe(1);
    expect(result.contentTypeCounts.COMPETITOR).toBe(1);
    expect(result.contentTypeCounts.INFORMATIONAL).toBe(6);
  });

  it("데이터가 없는 월은 분모 0으로 '집계 전'(percentage null)을 반환하고 0%로 단정하지 않는다", async () => {
    const result = await computeAggregate({ teamId, yearMonth: "2020-01" });
    expect(result.totalSlots).toBe(0);
    expect(result.overallShare.percentage).toBeNull();
  });

  it("다른 팀의 데이터는 절대 섞이지 않는다 (팀 간 데이터 격리)", async () => {
    const result = await computeAggregate({ teamId: "nonexistent-team", yearMonth: "2026-09" });
    expect(result.totalSlots).toBe(0);
  });
});

describe("previousYearMonth", () => {
  it("연도가 바뀌는 1월의 전월은 작년 12월이다", () => {
    expect(previousYearMonth("2026-01")).toBe("2025-12");
  });
  it("일반적인 월의 전월을 올바르게 계산한다", () => {
    expect(previousYearMonth("2026-09")).toBe("2026-08");
  });
});
