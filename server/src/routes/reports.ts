import { Router } from "express";
import { z } from "zod";
import { db, newId } from "../db";
import { requireAuth, requireTeamAccess, isTeamAccessible } from "../middleware/auth";
import { asyncHandler, ApiError } from "../lib/asyncHandler";
import { toCamel } from "../lib/caseConvert";
import { computeAggregate, previousYearMonth } from "../lib/aggregate";
import { computeMomDiff } from "../lib/share";
import { buildReportData, draftBranchNotes } from "../lib/reportData";
import { buildReportWorkbook } from "../lib/export/excel";
import { buildReportPdf } from "../lib/export/pdf";
import { parseSearchVolumeExcel } from "../lib/export/searchVolumeImport";
import { upload } from "../lib/upload";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

// HTTP 헤더 값은 라틴-1 범위만 허용되므로, 한글이 포함된 파일명을 Content-Disposition에
// 직접 넣으면 "Invalid character in header content" 오류가 난다 (실제로 재현되어 수정함).
// RFC 5987(filename*)로 UTF-8 파일명을 인코딩하고, 구형 클라이언트를 위한 ASCII 대체
// filename도 함께 제공한다.
function setDownloadFilename(res: import("express").Response, rawName: string) {
  const asciiFallback = rawName.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(rawName);
  res.setHeader("Content-Disposition", `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`);
}

reportsRouter.get(
  "/",
  requireTeamAccess((req) => req.query.teamId as string | undefined),
  asyncHandler(async (req, res) => {
    const rows = await db("monthly_reports").where({ team_id: req.query.teamId }).orderBy("year_month", "desc");
    res.json({ reports: toCamel(rows) });
  })
);

const upsertSchema = z.object({
  teamId: z.string(),
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  keywordGroupId: z.string().nullable().optional(),
  tabType: z.enum(["BLOG", "INTEGRATED"]).nullable().optional(),
  searchEnvironment: z.enum(["MOBILE", "PC"]).nullable().optional(),
});

/** 보고서 생성/갱신 — 기준(criteria)을 스냅샷으로 저장하고 지점별 특이사항 초안을 다시 만든다. */
reportsRouter.post(
  "/",
  requireTeamAccess((req) => req.body.teamId),
  asyncHandler(async (req, res) => {
    const body = upsertSchema.parse(req.body);
    const criteria = {
      keywordGroupId: body.keywordGroupId ?? null,
      tabType: body.tabType ?? null,
      searchEnvironment: body.searchEnvironment ?? null,
      topN: 10,
      generatedBy: req.user!.id,
    };

    const aggregate = await computeAggregate({
      teamId: body.teamId,
      yearMonth: body.yearMonth,
      keywordGroupId: body.keywordGroupId ?? undefined,
      tabType: body.tabType ?? undefined,
      searchEnvironment: body.searchEnvironment ?? undefined,
    });
    const prevYm = previousYearMonth(body.yearMonth);
    const previous = await computeAggregate({ teamId: body.teamId, yearMonth: prevYm });
    const mom = computeMomDiff(aggregate.overallShare, previous.overallShare);
    const notes = draftBranchNotes(aggregate, mom);

    const existing = await db("monthly_reports").where({ team_id: body.teamId, year_month: body.yearMonth }).first();
    if (existing) {
      await db("monthly_reports")
        .where({ id: existing.id })
        .update({
          criteria_json: JSON.stringify(criteria),
          branch_notes_json: JSON.stringify({ text: notes }),
          updated_at: new Date(),
        });
      return res.json({ report: toCamel(await db("monthly_reports").where({ id: existing.id }).first()) });
    }

    const id = newId();
    await db("monthly_reports").insert({
      id,
      team_id: body.teamId,
      year_month: body.yearMonth,
      criteria_json: JSON.stringify(criteria),
      branch_notes_json: JSON.stringify({ text: notes }),
      review_status: "DRAFT",
      created_by_id: req.user!.id,
      created_at: new Date(),
      updated_at: new Date(),
    });
    res.status(201).json({ report: toCamel(await db("monthly_reports").where({ id }).first()) });
  })
);

/**
 * 보고서 row를 조회하고, 요청 사용자가 그 보고서가 속한 팀에 접근 가능한지 확인한다.
 * report-by-ID 계열 라우트(상세/수정/댓글/내보내기)가 팀 소속 검증 없이 다른 회사의
 * 보고서를 그대로 노출하던 취약점을 막기 위한 공통 헬퍼.
 */
async function loadReportOrThrow(reportId: string, user: import("../middleware/auth").AuthUser) {
  const report = await db("monthly_reports").where({ id: reportId }).first();
  if (!report) throw new ApiError(404, "REPORT_NOT_FOUND", "보고서를 찾을 수 없습니다.");
  if (!(await isTeamAccessible(user, report.team_id))) {
    throw new ApiError(403, "FORBIDDEN_TEAM", "권한이 없습니다.");
  }
  return report;
}

reportsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadReportOrThrow(req.params.id, req.user!);
    const data = await buildReportData(req.params.id).catch(() => null);
    if (!data) throw new ApiError(404, "REPORT_NOT_FOUND", "보고서를 찾을 수 없습니다.");
    res.json({ report: data });
  })
);

const patchSchema = z.object({
  reviewStatus: z.enum(["DRAFT", "IN_REVIEW", "FINAL"]).optional(),
  branchNotesText: z.string().optional(),
});

reportsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = patchSchema.parse(req.body);
    await loadReportOrThrow(req.params.id, req.user!);
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (body.reviewStatus) {
      patch.review_status = body.reviewStatus;
      if (body.reviewStatus === "FINAL") patch.finalized_at = new Date();
    }
    if (body.branchNotesText !== undefined) patch.branch_notes_json = JSON.stringify({ text: body.branchNotesText });
    await db("monthly_reports").where({ id: req.params.id }).update(patch);
    res.json({ ok: true });
  })
);

