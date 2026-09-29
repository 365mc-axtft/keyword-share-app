import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { db, newId } from "../db";
import { signToken } from "../lib/jwt";

/**
 * 다중 테넌트 격리 회귀 테스트.
 *
 * 이 세션에서 실제로 발견됐던 심각한 취약점(“ADMIN”이 시스템 전체 관리자가 아니라
 * 자기 회사만의 관리자임을 확인하지 않고 team_id/report_id 등을 그대로 신뢰하던 버그)을
 * 다시 재현해, A회사 사용자가 B회사의 조사/분석/키워드그룹/보고서에 ID만으로 접근할 수
 * 없음을 고정한다. 이 테스트가 실패하면 동일한 취약점이 재발한 것이다.
 */
describe("cross-company authorization (regression)", () => {
  const app = createApp();

  const companyA = `test-co-a-${newId()}`;
  const companyB = `test-co-b-${newId()}`;
  const userAId = `test-user-a-${newId()}`;
  const userBId = `test-user-b-${newId()}`;
  const teamAId = `test-team-a-${newId()}`;
  let keywordGroupAId: string;
  let investigationAId: string;
  let tabAnalysisAId: string;
  let reportAId: string;

  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    await db("companies").insert([
      { id: companyA, name: "테스트 A회사", created_at: new Date() },
      { id: companyB, name: "테스트 B회사", created_at: new Date() },
    ]);
    await db("users").insert([
      {
        id: userAId,
        company_id: companyA,
        email: `${userAId}@test.local`,
        password_hash: "x",
        name: "A회사 관리자",
        global_role: "ADMIN",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: userBId,
        company_id: companyB,
        email: `${userBId}@test.local`,
        password_hash: "x",
        name: "B회사 관리자",
        global_role: "ADMIN", // 핵심: B회사에서도 ADMIN이지만, A회사 데이터에는 접근 불가여야 한다.
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    await db("teams").insert({
      id: teamAId,
      company_id: companyA,
      name: "A팀",
      created_at: new Date(),
      updated_at: new Date(),
    });
    await db("team_memberships").insert({
      id: newId(),
      user_id: userAId,
      team_id: teamAId,
      role: "TEAM_ADMIN",
      joined_at: new Date(),
    });

    keywordGroupAId = newId();
    await db("keyword_groups").insert({ id: keywordGroupAId, team_id: teamAId, name: "A그룹", created_at: new Date() });

    investigationAId = newId();
    await db("investigations").insert({
      id: investigationAId,
      team_id: teamAId,
      keyword_text: "테스트키워드",
      investigation_date: "2026-01-01",
      search_environment: "MOBILE",
      tabs_requested: "BLOG",
      created_by_id: userAId,
      created_at: new Date(),
      updated_at: new Date(),
    });
    tabAnalysisAId = newId();
    await db("tab_analyses").insert({
      id: tabAnalysisAId,
      investigation_id: investigationAId,
      tab_type: "BLOG",
      status: "DRAFT",
      created_at: new Date(),
      updated_at: new Date(),
    });

    reportAId = newId();
    await db("monthly_reports").insert({
      id: reportAId,
      team_id: teamAId,
      year_month: "2026-01",
      criteria_json: JSON.stringify({ topN: 10 }),
      branch_notes_json: JSON.stringify({ text: "" }),
      review_status: "DRAFT",
      created_by_id: userAId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    tokenA = signToken({ userId: userAId, companyId: companyA, globalRole: "ADMIN" });
    tokenB = signToken({ userId: userBId, companyId: companyB, globalRole: "ADMIN" });
  });

  afterAll(async () => {
    await db("monthly_reports").where({ id: reportAId }).delete();
    await db("tab_analyses").where({ id: tabAnalysisAId }).delete();
    await db("investigations").where({ id: investigationAId }).delete();
    await db("keyword_groups").where({ id: keywordGroupAId }).delete();
    await db("team_memberships").where({ team_id: teamAId }).delete();
    await db("teams").where({ id: teamAId }).delete();
    await db("users").whereIn("id", [userAId, userBId]).delete();
    await db("companies").whereIn("id", [companyA, companyB]).delete();
    await db.destroy();
  });

  describe("B회사 ADMIN이 A회사 자원에 ID로 직접 접근을 시도하면 모두 차단된다", () => {
    it("GET /investigations/:id -> 403", async () => {
      const res = await request(app).get(`/api/investigations/${investigationAId}`).set("Authorization", `Bearer ${tokenB}`);
      expect(res.status).toBe(403);
    });

    it("POST /investigations/:id/save -> 403", async () => {
      const res = await request(app)
        .post(`/api/investigations/${investigationAId}/save`)
        .set("Authorization", `Bearer ${tokenB}`);
      expect(res.status).toBe(403);
    });

    it("GET /tab-analyses/:id -> 403", async () => {
      const res = await request(app).get(`/api/tab-analyses/${tabAnalysisAId}`).set("Authorization", `Bearer ${tokenB}`);
      expect(res.status).toBe(403);
    });

    it("DELETE /keywords/groups/:id -> 403", async () => {
      const res = await request(app)
        .delete(`/api/keywords/groups/${keywordGroupAId}`)
        .set("Authorization", `Bearer ${tokenB}`);
      expect(res.status).toBe(403);
    });

    it("GET /reports/:id -> 403", async () => {
      const res = await request(app).get(`/api/reports/${reportAId}`).set("Authorization", `Bearer ${tokenB}`);
      expect(res.status).toBe(403);
    });

    it("PATCH /reports/:id -> 403", async () => {
      const res = await request(app)
        .patch(`/api/reports/${reportAId}`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ branchNotesText: "탈취 시도" });
      expect(res.status).toBe(403);
    });

    it("POST /reports/:id/comments -> 403", async () => {
      const res = await request(app)
        .post(`/api/reports/${reportAId}/comments`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ body: "탈취 시도" });
      expect(res.status).toBe(403);
    });

    it("GET /reports/:id/export.xlsx -> 403", async () => {
      const res = await request(app)
        .get(`/api/reports/${reportAId}/export.xlsx`)
        .set("Authorization", `Bearer ${tokenB}`);
      expect(res.status).toBe(403);
    });

    it("GET /reports/:id/export.pdf -> 403", async () => {
      const res = await request(app).get(`/api/reports/${reportAId}/export.pdf`).set("Authorization", `Bearer ${tokenB}`);
      expect(res.status).toBe(403);
    });

    it("GET /reports/:id/export.json -> 403", async () => {
      const res = await request(app)
        .get(`/api/reports/${reportAId}/export.json`)
        .set("Authorization", `Bearer ${tokenB}`);
      expect(res.status).toBe(403);
    });
  });

  describe("A회사 사용자는 자기 회사 자원에 정상적으로 접근할 수 있다 (오탐 방지)", () => {
    it("GET /investigations/:id -> 200", async () => {
      const res = await request(app).get(`/api/investigations/${investigationAId}`).set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
    });

    it("GET /tab-analyses/:id -> 200", async () => {
      const res = await request(app).get(`/api/tab-analyses/${tabAnalysisAId}`).set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
    });

    it("GET /reports/:id -> 200", async () => {
      const res = await request(app).get(`/api/reports/${reportAId}`).set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
    });

    it("GET /reports/:id/export.json -> 200", async () => {
      const res = await request(app).get(`/api/reports/${reportAId}/export.json`).set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
    });
  });
});
