import { Router } from "express";
import { z } from "zod";
import { db, newId } from "../db";
import { requireAuth, requireTeamAccess, isTeamAccessible } from "../middleware/auth";
import { asyncHandler, ApiError } from "../lib/asyncHandler";
import { toCamel } from "../lib/caseConvert";

export const keywordsRouter = Router();
keywordsRouter.use(requireAuth);

// ---- 키워드그룹 ----

keywordsRouter.get(
  "/groups",
  requireTeamAccess((req) => req.query.teamId as string | undefined),
  asyncHandler(async (req, res) => {
    const rows = await db("keyword_groups").where({ team_id: req.query.teamId }).orderBy("name");
    res.json({ groups: toCamel(rows) });
  })
);

const createGroupSchema = z.object({ teamId: z.string(), name: z.string().min(1).max(100) });

keywordsRouter.post(
  "/groups",
  requireTeamAccess((req) => req.body.teamId),
  asyncHandler(async (req, res) => {
    const body = createGroupSchema.parse(req.body);
    const dup = await db("keyword_groups").where({ team_id: body.teamId, name: body.name }).first();
    if (dup) throw new ApiError(409, "GROUP_NAME_TAKEN", "같은 이름의 키워드그룹이 있습니다.");
    const id = newId();
    await db("keyword_groups").insert({ id, team_id: body.teamId, name: body.name, created_at: new Date() });
    res.status(201).json({ group: toCamel(await db("keyword_groups").where({ id }).first()) });
  })
);

keywordsRouter.delete(
  "/groups/:id",
  asyncHandler(async (req, res) => {
    const group = await db("keyword_groups").where({ id: req.params.id }).first();
    if (!group) throw new ApiError(404, "GROUP_NOT_FOUND", "키워드그룹을 찾을 수 없습니다.");
    // 팀 접근 검증 (동적 teamId라 미들웨어 대신 여기서 수행)
    const user = req.user!;
    if (!(await isTeamAccessible(user, group.team_id))) {
      throw new ApiError(403, "FORBIDDEN_TEAM", "권한이 없습니다.");
    }
    await db("keywords").where({ keyword_group_id: req.params.id }).update({ keyword_group_id: null });
    await db("keyword_groups").where({ id: req.params.id }).delete();
    res.json({ ok: true });
  })
);

// ---- 키워드 ----

keywordsRouter.get(
  "/",
  requireTeamAccess((req) => req.query.teamId as string | undefined),
  asyncHandler(async (req, res) => {
    const rows = await db("keywords").where({ team_id: req.query.teamId }).orderBy("text");
    res.json({ keywords: toCamel(rows) });
  })
);

const createKeywordSchema = z.object({
  teamId: z.string(),
  text: z.string().min(1).max(200),
  keywordGroupId: z.string().nullable().optional(),
});

keywordsRouter.post(
  "/",
  requireTeamAccess((req) => req.body.teamId),
  asyncHandler(async (req, res) => {
    const body = createKeywordSchema.parse(req.body);
    const existing = await db("keywords").where({ team_id: body.teamId, text: body.text }).first();
    if (existing) return res.status(200).json({ keyword: toCamel(existing) });
    const id = newId();
    await db("keywords").insert({
      id,
      team_id: body.teamId,
      text: body.text,
      keyword_group_id: body.keywordGroupId ?? null,
      created_at: new Date(),
    });
    res.status(201).json({ keyword: toCamel(await db("keywords").where({ id }).first()) });
  })
);

// ---- 월별 검색량 ----

keywordsRouter.get(
  "/search-volume",
  requireTeamAccess((req) => req.query.teamId as string | undefined),
  asyncHandler(async (req, res) => {
    const { teamId, yearMonth } = req.query as { teamId: string; yearMonth?: string };
    let q = db("search_volume_entries as sv")
      .join("keywords as k", "k.id", "sv.keyword_id")
      .where({ "sv.team_id": teamId });
    if (yearMonth) q = q.where({ "sv.year_month": yearMonth });
    const rows = await q.select("sv.*", "k.text as keyword_text");
    res.json({ entries: toCamel(rows) });
  })
);

const volumeUpsertSchema = z.object({
  teamId: z.string(),
  keywordId: z.string(),
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  volume: z.number().int().min(0),
  source: z.enum(["MANUAL", "EXCEL"]).default("MANUAL"),
});

keywordsRouter.put(
  "/search-volume",
  requireTeamAccess((req) => req.body.teamId),
  asyncHandler(async (req, res) => {
    const body = volumeUpsertSchema.parse(req.body);
    const existing = await db("search_volume_entries")
      .where({ team_id: body.teamId, keyword_id: body.keywordId, year_month: body.yearMonth })
      .first();
    if (existing) {
      await db("search_volume_entries").where({ id: existing.id }).update({
        volume: body.volume,
        source: body.source,
        updated_at: new Date(),
      });
    } else {
      await db("search_volume_entries").insert({
        id: newId(),
        team_id: body.teamId,
        keyword_id: body.keywordId,
        year_month: body.yearMonth,
        volume: body.volume,
        source: body.source,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
    res.json({ ok: true });
  })
);
