import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt";
import { db } from "../db";

export interface AuthUser {
  id: string;
  companyId: string;
  globalRole: "ADMIN" | "MEMBER";
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * 서버에서 실제로 검증하는 인증 미들웨어. 프런트가 role을 어떻게 그리든
 * 여기를 통과하지 못하면 어떤 API도 실행되지 않는다.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "AUTH_REQUIRED", message: "로그인이 필요합니다." });
  }
  try {
    const payload = verifyToken(header.slice("Bearer ".length));
    const row = await db("users").where({ id: payload.userId }).first();
    if (!row) {
      return res.status(401).json({ error: "AUTH_REQUIRED", message: "사용자를 찾을 수 없습니다." });
    }
    req.user = {
      id: row.id,
      companyId: row.company_id,
      globalRole: row.global_role,
      name: row.name,
      email: row.email,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: "AUTH_INVALID", message: "인증이 만료되었거나 유효하지 않습니다." });
  }
}

export type TeamRole = "TEAM_ADMIN" | "MEMBER";

/**
 * 요청 사용자가 특정 팀에 접근 가능한지, 어떤 역할인지 서버에서 조회한다.
 * team_id를 조작한 요청도 여기서 막힌다 — 멤버십이 없으면 무조건 차단.
 */
export async function getTeamRole(userId: string, teamId: string): Promise<TeamRole | null> {
  const membership = await db("team_memberships").where({ user_id: userId, team_id: teamId }).first();
  return membership ? (membership.role as TeamRole) : null;
}

/**
 * 보안 핵심 검증: globalRole "ADMIN"은 "자기 회사의" 관리자이지, 시스템 전체 관리자가
 * 아니다. 이 함수 없이 (예전처럼) `user.globalRole === "ADMIN"`만 보고 팀 접근을
 * 허용하면, 어느 회사에서든 회원가입해 ADMIN이 된 사람이 team_id만 알면(또는 추측하면)
 * 다른 회사의 팀 데이터를 그대로 읽고 쓸 수 있는 심각한 다중 테넌트 격리 취약점이 된다.
 * 따라서 ADMIN이라도 팀이 자신의 회사 소속인지부터 반드시 확인한 뒤에만 통과시킨다.
 */
export async function isTeamAccessible(
  user: { id: string; companyId: string; globalRole: "ADMIN" | "MEMBER" },
  teamId: string
): Promise<boolean> {
  const team = await db("teams").where({ id: teamId }).first();
  if (!team || team.company_id !== user.companyId) return false;
  if (user.globalRole === "ADMIN") return true;
  const membership = await getTeamRole(user.id, teamId);
  return Boolean(membership);
}

/** 요청 바디/파라미터의 teamId 필드를 읽어 접근 권한을 검증하는 미들웨어 팩토리. */
export function requireTeamAccess(getTeamId: (req: Request) => string | undefined, opts?: { adminOnly?: boolean }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user!;
    const teamId = getTeamId(req);
    if (!teamId) {
      return res.status(400).json({ error: "TEAM_ID_REQUIRED", message: "팀 정보가 필요합니다." });
    }
    if (!(await isTeamAccessible(user, teamId))) {
      return res.status(403).json({ error: "FORBIDDEN_TEAM", message: "해당 팀에 접근 권한이 없습니다." });
    }
    if (opts?.adminOnly && user.globalRole !== "ADMIN") {
      const role = await getTeamRole(user.id, teamId);
      if (role !== "TEAM_ADMIN") {
        return res.status(403).json({ error: "FORBIDDEN_ROLE", message: "팀관리자 권한이 필요합니다." });
      }
    }
    next();
  };
}

export function requireGlobalAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.globalRole !== "ADMIN") {
    return res.status(403).json({ error: "FORBIDDEN_ADMIN", message: "관리자 권한이 필요합니다." });
  }
  next();
}
