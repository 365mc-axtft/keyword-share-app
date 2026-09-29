import { Router } from "express";
import { db } from "../db";
import { asyncHandler, ApiError } from "../lib/asyncHandler";
import { toCamel } from "../lib/caseConvert";
import { env, DEMO_TEAM_ID } from "../env";
import { computeAggregate, previousYearMonth } from "../lib/aggregate";
import { computeMomDiff } from "../lib/share";

export const publicRouter = Router();

/**
 * 3절 "공개 시연 모드": 로그인 없이 누구나 접근 가능하지만, 격리된 데모 팀의 데이터만
 * 읽기 전용으로 제공한다. 실제 회사 DB에는 어떤 쓰기도 일어나지 않는다.
 * OCR 체험(업로드→인식→검수)은 프런트엔드에서 브라우저 OCR로 완전히 클라이언트 측에서만
 * 처리되며 이 서버로 전송되지 않는다 — '저장'은 로그인 후에만 가능하다.
 */
publicRouter.use((req, res, next) => {
  if (!env.publicDemoEnabled) {
    throw new ApiError(403, "PUBLIC_DEMO_DISABLED", "공개 시연 모드가 비활성화되어 있습니다.");
  }
  next();
});

publicRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const filter = { teamId: DEMO_TEAM_ID, yearMonth: q.yearMonth };
    const aggregate = await computeAggregate(filter);
    let mom = null;
    if (q.yearMonth) {
      const prevYm = previousYearMonth(q.yearMonth);
      const previous = await computeAggregate({ teamId: DEMO_TEAM_ID, yearMonth: prevYm });
      mom = { previousYearMonth: prevYm, ...computeMomDiff(aggregate.overallShare, previous.overallShare) };
    }
    res.json({ isSample: true, aggregate, monthOverMonth: mom });
  })
);

publicRouter.get(
  "/keyword-groups",
  asyncHandler(async (_req, res) => {
    const rows = await db("keyword_groups").where({ team_id: DEMO_TEAM_ID });
    res.json({ isSample: true, groups: toCamel(rows) });
  })
);

publicRouter.get(
  "/saved-records",
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    let query = db("investigations as inv")
      .join("tab_analyses as ta", "ta.investigation_id", "inv.id")
      .where({ "inv.team_id": DEMO_TEAM_ID })
      .whereNotNull("inv.saved_at");
    if (q.yearMonth) query = query.whereRaw("to_char(inv.investigation_date, 'YYYY-MM') = ?", [q.yearMonth]);
    const rows = await query.select(
      "inv.id as investigation_id",
      "inv.keyword_text",
      "inv.investigation_date",
      "ta.tab_type",
      "ta.complete"
    );
    res.json({ isSample: true, records: toCamel(rows) });
  })
);
