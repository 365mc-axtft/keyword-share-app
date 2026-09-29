import { Router } from "express";
import { db } from "../db";
import { requireAuth, requireTeamAccess } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { toCamel } from "../lib/caseConvert";
import { computeAggregate, previousYearMonth, AggregateFilter } from "../lib/aggregate";
import { computeMomDiff } from "../lib/share";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/",
  requireTeamAccess((req) => req.query.teamId as string | undefined),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const filter: AggregateFilter = {
      teamId: q.teamId!,
      yearMonth: q.yearMonth,
      keywordGroupId: q.keywordGroupId,
      tabType: q.tabType as any,
      searchEnvironment: q.searchEnvironment as any,
    };

    const current = await computeAggregate(filter);
    let mom = null;
    if (q.yearMonth) {
      const prevYm = previousYearMonth(q.yearMonth);
      const previous = await computeAggregate({ ...filter, yearMonth: prevYm });
      mom = { previousYearMonth: prevYm, ...computeMomDiff(current.overallShare, previous.overallShare) };
    }

    // 조사 완료/검수 필요 건수 (저장 여부와 무관하게 전체 조사 기준)
    let invQuery = db("investigations").where({ team_id: q.teamId });
    if (q.yearMonth) invQuery = invQuery.whereRaw("to_char(investigation_date, 'YYYY-MM') = ?", [q.yearMonth]);
    if (q.keywordGroupId) invQuery = invQuery.where({ keyword_group_id: q.keywordGroupId });
    const investigations = await invQuery.select("id", "saved_at");
    const savedCount = investigations.filter((i) => i.saved_at).length;
    const needsReviewCount = investigations.length - savedCount;

    res.json({
      filter,
      summary: {
        investigationTotal: investigations.length,
        savedCount,
        needsReviewCount,
      },
      aggregate: current,
      monthOverMonth: mom,
    });
  })
);

dashboardRouter.get(
  "/saved-records",
  requireTeamAccess((req) => req.query.teamId as string | undefined),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    let query = db("investigations as inv")
      .join("tab_analyses as ta", "ta.investigation_id", "inv.id")
      .where({ "inv.team_id": q.teamId })
      .whereNotNull("inv.saved_at");
    if (q.yearMonth) query = query.whereRaw("to_char(inv.investigation_date, 'YYYY-MM') = ?", [q.yearMonth]);
    if (q.keywordGroupId) query = query.where({ "inv.keyword_group_id": q.keywordGroupId });
    if (q.tabType) query = query.where({ "ta.tab_type": q.tabType });

    const rows = await query
      .select(
        "inv.id as investigation_id",
        "inv.keyword_text",
        "inv.investigation_date",
        "inv.search_environment",
        "inv.tabs_requested",
        "inv.saved_at",
        "ta.id as tab_analysis_id",
        "ta.tab_type",
        "ta.complete"
      )
      .orderBy("inv.investigation_date", "desc");
    res.json({ records: toCamel(rows) });
  })
);
