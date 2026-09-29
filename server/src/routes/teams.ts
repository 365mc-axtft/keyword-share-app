import { Router } from "express";
import { z } from "zod";
import { db, newId } from "../db";
import { requireAuth, requireTeamAccess, getTeamRole } from "../middleware/auth";
import { asyncHandler, ApiError } from "../lib/asyncHandler";
import { toCamel } from "../lib/caseConvert";
import { recordAudit } from "../lib/audit";

export const teamsRouter = Router();
teamsRouter.use(requireAuth);

teamsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    let query = db("teams").where({ company_id: user.companyId }).whereNull("deleted_at");
    if (user.globalRole !== "ADMIN") {
      query = query
        .join("team_memberships as tm", "tm.team_id", "teams.id")
        .where("tm.user_id", user.id)
        .select("teams.*", "tm.role as my_role");
    } else {
      query = query.select("teams.*");
    }
    const rows = await query.orderBy("teams.created_at", "asc");
    res.json({ teams: toCamel(rows) });
  })
);

teamsRouter.get(
  "/deleted",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (user.globalRole !== "ADMIN") {
      throw new ApiError(403, "FORBIDDEN_ADMIN", "삭제된 팀 조회는 관리자만 가능합니다.");
    }
    const rows = await db("teams").where({ company_id: user.companyId }).whereNotNull("deleted_at");
    res.json({ teams: toCamel(rows) });
  })
);

const createTeamSchema = z.object({ name: z.string().min(1).max(100) });

teamsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = createTeamSchema.parse(req.body);
    const dup = await db("teams")
      .where({ company_id: user.companyId, name: body.name })
      .whereNull("deleted_at")
      .first();
    if (dup) throw new ApiError(409, "TEAM_NAME_TAKEN", "같은 이름의 팀이 이미 있습니다.");

    const teamId = newId();
    await db.transaction(async (trx) => {
      await trx("teams").insert({
        id: teamId,
        company_id: user.companyId,
        name: body.name,
        created_at: new Date(),
        updated_at: new Date(),
      });
      await trx("team_memberships").insert({
        id: newId(),
        user_id: user.id,
        team_id: teamId,
        role: "TEAM_ADMIN",
        joined_at: new Date(),
      });
    });
    const team = await db("teams").where({ id: teamId }).first();
    res.status(201).json({ team: toCamel(team) });
  })
);

const renameSchema = z.object({ name: z.string().min(1).max(100) });

teamsRouter.patch(
  "/:teamId",
  requireTeamAccess((req) => req.params.teamId, { adminOnly: true }),
  asyncHandler(async (req, res) => {
    const { teamId } = req.params;
    const body = renameSchema.parse(req.body);
    const team = await db("teams").where({ id: teamId }).whereNull("deleted_at").first();
    if (!team) throw new ApiError(404, "TEAM_NOT_FOUND", "팀을 찾을 수 없습니다.");

    const dup = await db("teams")
      .where({ company_id: team.company_id, name: body.name })
      .whereNull("deleted_at")
      .whereNot({ id: teamId })
      .first();
    if (dup) throw new ApiError(409, "TEAM_NAME_TAKEN", "같은 이름의 팀이 이미 있습니다.");

    await db("teams").where({ id: teamId }).update({ name: body.name, updated_at: new Date() });
    await recordAudit({
      entityType: "Team",
      entityId: teamId,
      field: "name",
      oldValue: team.name,
      newValue: body.name,
      userId: req.user!.id,
      teamId,
    });
    const updated = await db("teams").where({ id: teamId }).first();
    res.json({ team: toCamel(updated) });
  })
);

teamsRouter.delete(
  "/:teamId",
  requireTeamAccess((req) => req.params.teamId, { adminOnly: true }),
  asyncHandler(async (req, res) => {
    const { teamId } = req.params;
    const team = await db("teams").where({ id: teamId }).whereNull("deleted_at").first();
    if (!team) throw new ApiError(404, "TEAM_NOT_FOUND", "팀을 찾을 수 없습니다.");

    const activeCount = await db("teams")
      .where({ company_id: team.company_id })
      .whereNull("deleted_at")
      .count<{ count: string }[]>("id as count")
      .first();
    if (Number(activeCount?.count ?? 0) <= 1) {
      throw new ApiError(
        400,
        "LAST_ACTIVE_TEAM",
        "마지막 남은 활성 팀은 삭제할 수 없습니다. 먼저 다른 팀을 만들어 대체하세요."
      );
    }

    await db("teams").where({ id: teamId }).update({ deleted_at: new Date() });
    await recordAudit({
      entityType: "Team",
      entityId: teamId,
      field: "deletedAt",
      oldValue: null,
      newValue: new Date().toISOString(),
      userId: req.user!.id,
      teamId,
    });
    res.json({ ok: true });
  })
);