reportsRouter.post(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const { body } = z.object({ body: z.string().min(1) }).parse(req.body);
    await loadReportOrThrow(req.params.id, req.user!);
    const id = newId();
    await db("report_comments").insert({ id, report_id: req.params.id, user_id: req.user!.id, body, created_at: new Date() });
    res.status(201).json({ ok: true });
  })
);

reportsRouter.get(
  "/:id/export.xlsx",
  asyncHandler(async (req, res) => {
    await loadReportOrThrow(req.params.id, req.user!);
    const data = await buildReportData(req.params.id).catch(() => null);
    if (!data) throw new ApiError(404, "REPORT_NOT_FOUND", "보고서를 찾을 수 없습니다.");
    const wb = await buildReportWorkbook(data);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    setDownloadFilename(res, `report-${data.teamName}-${data.yearMonth}.xlsx`);
    await db("usage_logs").insert({
      id: newId(),
      type: "EXPORT_EXCEL",
      team_id: data.teamId,
      user_id: req.user!.id,
      created_at: new Date(),
    });
    await wb.xlsx.write(res);
    res.end();
  })
);

reportsRouter.get(
  "/:id/export.pdf",
  asyncHandler(async (req, res) => {
    await loadReportOrThrow(req.params.id, req.user!);
    const data = await buildReportData(req.params.id).catch(() => null);
    if (!data) throw new ApiError(404, "REPORT_NOT_FOUND", "보고서를 찾을 수 없습니다.");
    res.setHeader("Content-Type", "application/pdf");
    setDownloadFilename(res, `report-${data.teamName}-${data.yearMonth}.pdf`);
    const doc = buildReportPdf(data);
    await db("usage_logs").insert({
      id: newId(),
      type: "EXPORT_PDF",
      team_id: data.teamId,
      user_id: req.user!.id,
      created_at: new Date(),
    });
    doc.pipe(res);
    doc.end();
  })
);

reportsRouter.get(
  "/:id/export.json",
  asyncHandler(async (req, res) => {
    await loadReportOrThrow(req.params.id, req.user!);
    const data = await buildReportData(req.params.id).catch(() => null);
    if (!data) throw new ApiError(404, "REPORT_NOT_FOUND", "보고서를 찾을 수 없습니다.");
    setDownloadFilename(res, `report-${data.teamName}-${data.yearMonth}.json`);
    res.json(data);
  })
);

// ---- 검색량 Excel 업로드 ----

reportsRouter.post(
  "/search-volume/import",
  upload.single("file"),
  requireTeamAccess((req) => (req.body?.teamId as string) || (req.query.teamId as string)),
  asyncHandler(async (req, res) => {
    const teamId = (req.body?.teamId as string) || (req.query.teamId as string);
    const yearMonth = (req.body?.yearMonth as string) || (req.query.yearMonth as string);
    if (!teamId || !yearMonth) throw new ApiError(400, "MISSING_PARAMS", "teamId와 yearMonth가 필요합니다.");
    const file = req.file;
    if (!file) throw new ApiError(400, "NO_FILE", "엑셀 파일이 없습니다.");

    const parsed = await parseSearchVolumeExcel(file.buffer);
    let created = 0;
    let updated = 0;
    for (const row of parsed.rows) {
      let keyword = await db("keywords").where({ team_id: teamId, text: row.keywordText }).first();
      if (!keyword) {
        const id = newId();
        await db("keywords").insert({ id, team_id: teamId, text: row.keywordText, created_at: new Date() });
        keyword = { id };
      }
      const existing = await db("search_volume_entries")
        .where({ team_id: teamId, keyword_id: keyword.id, year_month: yearMonth })
        .first();
      if (existing) {
        await db("search_volume_entries")
          .where({ id: existing.id })
          .update({ volume: row.volume, source: "EXCEL", updated_at: new Date() });
        updated++;
      } else {
        await db("search_volume_entries").insert({
          id: newId(),
          team_id: teamId,
          keyword_id: keyword.id,
          year_month: yearMonth,
          volume: row.volume,
          source: "EXCEL",
          created_at: new Date(),
          updated_at: new Date(),
        });
        created++;
      }
    }
    res.json({ created, updated, errors: parsed.errors });
  })
);

// ---- JSON 내보내기/가져오기 (원본 데이터, 팀/기간 범위) ----

reportsRouter.get(
  "/data-export/json",
  requireTeamAccess((req) => req.query.teamId as string | undefined),
  asyncHandler(async (req, res) => {
    const { teamId, from, to } = req.query as Record<string, string | undefined>;
    let invQuery = db("investigations").where({ team_id: teamId });
    if (from) invQuery = invQuery.where("investigation_date", ">=", from);
    if (to) invQuery = invQuery.where("investigation_date", "<=", to);
    const investigations = await invQuery;
    const invIds = investigations.map((i) => i.id);
    const tabAnalyses = invIds.length ? await db("tab_analyses").whereIn("investigation_id", invIds) : [];
    const tabIds = tabAnalyses.map((t) => t.id);
    const posts = tabIds.length ? await db("posts").whereIn("tab_analysis_id", tabIds) : [];
    const modules = tabIds.length ? await db("detected_modules").whereIn("tab_analysis_id", tabIds) : [];

    res.setHeader("Content-Disposition", `attachment; filename="raw-export-${teamId}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      teamId,
      investigations: toCamel(investigations),
      tabAnalyses: toCamel(tabAnalyses),
      posts: toCamel(posts),
      detectedModules: toCamel(modules),
    });
  })
);
