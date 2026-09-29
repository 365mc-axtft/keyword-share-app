import { db } from "../db";
import { computeShare, ShareResult } from "./share";

export interface AggregateFilter {
  teamId: string;
  yearMonth?: string; // "2026-09"
  from?: string;
  to?: string;
  keywordGroupId?: string;
  keywordId?: string;
  tabType?: "BLOG" | "INTEGRATED";
  searchEnvironment?: "MOBILE" | "PC";
  branchId?: string;
  contentType?: "BRANDED" | "REVIEW" | "INFORMATIONAL" | "COMPETITOR";
}

/**
 * 14절: 완료 기준(탭당 TOP10 10개 충족 + 저장 완료)을 만족하는 tab_analysis만
 * 점유율 분모/분자에 포함한다. 초안·미완료·소프트삭제된 팀 데이터는 제외.
 */
function scopedTabAnalysesQuery(filter: AggregateFilter) {
  let q = db("tab_analyses as ta")
    .join("investigations as inv", "inv.id", "ta.investigation_id")
    .where({ "inv.team_id": filter.teamId, "ta.status": "SAVED", "ta.complete": true });

  if (filter.yearMonth) {
    q = q.whereRaw("to_char(inv.investigation_date, 'YYYY-MM') = ?", [filter.yearMonth]);
  }
  if (filter.from) q = q.where("inv.investigation_date", ">=", filter.from);
  if (filter.to) q = q.where("inv.investigation_date", "<=", filter.to);
  if (filter.keywordGroupId) q = q.where({ "inv.keyword_group_id": filter.keywordGroupId });
  if (filter.keywordId) q = q.where({ "inv.keyword_id": filter.keywordId });
  if (filter.tabType) q = q.where({ "ta.tab_type": filter.tabType });
  if (filter.searchEnvironment) q = q.where({ "inv.search_environment": filter.searchEnvironment });
  return q;
}

export interface AggregateResult {
  totalSlots: number;
  relatedSlots: number;
  overallShare: ShareResult;
  branchShares: Array<{ branchId: string; branchName: string; relatedSlots: number; share: ShareResult }>;
  pendingBranchSlots: number; // '지점 확인중' (관련이지만 미확정)
  contentTypeCounts: Record<string, number>;
  competitorSlots: number;
  investigationCount: number;
  tabAnalysisCount: number;
}

export async function computeAggregate(filter: AggregateFilter): Promise<AggregateResult> {
  const tabIdsRows = await scopedTabAnalysesQuery(filter).select("ta.id as tab_id", "inv.id as investigation_id");
  const tabIds = tabIdsRows.map((r) => r.tab_id);
  const investigationCount = new Set(tabIdsRows.map((r) => r.investigation_id)).size;

  if (tabIds.length === 0) {
    return {
      totalSlots: 0,
      relatedSlots: 0,
      overallShare: computeShare(0, 0),
      branchShares: [],
      pendingBranchSlots: 0,
      contentTypeCounts: {},
      competitorSlots: 0,
      investigationCount: 0,
      tabAnalysisCount: 0,
    };
  }

  let postsQuery = db("posts").whereIn("tab_analysis_id", tabIds).where({ included_in_top10: true });
  if (filter.contentType) postsQuery = postsQuery.where({ content_type: filter.contentType });

  const totalSlots = tabIds.length * 10; // complete=true 이므로 탭당 정확히 10슬롯

  const relatedCountRow = await db("posts")
    .whereIn("tab_analysis_id", tabIds)
    .where({ included_in_top10: true, related_365mc: true })
    .count<{ count: string }[]>("id as count")
    .first();
  const relatedSlots = Number(relatedCountRow?.count ?? 0);

  const pendingRow = await db("posts")
    .whereIn("tab_analysis_id", tabIds)
    .where({ included_in_top10: true, related_365mc: true, branch_status: "PENDING" })
    .count<{ count: string }[]>("id as count")
    .first();
  const pendingBranchSlots = Number(pendingRow?.count ?? 0);

  const competitorRow = await db("posts")
    .whereIn("tab_analysis_id", tabIds)
    .where({ included_in_top10: true, content_type: "COMPETITOR" })
    .count<{ count: string }[]>("id as count")
    .first();
  const competitorSlots = Number(competitorRow?.count ?? 0);

  const branchRows = await db("posts as p")
    .join("branches as b", "b.id", "p.branch_id")
    .whereIn("p.tab_analysis_id", tabIds)
    .where({ "p.included_in_top10": true, "p.related_365mc": true, "p.branch_status": "CONFIRMED" })
    .groupBy("b.id", "b.name")
    .select("b.id as branch_id", "b.name as branch_name")
    .count<{ count: string }[]>("p.id as count");

  const branchShares = branchRows.map((r: any) => ({
    branchId: r.branch_id,
    branchName: r.branch_name,
    relatedSlots: Number(r.count),
    share: computeShare(Number(r.count), totalSlots),
  }));

  const contentRows = await db("posts")
    .whereIn("tab_analysis_id", tabIds)
    .where({ included_in_top10: true })
    .whereNotNull("content_type")
    .groupBy("content_type")
    .select("content_type")
    .count<{ count: string }[]>("id as count");
  const contentTypeCounts: Record<string, number> = {};
  for (const r of contentRows as any[]) contentTypeCounts[r.content_type] = Number(r.count);

  return {
    totalSlots,
    relatedSlots,
    overallShare: computeShare(relatedSlots, totalSlots),
    branchShares,
    pendingBranchSlots,
    contentTypeCounts,
    competitorSlots,
    investigationCount,
    tabAnalysisCount: tabIds.length,
  };
}

export function previousYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
