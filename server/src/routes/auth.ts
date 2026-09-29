import { Router } from "express";
import { z } from "zod";
import { db, newId } from "../db";
import { hashPassword, verifyPassword } from "../lib/password";
import { signToken } from "../lib/jwt";
import { asyncHandler, ApiError } from "../lib/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { toCamel } from "../lib/caseConvert";

export const authRouter = Router();

const registerSchema = z.object({
  companyName: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  email: z.string().email(),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
  name: z.string().min(1),
});

/**
 * 첫 가입자는 회사를 새로 만들며 관리자(ADMIN)가 된다.
 * companyId를 지정하면 기존 회사에 일반 사용자(MEMBER)로 합류한다.
 * (실제 운영에서는 관리자가 팀원을 초대하는 흐름을 추가로 둘 수 있음 — 초기 버전은 자기등록형)
 */
authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const existing = await db("users").where({ email: body.email }).first();
    if (existing) {
      throw new ApiError(409, "EMAIL_TAKEN", "이미 사용 중인 이메일입니다.");
    }

    let companyId = body.companyId;
    let globalRole: "ADMIN" | "MEMBER" = "MEMBER";

    if (!companyId) {
      if (!body.companyName) {
        throw new ApiError(400, "COMPANY_NAME_REQUIRED", "새 회사를 만들려면 회사명이 필요합니다.");
      }
      companyId = newId();
      await db("companies").insert({ id: companyId, name: body.companyName, created_at: new Date() });
      globalRole = "ADMIN";
    } else {
      const company = await db("companies").where({ id: companyId }).first();
      if (!company) throw new ApiError(404, "COMPANY_NOT_FOUND", "회사를 찾을 수 없습니다.");
    }

    const passwordHash = await hashPassword(body.password);
    const userId = newId();
    await db("users").insert({
      id: userId,
      company_id: companyId,
      email: body.email,
      password_hash: passwordHash,
      name: body.name,
      global_role: globalRole,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const token = signToken({ userId, companyId, globalRole });
    res.status(201).json({
      token,
      user: { id: userId, companyId, email: body.email, name: body.name, globalRole },
    });
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const row = await db("users").where({ email: body.email }).first();
    if (!row) throw new ApiError(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.");
    const ok = await verifyPassword(body.password, row.password_hash);
    if (!ok) throw new ApiError(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.");

    const token = signToken({ userId: row.id, companyId: row.company_id, globalRole: row.global_role });
    const memberships = await db("team_memberships as tm")
      .join("teams as t", "t.id", "tm.team_id")
      .where({ "tm.user_id": row.id })
      .whereNull("t.deleted_at")
      .select("t.id as team_id", "t.name as team_name", "tm.role");

    res.json({
      token,
      user: {
        id: row.id,
        companyId: row.company_id,
        email: row.email,
        name: row.name,
        globalRole: row.global_role,
      },
      memberships: toCamel(memberships),
    });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const memberships = await db("team_memberships as tm")
      .join("teams as t", "t.id", "tm.team_id")
      .where({ "tm.user_id": user.id })
      .whereNull("t.deleted_at")
      .select("t.id as team_id", "t.name as team_name", "tm.role");
    res.json({ user, memberships: toCamel(memberships) });
  })
);
