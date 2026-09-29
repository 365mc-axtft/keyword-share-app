import { Router } from "express";
import { z } from "zod";
import { db, newId } from "../db";
import { requireAuth, requireTeamAccess, isTeamAccessible } from "../middleware/auth";
import { asyncHandler, ApiError } from "../lib/asyncHandler";
import { toCamel } from "../lib/caseConvert";

export const investigationsRouter = Router();
investigationsRouter.use(requireAuth);

const createSchema = z.object({
  teamId: z.string(),
  keywordText: z.string().min(1),
  keywordGroupId: z.string().nullable().optional(),
  investigationDate: z.string(), // YYYY-MM-DD
  searchEnvironment: z.enum(["MOBILE", "PC"]),
  tabsRequested: z.enum(["BLOG", "INTEGRATED", "BOTH"]),
  saveAsTeamDefault: z.boolean().optional().default(false),
});

function tabTypesFor(tabsRequested: string): Array<"BLOG" | "INTEGRATED"> {
  if (tabsRequested === "BOTH") return ["BLOG", "INTEGRATED"];
  return [tabsRequested as "BLOG" | "INTEGRATED"];
}

investigationsRouter.post(
  "/",
  requireTeamAccess((req) => req.body.teamId),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = createSchema.parse(req.body);

    // 재시도 시 같은 조건의 조사를 중복 생성하지 않는다: 아직 저장되지 않은(진행 중) 동일 조건
    // 조사가 있으면 그 조사를 그대로 재사용한다. 이미 저장 완료된 조사는 새 "재조사"로 취급한다
    // (README의 "재조사 버전 정책" 참고).
    const existingDraft = await db("investigations")
      .where({
        team_id: body.teamId,
        keyword_text: body.keywordText,
        investigation_date: body.investigationDate,
        search_environment: body.searchEnvironment,
        tabs_requested: body.tabsRequested,
      })
      .whereNull("saved_at")
      .first();

    let investigationId: string;
    if (existingDraft) {
      investigationId = existingDraft.id;
    } else {
      investigationId = newId();
      let keywordId: string | null = null;
      const existingKeyword = await db("keywords").where({ team_id: body.teamId, text: body.keywordText }).first();
      if (existingKeyword) {
        keywordId = existingKeyword.id;
      } else {
        keywordId = newId();
        await db("keywords").insert({
          id: keywordId,
          team_id: body.teamId,
          text: body.keywordText,
          keyword_group_id: body.keywordGroupId ?? null,
          created_at: new Date(),
        });
      }

      await db.transaction(async (trx) => {
        await trx("investigations").insert({
          id: investigationId,
          team_id: body.teamId,
          keyword_id: keywordId,
          keyword_text: body.keywordText,
          keyword_group_id: body.keywordGroupId ?? null,
          investigation_date: body.investigationDate,
          search_environment: body.searchEnvironment,
          tabs_requested: body.tabsRequested,
          created_by_id: user.id,
          created_at: new Date(),
          updated_at: new Date(),
        });
        for (const tabType of tabTypesFor(body.tabsRequested)) {
          await trx("tab_analyses").insert({
            id: newId(),
            investigation_id: investigationId,
            tab_type: tabType,
            status: "DRAFT",
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      });
    }

    if (body.saveAsTeamDefault) {
      await db("teams")
        .where({ id: body.teamId })
        .update({ default_search_env: body.searchEnvironment, default_search_tab: body.tabsRequested });
    }

    const investigation = await db("investigations").where({ id: investigationId }).first();
    const tabAnalyses = await db("tab_analyses").where({ investigation_id: investigationId });
    res.status(existingDraft ? 200 : 201).json({
      investigation: toCamel(investigation),
      tabAnalyses: toCamel(tabAnalyses),
      reusedExisting: Boolean(existingDraft),
    });
  })
);

investigationsRouter.get(
  "/",
  requireTeamAccess((req) => req.query.teamId as string | undefined),
  asyncHandler(async (req, res) => {
    const { teamId, from, to, keywordGroupId, savedOnly } = req.query as Record<string, string | undefined>;
    let q = db("investigations").where({ team_id: teamId });
    if (from) q = q.where("investigation_date", ">=", from);
    if (to) q = q.where("investigation_date", "<=", to);
    if (keywordGroupId) q = q.where({ keyword_group_id: keywordGroupId });
    if (savedOnly === "true") q = q.whereNotNull("saved_at");
    const rows = await q.orderBy("investigation_date", "desc");
    res.json({ investigations: toCamel(rows) });
  })
);

investigationsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const investigation = await db("investigations").where({ id: req.params.id }).first();
    if (!investigation) throw new ApiError(404, "INVESTIGATION_NOT_FOUND", "조사를 찾을 수 없습니다.");
    if (!(await isTeamAccessible(user, investigation.team_id))) {
      throw new ApiError(403, "FORBIDDEN_TEAM", "권한이 없습니다.");
    }
    const tabAnalyses = await db("tab_analyses").where({ investigation_id: investigation.id });
    res.json({ investigation: toCamel(investigation), tabAnalyses: toCamel(tabAnalyses) });
  })
);

/**
 * 두 탭 모두(또는 단일 탭) 검수 완료 후 묶음 저장. 실패 시 부분 저장이 남지 않도록
 * 단일 트랜잭션으로 처리한다 (5절, 18절 8번).
 */
investigationsRouter.post(
  "/:id/save",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const investigation = await db("investigations").where({ id: req.params.id }).first();
    if (!investigation) throw new ApiError(404, "INVESTIGATION_NOT_FOUND", "조사를 찾을 수 없습니다.");
    if (!(await isTeamAccessible(user, investigation.team_id))) {
      throw new ApiError(403, "FORBIDDEN_TEAM", "권한이 없습니다.");
    }
    if (investigation.saved_at) {
      return res.json({ ok: true, alreadySaved: true });
    }

    const tabAnalyses = await db("tab_analyses").where({ investigation_id: investigation.id });
    const notConfirmed = tabAnalyses.filter((t) => !t.classification_confirmed_at);
    if (notConfirmed.length > 0) {
      throw new ApiError(
        400,
        "CLASSIFICATION_NOT_CONFIRMED",
        `${notConfirmed.map((t) => t.tab_type).join(", ")} 탭의 분류·지점 검수 확인이 끝나지 않았습니다.`
      );
    }

    await db.transaction(async (trx) => {
      const now = new Date();
      for (const tab of tabAnalyses) {
        const top10Count = await trx("posts")
          .where({ tab_analysis_id: tab.id, included_in_top10: true })
          .count<{ count: string }[]>("id as count")
          .first();
        const complete = Number(top10Count?.count ?? 0) >= 10;
        await trx("tab_analyses").where({ id: tab.id }).update({ status: "SAVED", saved_at: now, complete, updated_at: now });
      }
      await trx("investigations").where({ id: investigation.id }).update({ saved_at: now, updated_at: now });
    });

    const updated = await db("investigations").where({ id: investigation.id }).first();
    const updatedTabs = await db("tab_analyses").where({ investigation_id: investigation.id });
    res.json({ investigation: toCamel(updated), tabAnalyses: toCamel(updatedTabs) });
  })
);
