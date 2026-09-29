/**
 * 17절 "더미 데이터 및 실제 흐름" 시드 스크립트.
 *
 * - 2개 이상 팀, 2개월(2026-08, 2026-09), 여러 키워드/그룹, 두 검색 탭(블로그/통합검색),
 *   모든 콘텐츠 유형(BRANDED/REVIEW/INFORMATIONAL/COMPETITOR), 지점 확인중 사례,
 *   경쟁업체 사례를 포함한다.
 * - 모든 이름에 "(샘플)"을 붙이고 이메일도 -sample.local 도메인을 사용해 실제 데이터와
 *   절대 섞이지 않게 한다. 공개 시연 모드(공개 API)는 이 중 DEMO_TEAM_ID 팀 데이터만
 *   읽기 전용으로 노출한다 (env.ts, routes/public.ts 참고).
 * - 실제 대시보드/리포트가 사용하는 것과 동일한 계산 함수(computeTop10, matchChannel,
 *   suggestClassification, computeAggregate, draftBranchNotes)를 그대로 호출해서 만든다.
 *   즉 이 스크립트가 만든 데이터는 "화면에 보여주려고 하드코딩한 문자열"이 아니라, 실제 서비스
 *   로직이 계산한 결과이다 — 명세서가 금지하는 "가짜 완료 표시/하드코딩된 리포트"에 해당하지 않는다.
 *
 * 실행: npm run seed  (server/ 안에서, DATABASE_URL이 가리키는 DB에 씀 — 운영 DB에는 절대 실행 금지)
 */
import { db, newId } from "../db";
import { hashPassword } from "../lib/password";
import { matchChannel } from "../lib/matching";
import { suggestClassification } from "../lib/classificationSuggestion";
import { computeTop10, RankablePost } from "../lib/topN";
import { computeAggregate, previousYearMonth } from "../lib/aggregate";
import { computeMomDiff } from "../lib/share";
import { draftBranchNotes } from "../lib/reportData";
import { DEMO_COMPANY_ID, DEMO_TEAM_ID } from "../env";

const DEMO_TEAM_2_ID = "demo-team-2";
const DEMO_ADMIN_EMAIL = "demo@365mc-sample.local";
const DEMO_ADMIN_PASSWORD = "Demo1234!"; // 샘플 계정 전용 — README에 안내, 운영 계정과 무관

function guessPlatform(channelTypeGuess: string): string {
  switch (channelTypeGuess) {
    case "CAFE":
      return "NAVER_CAFE";
    case "KIN":
      return "KIN";
    case "TISTORY":
      return "TISTORY";
    case "OWN_HOMEPAGE":
      return "OWN_HOMEPAGE";
    case "APP":
      return "APP";
    case "OWN_BLOG":
    case "BLOG":
      return "NAVER_BLOG";
    default:
      return "OTHER";
  }
}

async function wipeDemoData() {
  // 데모 회사 소속 데이터만 지운다 (실제 회사 데이터는 company_id가 달라 건드리지 않음).
  const teamIds = [DEMO_TEAM_ID, DEMO_TEAM_2_ID];
  const invRows = await db("investigations").whereIn("team_id", teamIds).select("id");
  const invIds = invRows.map((r) => r.id);
  const tabRows = invIds.length
    ? await db("tab_analyses").whereIn("investigation_id", invIds).select("id")
    : [];
  const tabIds = tabRows.map((r) => r.id);

  if (tabIds.length) {
    await db("posts").whereIn("tab_analysis_id", tabIds).delete();
    await db("detected_modules").whereIn("tab_analysis_id", tabIds).delete();
    await db("uploaded_images").whereIn("tab_analysis_id", tabIds).delete();
    await db("tab_analyses").whereIn("id", tabIds).delete();
  }
  if (invIds.length) {
    await db("investigations").whereIn("id", invIds).delete();
  }
  const reportIds = (await db("monthly_reports").whereIn("team_id", teamIds).select("id")).map((r) => r.id);
  if (reportIds.length) {
    await db("report_comments").whereIn("report_id", reportIds).delete();
    await db("monthly_reports").whereIn("id", reportIds).delete();
  }
  await db("search_volume_entries").whereIn("team_id", teamIds).delete();
  await db("keywords").whereIn("team_id", teamIds).delete();
  await db("keyword_groups").whereIn("team_id", teamIds).delete();
  await db("team_memberships").whereIn("team_id", teamIds).delete();
  await db("teams").whereIn("id", teamIds).delete();
  await db("channel_aliases").whereRaw("channel_id in (select id from channels where company_id = ?)", [
    DEMO_COMPANY_ID,
  ]).delete();
  await db("channels").where({ company_id: DEMO_COMPANY_ID }).delete();
  await db("branches").where({ company_id: DEMO_COMPANY_ID }).delete();
  await db("competitors").where({ company_id: DEMO_COMPANY_ID }).delete();
  await db("users").where({ company_id: DEMO_COMPANY_ID }).delete();
  await db("companies").where({ id: DEMO_COMPANY_ID }).delete();
}