teamsRouter.post(
  "/:teamId/restore",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { teamId } = req.params;
    if (user.globalRole !== "ADMIN") {
      // 삭제된 팀은 멤버십 체크의 일반 경로(requireTeamAccess)로는 확인 불가할 수 있어
      // 복구는 관리자 전용으로 제한한다 (설명 가능한 보수적 정책).
      throw new ApiError(403, "FORBIDDEN_ADMIN", "삭제된 팀 복구는 관리자만 가능합니다.");
    }
    const team = await db("teams").where({ id: teamId, company_id: user.companyId }).first();
    if (!team) throw new ApiError(404, "TEAM_NOT_FOUND", "팀을 찾을 수 없습니다.");
    if (!team.deleted_at) return res.json({ team: toCamel(team) });

    const dup = await db("teams")
      .where({ company_id: team.company_id, name: team.name })
      .whereNull("deleted_at")
      .first();
    if (dup) {
      throw new ApiError(
        409,
        "TEAM_NAME_TAKEN",
        "같은 이름의 활성 팀이 이미 있어 복구할 수 없습니다. 먼저 이름을 바꿔주세요."
      );
    }

    await db("teams").where({ id: teamId }).update({ deleted_at: null });
    const restored = await db("teams").where({ id: teamId }).first();
    res.json({ team: toCamel(restored) });
  })
);

const defaultsSchema = z.object({
  defaultKeywordGroupId: z.string().nullable().optional(),
  defaultSearchEnv: z.enum(["MOBILE", "PC"]).nullable().optional(),
  defaultSearchTab: z.enum(["BLOG", "INTEGRATED", "BOTH"]).nullable().optional(),
});

teamsRouter.patch(
  "/:teamId/defaults",
  requireTeamAccess((req) => req.params.teamId),
  asyncHandler(async (req, res) => {
    const { teamId } = req.params;
    const body = defaultsSchema.parse(req.body);
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if ("defaultKeywordGroupId" in body) patch.default_keyword_group_id = body.defaultKeywordGroupId;
    if ("defaultSearchEnv" in body) patch.default_search_env = body.defaultSearchEnv;
    if ("defaultSearchTab" in body) patch.default_search_tab = body.defaultSearchTab;
    await db("teams").where({ id: teamId }).update(patch);
    const updated = await db("teams").where({ id: teamId }).first();
    res.json({ team: toCamel(updated) });
  })
);

// ---- 팀원 관리 ----

teamsRouter.get(
  "/:teamId/members",
  requireTeamAccess((req) => req.params.teamId),
  asyncHandler(async (req, res) => {
    const rows = await db("team_memberships as tm")
      .join("users as u", "u.id", "tm.user_id")
      .where({ "tm.team_id": req.params.teamId })
      .select("u.id", "u.name", "u.email", "tm.role", "tm.joined_at");
    res.json({ members: toCamel(rows) });
  })
);

const addMemberSchema = z.object({ email: z.string().email(), role: z.enum(["TEAM_ADMIN", "MEMBER"]).default("MEMBER") });

teamsRouter.post(
  "/:teamId/members",
  requireTeamAccess((req) => req.params.teamId, { adminOnly: true }),
  asyncHandler(async (req, res) => {
    const { teamId } = req.params;
    const body = addMemberSchema.parse(req.body);
    const team = await db("teams").where({ id: teamId }).first();
    const targetUser = await db("users").where({ email: body.email, company_id: team.company_id }).first();
    if (!targetUser) {
      throw new ApiError(404, "USER_NOT_FOUND", "같은 회사 소속의 가입된 사용자만 팀원으로 추가할 수 있습니다.");
    }
    const existing = await db("team_memberships").where({ user_id: targetUser.id, team_id: teamId }).first();
    if (existing) throw new ApiError(409, "ALREADY_MEMBER", "이미 팀원입니다.");
    await db("team_memberships").insert({
      id: newId(),
      user_id: targetUser.id,
      team_id: teamId,
      role: body.role,
      joined_at: new Date(),
    });
    res.status(201).json({ ok: true });
  })
);

teamsRouter.delete(
  "/:teamId/members/:userId",
  requireTeamAccess((req) => req.params.teamId, { adminOnly: true }),
  asyncHandler(async (req, res) => {
    await db("team_memberships").where({ team_id: req.params.teamId, user_id: req.params.userId }).delete();
    res.json({ ok: true });
  })
);
