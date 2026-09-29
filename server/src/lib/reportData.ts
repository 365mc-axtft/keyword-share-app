import { db } from "../db";
import { computeAggregate, previousYearMonth } from "./aggregate";
import { computeMomDiff } from "./share";

export interface KeywordTop10Row {
  keywordText: string;
  tabType: "BLOG" | "INTEGRATED";
  investigationDate: string;
  slots: Array<{ rank: number; channelName: string; title: string; channelType: string } | null>;
}

export interface ReportData {
  teamId: string;
  teamName: string;
  yearMonth: string;
  criteria: Record<string, unknown>;
  aggregate: Awaited<ReturnType<typeof computeAggregate>>;
  monthOverMonth: ReturnType<typeof computeMomDiff> & { previousYearMonth: string };
  keywordTop10: KeywordTop10Row[];
  searchVolumes: Array<{ keywordText: string; volume: number; source: string }>;
  branchNotes: string | null;
  comments: Array<{ author: string; body: string; createdAt: string }>;
  reviewStatus: string;
  generatedAt: string;
}

export async function buildReportData(reportId: string): Promise<ReportData> {
  const report = await db("monthly_reports").where({ id: reportId }).first();
  if (!report) throw new Error("REPORT_NOT_FOUND");
  const team = await db("teams").where({ id: report.team_id }).first();

  const filter = { teamId: report.team_id, yearMonth: report.year_month };
  const aggregate = await computeAggregate(filter);
  const prevYm = previousYearMonth(report.year_month);
  const previous = await computeAggregate({ ...filter, yearMonth: prevYm });
  const mom = { previousYearMonth: prevYm, ...computeMomDiff(aggregate.overallShare, previous.overallShare) };

  const tabRows = await db("tab_analyses as ta")
    .join("investigations as inv", "inv.id", "ta.investigation_id")
    .where({ "inv.team_id": report.team_id, "ta.status": "SAVED" })
    .whereRaw("to_char(inv.investigation_date, 'YYYY-MM') = ?", [report.year_month])
    .select(
      "ta.id as tab_analysis_id",
      "ta.tab_type",
      "ta.complete",
      "inv.keyword_text",
      "inv.investigation_date"
    )
    .orderBy("inv.investigation_date", "desc");

  // 키워드+탭별 가장 최근 저장 분석 하나만 매트릭스에 사용
  const latestByKey = new Map<string, (typeof tabRows)[number]>();
  for (const row of tabRows) {
    const key = `${row.keyword_text}__${row.tab_type}`;
    if (!latestByKey.has(key)) latestByKey.set(key, row);
  }

  const keywordTop10: KeywordTop10Row[] = [];
  for (const row of latestByKey.values()) {
    const posts = await db("posts")
      .where({ tab_analysis_id: row.tab_analysis_id })
      .whereNotNull("analysis_rank")
      .orderBy("analysis_rank");
    const slots: KeywordTop10Row["slots"] = Array.from({ length: 10 }, () => null);
    for (const p of posts) {
      if (p.analysis_rank >= 1 && p.analysis_rank <= 10) {
        slots[p.analysis_rank - 1] = {
          rank: p.analysis_rank,
          channelName: p.exposed_channel_name,
          title: p.title_text,
          channelType: p.channel_type_guess,
        };
      }
    }
    keywordTop10.push({
      keywordText: row.keyword_text,
      tabType: row.tab_type,
      investigationDate: String(row.investigation_date),
      slots,
    });
  }
  keywordTop10.sort((a, b) => a.keywordText.localeCompare(b.keywordText) || a.tabType.localeCompare(b.tabType));

  const volumes = await db("search_volume_entries as sv")
    .join("keywords as k", "k.id", "sv.keyword_id")
    .where({ "sv.team_id": report.team_id, "sv.year_month": report.year_month })
    .select("k.text as keyword_text", "sv.volume", "sv.source");

  const comments = await db("report_comments as rc")
    .join("users as u", "u.id", "rc.user_id")
    .where({ "rc.report_id": reportId })
    .orderBy("rc.created_at", "asc")
    .select("u.name as author", "rc.body", "rc.created_at");

  return {
    teamId: report.team_id,
    teamName: team?.name ?? "",
    yearMonth: report.year_month,
    criteria: JSON.parse(report.criteria_json || "{}"),
    aggregate,
    monthOverMonth: mom,
    keywordTop10,
    searchVolumes: volumes.map((v: any) => ({ keywordText: v.keyword_text, volume: v.volume, source: v.source })),
    branchNotes: report.branch_notes_json ? JSON.parse(report.branch_notes_json).text ?? null : null,
    comments: comments.map((c: any) => ({ author: c.author, body: c.body, createdAt: String(c.created_at) })),
    reviewStatus: report.review_status,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 지점별 특이사항 초안 — 실제 집계된 변화/미확정 항목에만 근거해 문장을 만든다.
 * 원인이나 성과를 추정해서 지어내지 않는다 (15절).
 */
export function draftBranchNotes(aggregate: Awaited<ReturnType<typeof computeAggregate>>, mom: { diffPp: number | null; comparable: boolean }): string {
  const lines: string[] = [];
  if (aggregate.tabAnalysisCount === 0) {
    return "이번 달 완료된(TOP10 10개 충족 + 저장) 분석이 없어 특이사항을 생성할 수 없습니다.";
  }
  for (const b of aggregate.branchShares) {
    lines.push(
      `- ${b.branchName}: 관련 슬롯 ${b.relatedSlots}개, 점유율 ${b.share.percentage ?? "집계 전"}%.`
    );
  }
  if (aggregate.pendingBranchSlots > 0) {
    lines.push(`- 지점 확인중 슬롯 ${aggregate.pendingBranchSlots}개가 있어 지점별 수치가 추후 바뀔 수 있습니다.`);
  }
  if (mom.comparable && mom.diffPp !== null) {
    lines.push(`- 전체 관련 점유율은 전월 대비 ${mom.diffPp > 0 ? "+" : ""}${mom.diffPp}%p 입니다.`);
  } else {
    lines.push(`- 전월과 비교할 수 있는 완료 자료가 없습니다.`);
  }
  return lines.join("\n");
}