interface PostSpec {
  exposedChannelName: string;
  titleText: string;
  channelTypeGuess: string;
  // 매칭 실패를 의도적으로 재현하고 싶을 때(미분류 사례) true
  forceUnmatched?: boolean;
}

async function insertPostsForTab(params: {
  tabAnalysisId: string;
  companyId: string;
  specs: PostSpec[];
  forcePendingBranchIndex?: number; // 이 인덱스의 게시물은 related=true인데 지점 미확정으로 강제
}) {
  const { tabAnalysisId, companyId, specs, forcePendingBranchIndex } = params;
  const moduleId = newId();
  await db("detected_modules").insert({
    id: moduleId,
    tab_analysis_id: tabAnalysisId,
    uploaded_image_id: null,
    kind: "GENERAL_SOURCE",
    name: "일반 게시글 (샘플)",
    is_post_bearing: true,
    included_by_default: true,
    detected_post_count: specs.length,
    created_at: new Date(),
  });

  const postIds: string[] = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const match = spec.forceUnmatched
      ? { matchedChannelId: null, matchMethod: "NONE" as const, matchConfidence: null }
      : await matchChannel({
          companyId,
          platform: guessPlatform(spec.channelTypeGuess),
          exposedChannelName: spec.exposedChannelName,
        });

    let suggestion: ReturnType<typeof suggestClassification> = {
      contentType: null,
      related365mc: null,
      branchId: null,
      branchStatus: "NOT_APPLICABLE",
    };
    if (match.matchedChannelId) {
      const channel = await db("channels").where({ id: match.matchedChannelId }).first();
      suggestion = suggestClassification({ channelSegment: channel.segment, channelBranchId: channel.branch_id });
    }

    if (i === forcePendingBranchIndex && suggestion.related365mc) {
      suggestion = { ...suggestion, branchId: null, branchStatus: "PENDING" };
    }

    const id = newId();
    postIds.push(id);
    await db("posts").insert({
      id,
      tab_analysis_id: tabAnalysisId,
      uploaded_image_id: null,
      group_id: moduleId,
      original_order: i,
      analysis_rank: null,
      included_in_top10: false,
      is_deleted_misrecognition: false,
      is_manually_added: false,
      channel_type_guess: spec.channelTypeGuess,
      exposed_channel_name: spec.exposedChannelName,
      title_text: spec.titleText,
      ocr_raw_channel_name: spec.exposedChannelName,
      ocr_raw_title: spec.titleText,
      ocr_confidence_channel: 92,
      ocr_confidence_title: 90,
      matched_channel_id: match.matchedChannelId,
      match_method: match.matchMethod,
      match_confidence: match.matchConfidence,
      content_type: suggestion.contentType,
      related_365mc: suggestion.related365mc,
      branch_id: suggestion.branchId,
      branch_status: suggestion.branchStatus,
      branch_source: "AUTO",
      content_type_source: "AUTO",
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  // 실제 compute-top10 로직 그대로 호출 (하드코딩 금지 원칙 준수).
  const rankable: RankablePost[] = specs.map((_, i) => ({
    id: postIds[i],
    originalOrder: i,
    isDeletedMisrecognition: false,
    groupIncluded: true,
    groupIsPostBearing: true,
  }));
  const ranked = computeTop10(rankable);
  for (const r of ranked) {
    await db("posts")
      .where({ id: r.id })
      .update({ analysis_rank: r.analysisRank, included_in_top10: r.includedInTop10 });
  }
  const top10Count = ranked.filter((r) => r.includedInTop10).length;
  await db("tab_analyses")
    .where({ id: tabAnalysisId })
    .update({
      module_filter_json: JSON.stringify({ excludedGroupIds: [], excludedChannelTypes: [] }),
      complete: top10Count >= 10,
    });
}

function dateInMonth(yearMonth: string, day: number): string {
  return `${yearMonth}-${String(day).padStart(2, "0")}`;
}

async function seedTeamMonth(params: {
  teamId: string;
  companyId: string;
  userId: string;
  keywordId: string;
  keywordText: string;
  yearMonth: string;
  day: number;
  blogPosts: PostSpec[];
  integratedPosts?: PostSpec[];
  pendingBranchIndex?: number;
}) {
  const { teamId, companyId, userId, keywordId, keywordText, yearMonth, day, blogPosts, integratedPosts, pendingBranchIndex } =
    params;

  const investigationId = newId();
  const tabsRequested = integratedPosts ? "BOTH" : "BLOG";
  await db("investigations").insert({
    id: investigationId,
    team_id: teamId,
    keyword_id: keywordId,
    keyword_text: keywordText,
    keyword_group_id: null,
    investigation_date: dateInMonth(yearMonth, day),
    search_environment: "MOBILE",
    tabs_requested: tabsRequested,
    created_by_id: userId,
    created_at: new Date(),
    updated_at: new Date(),
    saved_at: new Date(),
  });

  const blogTabId = newId();
  await db("tab_analyses").insert({
    id: blogTabId,
    investigation_id: investigationId,
    tab_type: "BLOG",
    status: "SAVED",
    created_at: new Date(),
    updated_at: new Date(),
    reviewed_at: new Date(),
    saved_at: new Date(),
    classification_confirmed_at: new Date(),
  });
  await insertPostsForTab({
    tabAnalysisId: blogTabId,
    companyId,
    specs: blogPosts,
    forcePendingBranchIndex: pendingBranchIndex,
  });

  if (integratedPosts) {
    const intTabId = newId();
    await db("tab_analyses").insert({
      id: intTabId,
      investigation_id: investigationId,
      tab_type: "INTEGRATED",
      status: "SAVED",
      created_at: new Date(),
      updated_at: new Date(),
      reviewed_at: new Date(),
      saved_at: new Date(),
      classification_confirmed_at: new Date(),
    });
    await insertPostsForTab({ tabAnalysisId: intTabId, companyId, specs: integratedPosts });
  }
}

async function seedMonthlyReport(teamId: string, yearMonth: string, userId: string) {
  const filter = { teamId, yearMonth };
  const aggregate = await computeAggregate(filter);
  const prevYm = previousYearMonth(yearMonth);
  const previous = await computeAggregate({ teamId, yearMonth: prevYm });
  const mom = computeMomDiff(aggregate.overallShare, previous.overallShare);
  const notes = draftBranchNotes(aggregate, mom);

  const reportId = newId();
  await db("monthly_reports").insert({
    id: reportId,
    team_id: teamId,
    year_month: yearMonth,
    criteria_json: JSON.stringify({ keywordGroupId: null, tabType: null, searchEnvironment: null, topN: 10, generatedBy: userId }),
    branch_notes_json: JSON.stringify({ text: notes }),
    review_status: yearMonth < "2026-09" ? "FINAL" : "IN_REVIEW",
    created_by_id: userId,
    created_at: new Date(),
    updated_at: new Date(),
    finalized_at: yearMonth < "2026-09" ? new Date() : null,
  });
  await db("report_comments").insert({
    id: newId(),
    report_id: reportId,
    user_id: userId,
    body: "(샘플) 이번 달 지점별 점유율 확인 후 코멘트 남겨주세요.",
    created_at: new Date(),
  });
}

async function main() {
  console.log("[seed] 기존 샘플(데모) 데이터 삭제 중...");
  await wipeDemoData();

  console.log("[seed] 회사/사용자/팀 생성 중...");
  await db("companies").insert({ id: DEMO_COMPANY_ID, name: "365mc 샘플 데모 회사", created_at: new Date() });

  const adminId = newId();
  await db("users").insert({
    id: adminId,
    company_id: DEMO_COMPANY_ID,
    email: DEMO_ADMIN_EMAIL,
    password_hash: await hashPassword(DEMO_ADMIN_PASSWORD),
    name: "샘플 관리자",
    global_role: "ADMIN",
    created_at: new Date(),
    updated_at: new Date(),
  });

  await db("teams").insert([
    { id: DEMO_TEAM_ID, company_id: DEMO_COMPANY_ID, name: "강남점 마케팅팀 (샘플)", created_at: new Date(), updated_at: new Date() },
    { id: DEMO_TEAM_2_ID, company_id: DEMO_COMPANY_ID, name: "잠실점 마케팅팀 (샘플)", created_at: new Date(), updated_at: new Date() },
  ]);
  await db("team_memberships").insert([
    { id: newId(), user_id: adminId, team_id: DEMO_TEAM_ID, role: "TEAM_ADMIN", joined_at: new Date() },
    { id: newId(), user_id: adminId, team_id: DEMO_TEAM_2_ID, role: "TEAM_ADMIN", joined_at: new Date() },
  ]);

  console.log("[seed] 지점/경쟁업체/채널 리스트 생성 중...");
  const branchGangnamId = newId();
  const branchJamsilId = newId();
  await db("branches").insert([
    { id: branchGangnamId, company_id: DEMO_COMPANY_ID, name: "강남점", created_at: new Date() },
    { id: branchJamsilId, company_id: DEMO_COMPANY_ID, name: "잠실점", created_at: new Date() },
  ]);
  const competitorId = newId();
  await db("competitors").insert({ id: competitorId, company_id: DEMO_COMPANY_ID, name: "OO성형외과 (경쟁사 샘플)" });

  function normKey(s: string) {
    return s.trim().toLowerCase();
  }
  const channels = [
    { name: "365mc 강남점 블로그 (샘플)", platform: "NAVER_BLOG", segment: "OWN_365MC", branchId: branchGangnamId, competitorId: null },
    { name: "365mc 잠실점 블로그 (샘플)", platform: "NAVER_BLOG", segment: "OWN_365MC", branchId: branchJamsilId, competitorId: null },
    { name: "365mc 다녀온 후기 카페 (샘플)", platform: "NAVER_CAFE", segment: "SUPPORTER_CUSTOMER", branchId: null, competitorId: null },
    { name: "OO성형외과 블로그 (샘플)", platform: "NAVER_BLOG", segment: "COMPETITOR", branchId: null, competitorId },
    { name: "다이어트 정보 블로그 (샘플)", platform: "NAVER_BLOG", segment: "GENERAL_INFO", branchId: null, competitorId: null },
  ];
  for (const c of channels) {
    await db("channels").insert({
      id: newId(),
      company_id: DEMO_COMPANY_ID,
      platform: c.platform,
      exposed_name: c.name,
      internal_nickname: null,
      channel_id_or_url: null,
      normalized_key: normKey(c.name),
      segment: c.segment,
      brand_id: null,
      branch_id: c.branchId,
      competitor_id: c.competitorId,
      note: "시드 스크립트로 생성된 샘플 채널입니다.",
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
      created_by: adminId,
      updated_by: adminId,
    });
  }

  console.log("[seed] 키워드그룹/키워드 생성 중...");
  const groupFatId = newId();
  const groupEyeId = newId();
  await db("keyword_groups").insert([
    { id: groupFatId, team_id: DEMO_TEAM_ID, name: "지방흡입 (샘플)", created_at: new Date() },
    { id: groupEyeId, team_id: DEMO_TEAM_2_ID, name: "눈매교정 (샘플)", created_at: new Date() },
  ]);
  const kwFatId = newId();
  const kwFatReviewId = newId();
  const kwEyeId = newId();
  await db("keywords").insert([
    { id: kwFatId, team_id: DEMO_TEAM_ID, keyword_group_id: groupFatId, text: "강남 지방흡입", created_at: new Date() },
    { id: kwFatReviewId, team_id: DEMO_TEAM_ID, keyword_group_id: groupFatId, text: "강남 지방흡입 후기", created_at: new Date() },
    { id: kwEyeId, team_id: DEMO_TEAM_2_ID, keyword_group_id: groupEyeId, text: "잠실 눈매교정", created_at: new Date() },
  ]);

  await db("search_volume_entries").insert([
    { id: newId(), team_id: DEMO_TEAM_ID, keyword_id: kwFatId, year_month: "2026-08", volume: 12000, source: "MANUAL", created_at: new Date(), updated_at: new Date() },
    { id: newId(), team_id: DEMO_TEAM_ID, keyword_id: kwFatId, year_month: "2026-09", volume: 13500, source: "MANUAL", created_at: new Date(), updated_at: new Date() },
    { id: newId(), team_id: DEMO_TEAM_2_ID, keyword_id: kwEyeId, year_month: "2026-09", volume: 4200, source: "MANUAL", created_at: new Date(), updated_at: new Date() },
  ]);

  console.log("[seed] 조사/게시물 데이터 생성 중 (2개월 x 2팀)...");

  // 팀1(강남) — 2026-08: BLOG 탭만, 지점 확인중 사례 포함
  await seedTeamMonth({
    teamId: DEMO_TEAM_ID,
    companyId: DEMO_COMPANY_ID,
    userId: adminId,
    keywordId: kwFatId,
    keywordText: "강남 지방흡입",
    yearMonth: "2026-08",
    day: 12,
    pendingBranchIndex: 1,
    blogPosts: [
      { exposedChannelName: "365mc 강남점 블로그 (샘플)", titleText: "지방흡입 후기, 3개월 변화 기록", channelTypeGuess: "OWN_BLOG" },
      { exposedChannelName: "365mc 다녀온 후기 카페 (샘플)", titleText: "지방흡입 다녀온 후기 남깁니다", channelTypeGuess: "CAFE" },
      { exposedChannelName: "OO성형외과 블로그 (샘플)", titleText: "지방흡입 전 꼭 알아야 할 것", channelTypeGuess: "BLOG" },
      { exposedChannelName: "다이어트 정보 블로그 (샘플)", titleText: "지방흡입 가격 총정리 2026", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 A (샘플)", titleText: "강남 지방흡입 상담 후기", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 B (샘플)", titleText: "지방흡입 회복 기간 정리", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 C (샘플)", titleText: "지방흡입 부작용 사례 모음", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 D (샘플)", titleText: "지방흡입 병원 고르는 법", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 E (샘플)", titleText: "지방흡입 비용 비교", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 F (샘플)", titleText: "지방흡입 수술 전후 사진", channelTypeGuess: "BLOG" },
    ],
  });

  // 팀1(강남) — 2026-09: BOTH 탭 (블로그+통합검색), 전월 대비 비교 가능하도록
  await seedTeamMonth({
    teamId: DEMO_TEAM_ID,
    companyId: DEMO_COMPANY_ID,
    userId: adminId,
    keywordId: kwFatReviewId,
    keywordText: "강남 지방흡입 후기",
    yearMonth: "2026-09",
    day: 18,
    blogPosts: [
      { exposedChannelName: "365mc 강남점 블로그 (샘플)", titleText: "지방흡입 후기, 다시 태어난 기분", channelTypeGuess: "OWN_BLOG" },
      { exposedChannelName: "365mc 강남점 블로그 (샘플)", titleText: "지방흡입 6개월 후 변화", channelTypeGuess: "OWN_BLOG" },
      { exposedChannelName: "365mc 다녀온 후기 카페 (샘플)", titleText: "지방흡입 실제 후기 공유", channelTypeGuess: "CAFE" },
      { exposedChannelName: "OO성형외과 블로그 (샘플)", titleText: "지방흡입 경쟁사 비교 (예시)", channelTypeGuess: "BLOG" },
      { exposedChannelName: "다이어트 정보 블로그 (샘플)", titleText: "지방흡입 가격 정보 총정리", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 A (샘플)", titleText: "강남 지방흡입 후기 모음", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 B (샘플)", titleText: "지방흡입 붓기 빼는 법", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 C (샘플)", titleText: "지방흡입 회복 꿀팁", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 D (샘플)", titleText: "지방흡입 병원 후기 비교", channelTypeGuess: "BLOG" },
      { exposedChannelName: "미분류 블로거 X (샘플)", titleText: "지방흡입 관련 미분류 게시물", channelTypeGuess: "BLOG", forceUnmatched: true },
    ],
    integratedPosts: [
      { exposedChannelName: "365mc 강남점 블로그 (샘플)", titleText: "지방흡입 후기, 다시 태어난 기분", channelTypeGuess: "OWN_BLOG" },
      { exposedChannelName: "지식iN 답변 (샘플)", titleText: "지방흡입 비용이 궁금해요", channelTypeGuess: "KIN" },
      { exposedChannelName: "365mc 다녀온 후기 카페 (샘플)", titleText: "지방흡입 카페 후기", channelTypeGuess: "CAFE" },
      { exposedChannelName: "다이어트 정보 블로그 (샘플)", titleText: "지방흡입 통합검색 노출 예시", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 A (샘플)", titleText: "지방흡입 통합탭 노출 사례", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 B (샘플)", titleText: "지방흡입 통합검색 후기", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 C (샘플)", titleText: "지방흡입 통합탭 정보글", channelTypeGuess: "BLOG" },
      { exposedChannelName: "OO성형외과 블로그 (샘플)", titleText: "지방흡입 경쟁사 통합탭 노출", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 D (샘플)", titleText: "지방흡입 통합탭 노출 사례2", channelTypeGuess: "BLOG" },
      { exposedChannelName: "체형관리 블로거 E (샘플)", titleText: "지방흡입 통합탭 노출 사례3", channelTypeGuess: "BLOG" },
    ],
  });

  // 팀2(잠실) — 2026-09: BLOG 탭만
  await seedTeamMonth({
    teamId: DEMO_TEAM_2_ID,
    companyId: DEMO_COMPANY_ID,
    userId: adminId,
    keywordId: kwEyeId,
    keywordText: "잠실 눈매교정",
    yearMonth: "2026-09",
    day: 20,
    blogPosts: [
      { exposedChannelName: "365mc 잠실점 블로그 (샘플)", titleText: "눈매교정 후기, 인상이 달라졌어요", channelTypeGuess: "OWN_BLOG" },
      { exposedChannelName: "다이어트 정보 블로그 (샘플)", titleText: "눈매교정 가격 비교", channelTypeGuess: "BLOG" },
      { exposedChannelName: "OO성형외과 블로그 (샘플)", titleText: "눈매교정 경쟁사 사례 (예시)", channelTypeGuess: "BLOG" },
      { exposedChannelName: "뷰티 블로거 A (샘플)", titleText: "눈매교정 회복 기간 정리", channelTypeGuess: "BLOG" },
      { exposedChannelName: "뷰티 블로거 B (샘플)", titleText: "눈매교정 병원 고르는 법", channelTypeGuess: "BLOG" },
      { exposedChannelName: "뷰티 블로거 C (샘플)", titleText: "눈매교정 전후 사진", channelTypeGuess: "BLOG" },
      { exposedChannelName: "뷰티 블로거 D (샘플)", titleText: "눈매교정 붓기 빼는 법", channelTypeGuess: "BLOG" },
      { exposedChannelName: "뷰티 블로거 E (샘플)", titleText: "눈매교정 부작용 사례", channelTypeGuess: "BLOG" },
      { exposedChannelName: "뷰티 블로거 F (샘플)", titleText: "눈매교정 비용 총정리", channelTypeGuess: "BLOG" },
      { exposedChannelName: "미분류 블로거 Y (샘플)", titleText: "눈매교정 미분류 게시물", channelTypeGuess: "BLOG", forceUnmatched: true },
    ],
  });

  console.log("[seed] 월간 보고서 생성 중 (실제 computeAggregate/draftBranchNotes 로직 사용)...");
  await seedMonthlyReport(DEMO_TEAM_ID, "2026-08", adminId);
  await seedMonthlyReport(DEMO_TEAM_ID, "2026-09", adminId);
  await seedMonthlyReport(DEMO_TEAM_2_ID, "2026-09", adminId);

  console.log("\n[seed] 완료.");
  console.log(`  - 샘플 관리자 로그인: ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD}`);
  console.log(`  - 팀: 강남점 마케팅팀 (샘플), 잠실점 마케팅팀 (샘플)`);
  console.log(`  - 공개 시연 모드(/demo, 로그인 불필요)는 이 중 "강남점 마케팅팀 (샘플)" 데이터만 읽기 전용으로 보여줍니다.`);
  console.log("  - 이 데이터는 전부 샘플이며 실제 회사 데이터와 분리되어 있습니다 (company_id가 다름).");

  await db.destroy();
}

main().catch((err) => {
  console.error("[seed] 실패:", err);
  process.exit(1);
});
